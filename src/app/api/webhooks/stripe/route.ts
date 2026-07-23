import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Must be imported dynamically to avoid issues with Edge / Node runtime differences
async function getStripe() {
  const { default: Stripe } = await import('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiVersion: '2025-04-30' as any,
  });
}

// Tell Next.js not to parse the body — Stripe signature verification requires the raw bytes
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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
    await admin
      .from('players')
      .update({ payment_status: 'paid' })
      .eq('stripe_payment_intent_id', pi.id);
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object;
    await admin
      .from('players')
      .update({ payment_status: 'failed' })
      .eq('stripe_payment_intent_id', pi.id);
  }

  return NextResponse.json({ received: true });
}
