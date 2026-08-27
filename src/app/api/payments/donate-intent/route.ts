import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createPaymentIntent } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  let body: { amountCents?: number; tournamentId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { amountCents, tournamentId } = body;
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
  if (!amountCents || amountCents < 50) {
    return NextResponse.json({ error: 'Minimum donation is $0.50' }, { status: 400 });
  }
  if (amountCents > 1_000_000) {
    return NextResponse.json({ error: 'Donation exceeds maximum allowed amount' }, { status: 400 });
  }

  // Tag the tenant so this donation can be reconciled in the shared Stripe account
  const supabase = await createClient();
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('tenant_id, tenants(display_name)')
    .eq('id', tournamentId)
    .single();
  const tenantRaw = tournament?.tenants as { display_name?: string } | null;

  try {
    const result = await createPaymentIntent(amountCents, {
      tournament_id: tournamentId,
      ...(tournament?.tenant_id ? { tenant_id: tournament.tenant_id as string } : {}),
      ...(tenantRaw?.display_name ? { tenant_name: tenantRaw.display_name } : {}),
      kind: 'donation',
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment setup failed';
    console.error('[donate-intent]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
