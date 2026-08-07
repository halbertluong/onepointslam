import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  // Auth required — unauthenticated callers cannot mint PaymentIntents
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { tournamentId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { tournamentId } = body;
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });

  // Look up the fee server-side — never trust caller-supplied amounts
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('settings, status, tenants(platform_fee, stripe_connect_account_id)')
    .eq('id', tournamentId)
    .single();

  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
  if ((tournament as Record<string, unknown>).status !== 'registration_open') {
    return NextResponse.json({ error: 'Registration is not open for this tournament' }, { status: 400 });
  }

  const settings = tournament.settings as Record<string, unknown> | null;
  const entranceFee = (settings?.ticketPriceForFundraiser as number) ?? 0;

  if (entranceFee <= 0) {
    return NextResponse.json({ error: 'This tournament has no entry fee' }, { status: 400 });
  }

  const tenantRaw = tournament.tenants as { platform_fee?: number; stripe_connect_account_id?: string } | null;
  const platformFee = (settings?.systemTechFee as number) ?? tenantRaw?.platform_fee ?? 0;
  const totalCents = Math.round((entranceFee + platformFee) * 100);
  const tenantConnectAccountId = tenantRaw?.stripe_connect_account_id ?? undefined;
  const applicationFeeCents = tenantConnectAccountId ? Math.round(platformFee * 100) : 0;

  try {
    const { createPaymentIntent } = await import('@/lib/stripe');
    const result = await createPaymentIntent(totalCents, tenantConnectAccountId, applicationFeeCents);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment setup failed';
    console.error('[create-intent]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
