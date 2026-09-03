import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createStripeClient } from '@/lib/stripe';
import { promotePendingRegistration } from '@/lib/paymentPromotion';

async function getStripe() {
  return createStripeClient(process.env.STRIPE_SECRET_KEY ?? '', '2025-04-30');
}

// Tell Next.js not to parse the body — Stripe signature verification requires the raw bytes
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'STRIPE_SECRET_KEY not configured' }, { status: 500 });
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET not configured' }, { status: 500 });
  }

  const body = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';

  const stripe = await getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    if (pi.metadata?.kind === 'donation') {
      // Donations are recorded by /api/donations on the client's own success
      // callback, not promoted from a reservation — nothing for the webhook
      // to do here beyond what that route already handles.
    } else {
      // This is the source of truth: whichever of the webhook or the payer's
      // own post-payment ping (src/app/api/payments/confirm-paid) gets here
      // first does the move, and the other is a safe no-op — see
      // src/lib/paymentPromotion.ts for why there is exactly one place this
      // happens.
      const result = await promotePendingRegistration(admin, pi.id);
      if (result.error) {
        console.error('[stripe-webhook] Could not promote reservation:', pi.id, result.error);
      }

      // Fallback for a player row created the old way, before this reservation
      // model existed, still sitting at payment_status 'pending' against this
      // exact PaymentIntent. Harmless no-op for every payment created after
      // this shipped, since those are inserted already 'paid' at promotion.
      const { data: legacyUpdated, error: legacyErr } = await admin
        .from('players')
        .update({ payment_status: 'paid' })
        .eq('stripe_payment_intent_id', pi.id)
        .neq('payment_status', 'paid')
        .select('id');
      if (legacyErr) {
        console.error('[stripe-webhook] Failed to update legacy payment_status paid:', legacyErr.message);
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
      }

      // Nothing recognized this payment at all: not a reservation to promote,
      // not a legacy pending row. Money taken, nobody in the tournament, and
      // before any of this existed that would say nothing. Log it loudly; the
      // director's Payments tab reconciles the same gap and can recover it.
      if (!result.promoted && !result.alreadyDone && (legacyUpdated?.length ?? 0) === 0) {
        console.error(
          '[stripe-webhook] UNRECONCILED: succeeded payment has no reservation or registration —',
          `payment_intent=${pi.id}`,
          `tournament_id=${pi.metadata?.tournament_id ?? 'unknown'}`,
          `amount=${pi.amount}`,
          `email=${pi.metadata?.registrant_email ?? 'unknown'}`,
        );
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object;
    const { error } = await admin
      .from('players')
      .update({ payment_status: 'failed' })
      .eq('stripe_payment_intent_id', pi.id);
    if (error) {
      console.error('[stripe-webhook] Failed to update payment_status failed:', error.message);
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
    }
    // Best-effort: records why an open reservation didn't go through, so the
    // Players tab's abandoned-attempt list can say "declined" instead of just
    // "never finished". Not fatal — the reservation staying blank just means
    // that detail is missing, not that anything is lost.
    await admin
      .from('pending_registrations')
      .update({ last_stripe_status: 'payment_failed', updated_at: new Date().toISOString() })
      .eq('stripe_payment_intent_id', pi.id);
  }

  if (event.type === 'payment_intent.canceled') {
    const pi = event.data.object;
    const { error } = await admin
      .from('players')
      .update({ payment_status: 'failed' })
      .eq('stripe_payment_intent_id', pi.id);
    if (error) {
      console.error('[stripe-webhook] Failed to update payment_status canceled:', error.message);
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
    }
    await admin
      .from('pending_registrations')
      .update({ last_stripe_status: 'canceled', updated_at: new Date().toISOString() })
      .eq('stripe_payment_intent_id', pi.id);
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (piId) {
      const { error } = await admin
        .from('players')
        .update({ payment_status: 'refunded' as 'failed' })
        .eq('stripe_payment_intent_id', piId);
      if (error) {
        console.error('[stripe-webhook] Failed to update payment_status refunded:', error.message);
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
