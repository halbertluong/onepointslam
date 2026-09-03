import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { verifyDirector } from '@/lib/registrationAccess';
import { reconcile, toStripePayment, type RecordedPayment, type StripePayment } from '@/lib/reconciliation';

/** Stripe's search index lags new payments by up to a minute; listing doesn't. */
const PAGE = 100;
const MAX_PAGES = 5;

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Director (or super admin) check for the tournament, plus the tournament row. */
async function authorize(tournamentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, tenant_id')
    .eq('id', tournamentId)
    .single();
  if (!tournament) return { error: 'Tournament not found', status: 404 as const };
  const check = await verifyDirector(supabase, user?.id, tournament.tenant_id);
  if (!check.ok) return { error: check.error, status: check.status };
  return { tournament };
}

/**
 * Every PaymentIntent Stripe holds for this tournament.
 *
 * Search filters server-side but runs on an index that trails new payments by
 * up to a minute — precisely the payments most likely to have gone missing. So
 * list recent intents too and merge: whichever source saw it, we see it.
 */
async function fetchStripePayments(stripe: Awaited<ReturnType<typeof import('@/lib/stripe').createStripeClient>>, tournamentId: string): Promise<StripePayment[]> {
  const byId = new Map<string, StripePayment>();

  try {
    let page: string | undefined;
    for (let i = 0; i < MAX_PAGES; i++) {
      const res = await stripe.paymentIntents.search({
        query: `metadata['tournament_id']:'${tournamentId}'`,
        limit: PAGE,
        ...(page ? { page } : {}),
      });
      for (const pi of res.data) byId.set(pi.id, toStripePayment(pi));
      if (!res.has_more || !res.next_page) break;
      page = res.next_page;
    }
  } catch {
    // Search is unavailable on some accounts; the listing below still covers it.
  }

  let startingAfter: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await stripe.paymentIntents.list({
      limit: PAGE,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const pi of res.data) {
      if (pi.metadata?.tournament_id === tournamentId) byId.set(pi.id, toStripePayment(pi));
    }
    if (!res.has_more || res.data.length === 0) break;
    startingAfter = res.data[res.data.length - 1].id;
  }

  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** What the database says it has taken for this tournament. */
async function fetchRecorded(tournamentId: string): Promise<RecordedPayment[]> {
  const db = admin();
  const [{ data: players }, { data: donations }] = await Promise.all([
    db.from('players').select('full_name, email, stripe_payment_intent_id').eq('tournament_id', tournamentId),
    db.from('donations').select('amount, stripe_payment_intent_id').eq('tournament_id', tournamentId),
  ]);

  const rows: RecordedPayment[] = [];
  for (const p of players ?? []) {
    // Offline and comped entries have no PaymentIntent — there is no Stripe
    // payment for them to match, so they are not part of this check.
    if (!p.stripe_payment_intent_id) continue;
    rows.push({ paymentIntentId: p.stripe_payment_intent_id, kind: 'registration', label: p.full_name ?? p.email ?? 'Registrant' });
  }
  for (const d of donations ?? []) {
    if (!d.stripe_payment_intent_id) continue;
    rows.push({ paymentIntentId: d.stripe_payment_intent_id, kind: 'donation', label: `Donation of $${d.amount}` });
  }
  return rows;
}

/** GET /api/payments/reconcile?tournamentId=… — what Stripe took vs what we recorded. */
export async function GET(req: NextRequest) {
  const tournamentId = req.nextUrl.searchParams.get('tournamentId');
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });

  const auth = await authorize(tournamentId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'Payment processing not configured' }, { status: 500 });

  const { createStripeClient } = await import('@/lib/stripe');
  const stripe = await createStripeClient(stripeKey, '2025-04-30');

  let stripePayments: StripePayment[];
  try {
    stripePayments = await fetchStripePayments(stripe, tournamentId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not reach Stripe';
    console.error('[reconcile]', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const report = reconcile(stripePayments, await fetchRecorded(tournamentId));
  return NextResponse.json({ tournamentName: auth.tournament.name, ...report });
}

/**
 * POST /api/payments/reconcile — take an orphaned payment and give it the row
 * it never got, so the payer ends up in the tournament they paid for.
 */
export async function POST(req: NextRequest) {
  let body: { tournamentId?: string; paymentIntentId?: string; fullName?: string; email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { tournamentId, paymentIntentId } = body;
  if (!tournamentId || !paymentIntentId) {
    return NextResponse.json({ error: 'tournamentId and paymentIntentId are required' }, { status: 400 });
  }

  const auth = await authorize(tournamentId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'Payment processing not configured' }, { status: 500 });

  const { createStripeClient } = await import('@/lib/stripe');
  const stripe = await createStripeClient(stripeKey, '2025-04-30');

  // Re-verify against Stripe rather than trusting the report the browser saw:
  // this writes a paid registration, so it holds to the same bar as checkout.
  let pi;
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    return NextResponse.json({ error: 'Invalid payment reference' }, { status: 400 });
  }
  if (pi.status !== 'succeeded') {
    return NextResponse.json({ error: 'That payment did not succeed, so there is nothing to recover.' }, { status: 400 });
  }
  if (pi.metadata?.tournament_id !== tournamentId) {
    return NextResponse.json({ error: 'That payment belongs to a different tournament.' }, { status: 400 });
  }

  const db = admin();
  const isDonation = pi.metadata?.kind === 'donation';

  if (isDonation) {
    const { data: existing } = await db
      .from('donations').select('id').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle();
    if (existing) return NextResponse.json({ donationId: existing.id, alreadyRecorded: true });

    const { data: inserted, error } = await db.from('donations').insert({
      tournament_id: tournamentId,
      amount: pi.amount / 100,
      stripe_payment_intent_id: paymentIntentId,
    }).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ donationId: inserted.id });
  }

  const fullName = (body.fullName ?? pi.metadata?.registrant_name ?? '').trim();
  const email = (body.email ?? pi.metadata?.registrant_email ?? '').trim();
  if (!fullName || !email) {
    return NextResponse.json(
      { error: 'This payment carries no registrant name or email, so one must be supplied.', needsDetails: true },
      { status: 422 },
    );
  }

  const { data: byPi } = await db
    .from('players').select('id').eq('stripe_payment_intent_id', paymentIntentId).maybeSingle();
  if (byPi) return NextResponse.json({ playerId: byPi.id, alreadyRecorded: true });

  // The payer may have got in by another route since — link the payment to the
  // row they already have rather than creating a duplicate entrant.
  const { data: byEmail } = await db
    .from('players').select('id, stripe_payment_intent_id')
    .eq('tournament_id', tournamentId).eq('email', email).maybeSingle();
  if (byEmail) {
    if (byEmail.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'That email is already registered against a different payment.' }, { status: 409 });
    }
    const { error } = await db.from('players')
      .update({ stripe_payment_intent_id: paymentIntentId, payment_status: 'paid' })
      .eq('id', byEmail.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ playerId: byEmail.id, linkedExisting: true });
  }

  const { data: inserted, error } = await db.from('players').insert({
    tournament_id: tournamentId,
    full_name: fullName,
    email,
    status: 'registered',
    payment_status: 'paid',
    stripe_payment_intent_id: paymentIntentId,
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ playerId: inserted.id });
}
