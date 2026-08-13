import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { registrationIsOpen, verifyDirector } from '@/lib/registrationAccess';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Allow unauthenticated (guest) registrations — user may be null

  let body: {
    tournamentId?: string;
    fullName?: string;
    email?: string;
    gender?: string;
    ntrp?: string;
    utr?: string;
    age?: string;
    skillTier?: string;
    stripePaymentIntentId?: string;
    /** Set by the director dashboard to add a player at the desk. Authorization
     *  is verified server-side below — the flag alone grants nothing. */
    directorEntry?: boolean;
    /** Director entry only: whether the entry fee was collected offline. */
    markPaid?: boolean;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { tournamentId, fullName, email, gender, ntrp, utr, age, skillTier, stripePaymentIntentId } = body;
  if (!tournamentId || !fullName || !email) {
    return NextResponse.json({ error: 'tournamentId, fullName, and email are required' }, { status: 400 });
  }

  // Look up tournament fee server-side
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('settings, status, tenant_id')
    .eq('id', tournamentId)
    .single();

  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

  const settings = tournament.settings as Record<string, unknown> | null;
  const entranceFee = (settings?.ticketPriceForFundraiser as number) ?? 0;

  // A director acting from the dashboard may register a player the public
  // couldn't — after registration closed, or with the fee collected offline —
  // so the claim is verified against the session rather than trusted.
  let isDirector = false;
  if (body.directorEntry) {
    const check = await verifyDirector(supabase, user?.id, tournament.tenant_id);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
    isDirector = true;
  }

  // Directors can add players right up until the tournament is finished.
  const allowed = registrationIsOpen(tournament.status, settings)
    || (isDirector && tournament.status !== 'completed');
  if (!allowed) {
    return NextResponse.json({ error: 'Registration is not open' }, { status: 400 });
  }

  // Verify payment when a fee applies
  let paymentStatus: 'pending' | 'paid' = 'pending';
  let verifiedPaymentIntentId: string | null = null;

  // A card payment is verified the same way no matter who took it — a director
  // collecting at the desk gets no shortcut around Stripe. Only a director
  // submitting without a payment at all may settle the fee offline.
  if (entranceFee > 0 && !stripePaymentIntentId) {
    if (!isDirector) {
      return NextResponse.json({ error: 'Payment required for this tournament' }, { status: 402 });
    }
    paymentStatus = body.markPaid ? 'paid' : 'pending';
  } else if (entranceFee <= 0) {
    if (isDirector) paymentStatus = body.markPaid ? 'paid' : 'pending';
  } else {

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json({ error: 'Payment processing not configured' }, { status: 500 });
    }

    // Verify the PaymentIntent server-side via Stripe API
    const { default: Stripe } = await import('stripe');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new Stripe(stripeKey, { apiVersion: '2025-04-30' as any });

    let pi;
    try {
      pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId!);
    } catch {
      return NextResponse.json({ error: 'Invalid payment reference' }, { status: 400 });
    }

    if (pi.status !== 'succeeded') {
      return NextResponse.json({ error: 'Payment has not been completed' }, { status: 402 });
    }

    // Verify this PI was minted for this specific tournament (prevents cross-tournament reuse)
    if (pi.metadata?.tournament_id !== tournamentId) {
      return NextResponse.json({ error: 'Payment does not belong to this tournament' }, { status: 400 });
    }

    // Verify the amount matches the tournament fee (within 1 cent tolerance for rounding)
    const platformFee = (settings?.systemTechFee as number) ?? 0;
    const expectedCents = Math.round((entranceFee + platformFee) * 100);
    if (Math.abs(pi.amount - expectedCents) > 1) {
      console.error(`[registrations] PI amount mismatch: got ${pi.amount}, expected ${expectedCents}`);
      return NextResponse.json({ error: 'Payment amount does not match tournament fee' }, { status: 400 });
    }

    paymentStatus = 'paid';
    verifiedPaymentIntentId = stripePaymentIntentId!;
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Duplicate check (before cap check — returning registrant gets accurate error)
  const { data: existing } = await admin
    .from('players')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('email', email)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: 'This email is already registered for this tournament.' }, { status: 409 });

  // PI reuse check — prevent one payment from registering multiple accounts
  if (verifiedPaymentIntentId) {
    const { data: piUsed } = await admin
      .from('players')
      .select('id')
      .eq('stripe_payment_intent_id', verifiedPaymentIntentId)
      .maybeSingle();
    if (piUsed) return NextResponse.json({ error: 'Payment has already been used for a registration.' }, { status: 409 });
  }

  // Explicit cap check (service-role bypasses RLS)
  const playerCap = (settings?.playerRegistrationCap as number) ?? null;
  if (playerCap !== null) {
    const { count } = await admin
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .neq('status', 'no_show_eliminated');
    if ((count ?? 0) >= playerCap) {
      return NextResponse.json({ error: 'Registration is full' }, { status: 409 });
    }
  }

  const { data: inserted, error: insertErr } = await admin.from('players').insert({
    tournament_id: tournamentId,
    full_name: fullName,
    email,
    skill_tier: skillTier ?? null,
    gender: gender || null,
    ntrp_rating: ntrp ? parseFloat(ntrp) : null,
    utr_rating: utr ? parseFloat(utr) : null,
    age: age ? parseInt(age) : null,
    status: 'registered',
    user_id: user?.id ?? null,
    payment_status: paymentStatus,
    stripe_payment_intent_id: verifiedPaymentIntentId,
  }).select('id').single();

  if (insertErr) {
    if (insertErr.code === '23505') return NextResponse.json({ error: 'This email is already registered.' }, { status: 409 });
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Fire-and-forget: send confirmation email
  fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/api/email/registration-confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
    },
    body: JSON.stringify({ to: email, playerId: inserted?.id, tournamentId }),
  }).catch(() => {});

  // Close registration if cap reached
  if (playerCap !== null) {
    const { count: newCount } = await admin
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .neq('status', 'no_show_eliminated');
    if ((newCount ?? 0) >= playerCap) {
      await admin
        .from('tournaments')
        .update({ status: 'registration_closed', registration_close_reason: 'cap_reached' })
        .eq('id', tournamentId);
    }
  }

  return NextResponse.json({ playerId: inserted?.id });
}
