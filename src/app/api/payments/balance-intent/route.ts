import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { verifyDirector } from '@/lib/registrationAccess';
import { createPaymentIntent } from '@/lib/stripe';

const STRIPE_MIN_CHARGE_CENTS = 50;

/**
 * Director-only: starts a Stripe payment for a player's outstanding add-on
 * balance (bought 2nd serves, buy-backs). The amount is always summed
 * server-side from the unsettled charges — never taken from the caller.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let body: { tournamentId?: string; playerId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { tournamentId, playerId } = body;
  if (!tournamentId || !playerId) return NextResponse.json({ error: 'tournamentId and playerId are required' }, { status: 400 });

  const { data: tournament } = await supabase
    .from('tournaments').select('tenant_id, tenants(display_name)').eq('id', tournamentId).single();
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

  const check = await verifyDirector(supabase, user?.id, tournament.tenant_id as string);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const db = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const [{ data: player }, { data: charges }] = await Promise.all([
    db.from('players').select('full_name, email').eq('id', playerId).eq('tournament_id', tournamentId).maybeSingle(),
    db.from('player_charges').select('amount_cents').eq('tournament_id', tournamentId).eq('player_id', playerId).is('settled_at', null),
  ]);
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

  const totalCents = (charges ?? []).reduce((sum, c) => sum + (c.amount_cents as number), 0);
  if (totalCents < STRIPE_MIN_CHARGE_CENTS) {
    return NextResponse.json(
      { error: 'Stripe needs a balance of at least $0.50 — record this one as cash, check, or a donation instead.' },
      { status: 400 },
    );
  }

  try {
    const tenantRaw = tournament.tenants as unknown as { display_name?: string } | null;
    const result = await createPaymentIntent(totalCents, {
      kind: 'balance',
      tenant_id: tournament.tenant_id as string,
      tenant_name: tenantRaw?.display_name ?? '',
      tournament_id: tournamentId,
      player_id: playerId,
      registrant_name: player.full_name as string,
      registrant_email: player.email as string,
    });
    return NextResponse.json({ ...result, amountCents: totalCents });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment setup failed';
    console.error('[balance-intent]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
