import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createStripeClient } from '@/lib/stripe';

// No auth required — anonymous donations are intentional. The Stripe PI must be succeeded
// and bound to the correct tournament_id via metadata, which is the only gate we need.
export async function POST(req: NextRequest) {
  let body: { tournamentId?: string; stripePaymentIntentId?: string; amountDollars?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { tournamentId, stripePaymentIntentId, amountDollars } = body;
  if (!tournamentId || !stripePaymentIntentId || !amountDollars) {
    return NextResponse.json({ error: 'tournamentId, stripePaymentIntentId, and amountDollars are required' }, { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'Payment processing not configured' }, { status: 500 });

  const stripe = await createStripeClient(stripeKey);

  let pi;
  try {
    pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
  } catch {
    return NextResponse.json({ error: 'Invalid payment reference' }, { status: 400 });
  }

  if (pi.status !== 'succeeded') {
    return NextResponse.json({ error: 'Payment has not been completed' }, { status: 402 });
  }

  // Verify this PI was created for this specific tournament (prevents cross-tournament replay)
  // Strict check: require metadata to be present and match — rejects PIs created outside normal flow
  if (pi.metadata?.tournament_id !== tournamentId) {
    return NextResponse.json({ error: 'Payment does not belong to this tournament' }, { status: 400 });
  }

  // Verify amount matches (within 1 cent)
  const expectedCents = Math.round(amountDollars * 100);
  if (Math.abs(pi.amount - expectedCents) > 1) {
    return NextResponse.json({ error: 'Payment amount mismatch' }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Idempotency: check if this PI was already recorded
  const { data: existing } = await admin
    .from('donations')
    .select('id')
    .eq('stripe_payment_intent_id', stripePaymentIntentId)
    .maybeSingle();
  if (existing) return NextResponse.json({ donationId: existing.id });

  const { data: inserted, error } = await admin.from('donations').insert({
    tournament_id: tournamentId,
    amount: amountDollars,
    stripe_payment_intent_id: stripePaymentIntentId,
  }).select('id').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ donationId: inserted.id });
}
