import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  addOnEnabled,
  priceCentsForPurchase,
  priorPurchaseCount,
  SERVE_KINDS,
  type ServeKind,
} from '@/lib/addOns';
import type { PlayerCharge } from '@/types';

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Loads the match and confirms the caller works this tournament (referee, its director, or a super admin). */
async function authorize(matchId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated', status: 401 as const };

  const db = admin();
  const [{ data: appUser }, { data: match }] = await Promise.all([
    db.from('users').select('role, assigned_tenant_ids').eq('id', user.id).single(),
    db.from('matches').select('id, tournament_id, player1_id, player2_id, status, winner_id, tournaments(tenant_id, settings)').eq('id', matchId).maybeSingle(),
  ]);
  if (!match) return { error: 'Match not found', status: 404 as const };

  const tournament = match.tournaments as unknown as { tenant_id: string; settings: Record<string, unknown> | null } | null;
  const role = appUser?.role ?? '';
  const allowed =
    role === 'super_admin' ||
    (['tenant_admin', 'referee'].includes(role) && (appUser?.assigned_tenant_ids ?? []).includes(tournament?.tenant_id));
  if (!allowed || !tournament) return { error: 'Forbidden', status: 403 as const };

  return { db, match, settings: tournament.settings ?? {} };
}

type ChargeRow = { player_id: string; kind: string; match_id: string | null };

/**
 * GET — what a referee needs to show the serve-purchase buttons: what has
 * already been bought for this match, and what each of the two players would
 * pay for a 2nd or 3rd serve right now.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const auth = await authorize(matchId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { db, match, settings } = auth;

  const { data: rows } = await db
    .from('player_charges')
    .select('player_id, kind, match_id')
    .eq('tournament_id', match.tournament_id)
    .in('kind', [...SERVE_KINDS]);
  const charges = (rows ?? []) as ChargeRow[];
  const asCharges = charges.map((c) => ({ playerId: c.player_id, kind: c.kind })) as Pick<PlayerCharge, 'playerId' | 'kind'>[];

  const quotes: Record<string, Partial<Record<ServeKind, number>>> = {};
  for (const pid of [match.player1_id, match.player2_id]) {
    if (!pid || pid === 'BYE') continue;
    quotes[pid] = {};
    for (const kind of SERVE_KINDS) {
      if (addOnEnabled(settings, kind)) quotes[pid][kind] = priceCentsForPurchase(settings, kind, priorPurchaseCount(asCharges, pid, kind));
    }
  }
  const purchases = charges
    .filter((c) => c.match_id === matchId)
    .map((c) => ({ playerId: c.player_id, kind: c.kind as ServeKind }));

  return NextResponse.json({ quotes, purchases });
}

/**
 * POST { playerId, kind } — records a bought 2nd or 3rd serve. The price is
 * worked out here from the player's own purchase history; the caller never
 * supplies an amount. A 3rd serve needs the same player's 2nd serve already
 * bought in this match.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const auth = await authorize(matchId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { db, match, settings } = auth;

  let body: { playerId?: string; kind?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { playerId, kind } = body;
  if (!playerId || !kind || !(SERVE_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: 'playerId and a serve kind are required' }, { status: 400 });
  }
  const serveKind = kind as ServeKind;

  if (match.winner_id || match.status === 'finalized' || match.status === 'walkover') {
    return NextResponse.json({ error: 'This match is already decided.' }, { status: 409 });
  }
  if (playerId !== match.player1_id && playerId !== match.player2_id) {
    return NextResponse.json({ error: 'That player is not in this match.' }, { status: 400 });
  }
  if (!addOnEnabled(settings, serveKind)) {
    return NextResponse.json({ error: 'That serve is not available in this tournament.' }, { status: 403 });
  }

  const { data: rows } = await db
    .from('player_charges')
    .select('player_id, kind, match_id')
    .eq('tournament_id', match.tournament_id)
    .in('kind', [...SERVE_KINDS]);
  const charges = (rows ?? []) as ChargeRow[];

  if (charges.some((c) => c.match_id === matchId && c.kind === serveKind)) {
    return NextResponse.json({ error: 'That serve was already bought for this match.' }, { status: 409 });
  }
  if (serveKind === 'third_serve' && !charges.some((c) => c.match_id === matchId && c.kind === 'second_serve' && c.player_id === playerId)) {
    return NextResponse.json({ error: 'A 3rd serve needs the 2nd serve bought first.' }, { status: 409 });
  }

  const asCharges = charges.map((c) => ({ playerId: c.player_id, kind: c.kind })) as Pick<PlayerCharge, 'playerId' | 'kind'>[];
  const amountCents = priceCentsForPurchase(settings, serveKind, priorPurchaseCount(asCharges, playerId, serveKind));

  const { error } = await db.from('player_charges').insert({
    tournament_id: match.tournament_id,
    player_id: playerId,
    kind: serveKind,
    amount_cents: amountCents,
    match_id: matchId,
  });
  if (error) {
    // The unique index is the last line of defence against a double-tap.
    const duplicate = error.code === '23505';
    return NextResponse.json(
      { error: duplicate ? 'That serve was already bought for this match.' : error.message },
      { status: duplicate ? 409 : 500 },
    );
  }
  return NextResponse.json({ amountCents });
}
