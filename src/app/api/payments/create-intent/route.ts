import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { registrationIsOpen, verifyDirector } from '@/lib/registrationAccess';
import { couponsEnabled, releasePendingCoupon } from '@/lib/coupons';

// Stripe requires a minimum charge (~$0.50 USD) for a PaymentIntent. A coupon
// that would otherwise zero out (or nearly zero out) the total still goes
// through Stripe rather than becoming a free registration — clamping here
// keeps the payment flow's existing free-vs-paid branch (decided up front from
// the tournament's entrance fee, before any coupon is known) untouched.
const STRIPE_MIN_CHARGE_CENTS = 50;

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  // Auth optional — guests may pay entry fees too. The amount and tournament are
  // derived server-side, so unauthenticated PI creation is safe here.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let body: {
    tournamentId?: string; directorEntry?: boolean;
    fullName?: string; email?: string;
    gender?: string; ntrp?: string; utr?: string; age?: string; skillTier?: string;
    couponCode?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { tournamentId, fullName, email } = body;
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
  if (!fullName?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'fullName and email are required' }, { status: 400 });
  }

  // Look up the fee server-side — never trust caller-supplied amounts
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('settings, status, tenant_id, tenants(display_name, platform_fee)')
    .eq('id', tournamentId)
    .single();

  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

  const status = (tournament as Record<string, unknown>).status as string;
  const settings = tournament.settings as Record<string, unknown> | null;
  const entranceFee = (settings?.ticketPriceForFundraiser as number) ?? 0;

  // A director taking payment from the dashboard can charge after the public
  // link has closed; everyone else is held to the same gate as the sign-up form
  // so a registrant can never get through the form only to fail at payment.
  let isDirector = false;
  if (body.directorEntry) {
    const check = await verifyDirector(supabase, user?.id, (tournament as Record<string, unknown>).tenant_id as string);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
    isDirector = true;
  }

  if (!registrationIsOpen(status, settings) && !(isDirector && status !== 'completed')) {
    return NextResponse.json({ error: 'Registration is not open for this tournament' }, { status: 400 });
  }

  if (entranceFee <= 0) {
    return NextResponse.json({ error: 'This tournament has no entry fee' }, { status: 400 });
  }

  const db = admin();

  // Already a confirmed registrant — reject before reserving a payment intent
  // for someone who is already in the tournament.
  const { data: existingPlayer } = await db
    .from('players').select('id').eq('tournament_id', tournamentId).eq('email', email).maybeSingle();
  if (existingPlayer) {
    return NextResponse.json({ error: 'This email is already registered for this tournament.' }, { status: 409 });
  }

  // Cap counts seated players and payments already in flight together, so a
  // full tournament can't hand out more payment intents than it has room for
  // — closing the gap where someone used to be able to pay first and only
  // then discover, at the old insert-after-payment step, that the cap beat
  // them to it. A retrying payer's own still-open attempt doesn't count
  // against themselves.
  const playerCap = (settings?.playerRegistrationCap as number) ?? null;
  if (playerCap !== null) {
    const [{ count: seated }, { count: inFlight }] = await Promise.all([
      db.from('players').select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId).neq('status', 'no_show_eliminated'),
      db.from('pending_registrations').select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId).neq('email', email),
    ]);
    if ((seated ?? 0) + (inFlight ?? 0) >= playerCap) {
      return NextResponse.json({ error: 'Registration is full' }, { status: 409 });
    }
  }

  const tenantRaw = tournament.tenants as { display_name?: string; platform_fee?: number } | null;
  const platformFee = (settings?.systemTechFee as number) ?? tenantRaw?.platform_fee ?? 0;
  const tenantId = (tournament as Record<string, unknown>).tenant_id as string;

  // Reserve the coupon's use now, right before it determines the amount to
  // charge — a single atomic UPDATE (see redeem_coupon), so two concurrent
  // registrants can't both be quoted a discount only one of them can actually
  // have. Reserved even though this attempt might still fail below; every
  // failure path after this point releases it again.
  let couponId: string | undefined;
  let discountCents = 0;
  if (body.couponCode?.trim() && couponsEnabled(settings)) {
    const { data: redeemed, error: redeemErr } = await db.rpc('redeem_coupon', {
      p_tournament_id: tournamentId,
      p_code: body.couponCode.trim(),
    });
    if (redeemErr) return NextResponse.json({ error: 'Could not apply this coupon code. Please try again.' }, { status: 500 });
    const row = (redeemed as { id: string; discount_cents: number }[] | null)?.[0];
    if (!row) return NextResponse.json({ error: 'This coupon code is invalid or has been fully redeemed.' }, { status: 400 });
    couponId = row.id;
    discountCents = row.discount_cents;
  }

  const totalCents = Math.max(
    Math.round((entranceFee + platformFee) * 100) - discountCents,
    STRIPE_MIN_CHARGE_CENTS,
  );

  const { createPaymentIntent, createStripeClient } = await import('@/lib/stripe');

  let result;
  try {
    // Metadata is what makes one shared Stripe account reconcilable across every
    // tenant — it's how a charge in the Stripe dashboard gets tied back to the
    // school, tournament, and registrant it belongs to.
    result = await createPaymentIntent(totalCents, {
      tenant_id: tenantId,
      tenant_name: tenantRaw?.display_name ?? '',
      tournament_id: tournamentId,
      registrant_name: fullName,
      registrant_email: email,
      ...(user ? { user_id: user.id } : {}),
      ...(isDirector ? { director_entry: 'true' } : {}),
    });
  } catch (err) {
    if (couponId) await db.rpc('release_coupon', { p_coupon_id: couponId });
    const message = err instanceof Error ? err.message : 'Payment setup failed';
    console.error('[create-intent]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Local dev only: no STRIPE_SECRET_KEY, so nothing was really charged and
  // there's no reservation to write. Never happens in production —
  // createPaymentIntent throws there instead of mocking. The reserved coupon
  // use (if any) is left spent — there's no pending_registrations row for it
  // to hang a later release off, same asymmetry as everywhere else this mock
  // path is documented.
  if (result.mock) return NextResponse.json({ ...result, amountCents: totalCents, discountCents });

  // A retry by the same person reuses this row (unique on tournament+email).
  // If an earlier attempt is still sitting here pointing at a different
  // PaymentIntent, cancel that one first — otherwise an abandoned first
  // attempt could still be paid later (a saved card, a second tab) and
  // double-charge them for the same entry.
  const { data: existingPending } = await db
    .from('pending_registrations').select('id, stripe_payment_intent_id')
    .eq('tournament_id', tournamentId).eq('email', email).maybeSingle();
  if (existingPending && existingPending.stripe_payment_intent_id !== result.paymentIntentId) {
    try {
      const stripe = await createStripeClient(process.env.STRIPE_SECRET_KEY!);
      await stripe.paymentIntents.cancel(existingPending.stripe_payment_intent_id);
    } catch {
      // Already paid, already canceled, or too far along to cancel — none of
      // that should block writing the new reservation below.
    }
    // That abandoned attempt may have reserved a coupon use of its own —
    // it's being replaced by this new reservation, so give it back.
    await releasePendingCoupon(db, { id: existingPending.id });
  }

  const { error: upsertErr } = await db.from('pending_registrations').upsert({
    tournament_id: tournamentId,
    full_name: fullName,
    email,
    gender: body.gender || null,
    ntrp_rating: body.ntrp ? parseFloat(body.ntrp) : null,
    utr_rating: body.utr ? parseFloat(body.utr) : null,
    age: body.age ? parseInt(body.age) : null,
    skill_tier: body.skillTier || null,
    stripe_payment_intent_id: result.paymentIntentId,
    user_id: user?.id ?? null,
    last_stripe_status: null,
    coupon_id: couponId ?? null,
    discount_cents: couponId ? discountCents : null,
    coupon_released: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'tournament_id,email' });

  if (upsertErr) {
    // The reservation didn't stick — cancel the intent rather than leave a
    // payable PaymentIntent with nothing behind it if the payer proceeds anyway.
    try {
      const stripe = await createStripeClient(process.env.STRIPE_SECRET_KEY!);
      await stripe.paymentIntents.cancel(result.paymentIntentId);
    } catch { /* best effort */ }
    if (couponId) await db.rpc('release_coupon', { p_coupon_id: couponId });
    console.error('[create-intent] Failed to reserve pending registration:', upsertErr.message);
    return NextResponse.json({ error: 'Could not start registration. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ...result, amountCents: totalCents, discountCents });
}
