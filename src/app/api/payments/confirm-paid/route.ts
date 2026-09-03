import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { promotePendingRegistration } from '@/lib/paymentPromotion';

/**
 * The payer's own fast path: called right after Stripe confirms their card
 * succeeded, so the director's Players tab shows them as paid within
 * moments rather than waiting on webhook delivery. The webhook is what
 * actually guarantees this happens — this is purely a latency shortcut, and
 * safe to skip or fail silently, which is exactly how the client calls it.
 *
 * No auth: a guest who just paid has no session. Safe to leave open because
 * the only thing a caller can do is re-affirm, for a PaymentIntent id they
 * already hold (a long, Stripe-generated, effectively unguessable string),
 * something this route independently verifies with Stripe before acting on.
 * Knowing the id proves nothing on its own; Stripe reporting it succeeded is
 * what authorizes the move.
 */
export async function POST(req: NextRequest) {
  let body: { paymentIntentId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { paymentIntentId } = body;
  if (!paymentIntentId) return NextResponse.json({ error: 'paymentIntentId is required' }, { status: 400 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'Payment processing not configured' }, { status: 500 });

  const { createStripeClient } = await import('@/lib/stripe');
  const stripe = await createStripeClient(stripeKey);

  let pi;
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    return NextResponse.json({ error: 'Invalid payment reference' }, { status: 400 });
  }
  if (pi.status !== 'succeeded') {
    return NextResponse.json({ error: 'That payment has not succeeded yet.' }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const result = await promotePendingRegistration(admin, paymentIntentId);
  if (result.error) {
    console.error('[confirm-paid]', paymentIntentId, result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ promoted: result.promoted, alreadyDone: result.alreadyDone, playerId: result.playerId ?? null });
}
