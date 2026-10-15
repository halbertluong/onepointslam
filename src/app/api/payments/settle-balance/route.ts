import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { verifyDirector } from '@/lib/registrationAccess';
import { settleBalanceCharges } from '@/lib/balances';

/**
 * Director-only latency shortcut after a balance payment succeeds in the
 * browser: verifies the PaymentIntent with Stripe, then settles the charges.
 * The Stripe webhook does the same thing and is the source of truth.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let body: { paymentIntentId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.paymentIntentId) return NextResponse.json({ error: 'paymentIntentId is required' }, { status: 400 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: 'Payment processing not configured' }, { status: 500 });

  const { createStripeClient } = await import('@/lib/stripe');
  const stripe = await createStripeClient(stripeKey);
  let pi;
  try { pi = await stripe.paymentIntents.retrieve(body.paymentIntentId); }
  catch { return NextResponse.json({ error: 'Invalid payment reference' }, { status: 400 }); }
  if (pi.status !== 'succeeded') return NextResponse.json({ error: 'That payment has not succeeded yet.' }, { status: 400 });

  const tournamentId = pi.metadata?.tournament_id;
  if (pi.metadata?.kind !== 'balance' || !tournamentId) {
    return NextResponse.json({ error: 'That is not a balance payment.' }, { status: 400 });
  }

  const { data: tournament } = await supabase.from('tournaments').select('tenant_id').eq('id', tournamentId).single();
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
  const check = await verifyDirector(supabase, user?.id, tournament.tenant_id as string);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const result = await settleBalanceCharges(admin, pi);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ settled: result.settled });
}
