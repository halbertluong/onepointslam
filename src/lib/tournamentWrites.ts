import type { SupabaseClient } from '@supabase/supabase-js';
import type { Match, Player } from '@/types';
import { mapMatch } from '@/types';
import { reverseWinner, distributeBySeeding, resolveAdvancement, matchUpdatesToColumns } from './bracket';
import { releaseCourtToNextMatch } from './courts';

/**
 * Every per-sport result column. Cleared together whenever a match loses its
 * winner, so an undone match doesn't keep a stale toss/serve/kick record that
 * no longer corresponds to a played match.
 */
const CLEARED_RESULT_FIELDS = {
  server_player_id: null,
  toss_winner_id: null,
  kicker_player_id: null,
  keeper_player_id: null,
  kick_outcome: null,
  coin_flip_winner_id: null,
  offense_player_id: null,
  defense_player_id: null,
  possession_outcome: null,
};

/**
 * Result of a write helper. These all issue several statements, and a partial
 * failure leaves the bracket inconsistent — so every one reports back rather
 * than returning void. Swallowing a rejected write here once left the Bracket
 * tab's undo button silently doing nothing.
 */
export type WriteResult = { error?: string };

/** A match that lost its winner goes back to the queue — still on its court if it had one. */
function statusAfterUndo(match: Match): Match['status'] {
  if (match.winnerId) return match.status;
  return match.courtNumber ? 'court_assigned' : 'scheduled';
}

/**
 * Undo a match result in the database, including the knock-on effects.
 *
 * The cascade rules live in reverseWinner (shared with the /demo sandbox), so
 * this computes the whole corrected Match[] in memory first and then persists
 * only the rows that actually changed. That way undoing a match whose winner
 * had already advanced and won again unwinds the entire chain, rather than
 * leaving a player sitting in a later round they no longer earned.
 */
export async function persistReversal(
  supabase: SupabaseClient,
  matches: Match[],
  matchId: string,
  winnersRounds?: number,
): Promise<WriteResult> {
  const updated = reverseWinner(matches, matchId, winnersRounds);

  const changed = updated.filter((next) => {
    const before = matches.find((m) => m.id === next.id);
    if (!before) return false;
    return (
      before.winnerId !== next.winnerId ||
      before.status !== next.status ||
      before.player1Id !== next.player1Id ||
      before.player2Id !== next.player2Id
    );
  });

  if (changed.length === 0) return { error: 'That match has no result to undo.' };

  for (const match of changed) {
    const patch: Record<string, unknown> = {
      winner_id: match.winnerId,
      loser_id: match.loserId ?? null,
      player1_id: match.player1Id,
      player2_id: match.player2Id,
      status: statusAfterUndo(match),
    };
    if (!match.winnerId) Object.assign(patch, CLEARED_RESULT_FIELDS);
    const { error } = await supabase.from('matches').update(patch).eq('id', match.id);
    if (error) return { error: error.message };
  }
  return {};
}

/** Persist seed numbers for players. A blank or invalid entry clears the seed. */
export async function saveSeedRatings(
  supabase: SupabaseClient,
  seedEdits: Record<string, string>,
): Promise<WriteResult> {
  const results = await Promise.all(
    Object.entries(seedEdits).map(([playerId, raw]) => {
      const parsed = parseInt(raw);
      const seed = raw.trim() && !isNaN(parsed) && parsed > 0 ? parsed : null;
      return supabase.from('players').update({ seed_rating: seed }).eq('id', playerId);
    }),
  );
  const failed = results.find((r) => r.error);
  return failed?.error ? { error: failed.error.message } : {};
}

/**
 * Rewrite a tournament's first round so the given players sit in standard
 * tournament-seeding positions, and reset every later round back to empty.
 *
 * Existing match rows are updated in place (matched by round/match index)
 * rather than recreated, because match ids vary by how the bracket was first
 * generated and other tables reference them.
 */
export async function persistSeededRedistribution(
  supabase: SupabaseClient,
  matches: Match[],
  players: Player[],
): Promise<WriteResult> {
  const round0 = matches.filter((m) => m.bracket === 'main' && m.roundIndex === 0).sort((a, b) => a.matchIndex - b.matchIndex);
  if (round0.length === 0) return { error: 'There is no bracket to redistribute.' };

  const slots = distributeBySeeding(players, round0.length * 2);
  const byeAt = (i: number) => (slots[i * 2] == null) !== (slots[i * 2 + 1] == null);

  // First round: real pairings play, half-empty pairings are byes that
  // auto-advance, fully empty pairings stay empty.
  const firstRound = await Promise.all(
    round0.map((match, i) => {
      const p1 = slots[i * 2] ?? null;
      const p2 = slots[i * 2 + 1] ?? null;
      const isBye = byeAt(i);
      return supabase
        .from('matches')
        .update({
          player1_id: p1,
          player2_id: p2,
          winner_id: isBye ? (p1 ?? p2) : null,
          status: isBye ? 'walkover' : 'scheduled',
          court_number: null,
          ...CLEARED_RESULT_FIELDS,
        })
        .eq('id', match.id);
    }),
  );
  const firstRoundErr = firstRound.find((r) => r.error);
  if (firstRoundErr?.error) return { error: firstRoundErr.error.message };

  // Later rounds are emptied, then the byes are propagated forward into round 1.
  const later = await Promise.all(
    matches.filter((m) => m.bracket === 'main' && m.roundIndex > 0).map((match) =>
      supabase
        .from('matches')
        .update({
          player1_id: null,
          player2_id: null,
          winner_id: null,
          status: 'scheduled',
          court_number: null,
          ...CLEARED_RESULT_FIELDS,
        })
        .eq('id', match.id),
    ),
  );
  const laterErr = later.find((r) => r.error);
  if (laterErr?.error) return { error: laterErr.error.message };

  const round1 = matches.filter((m) => m.bracket === 'main' && m.roundIndex === 1);
  const propagated = await Promise.all(
    round0.flatMap((match, i) => {
      if (!byeAt(i)) return [];
      const advancing = slots[i * 2] ?? slots[i * 2 + 1] ?? null;
      const target = round1.find((m) => m.matchIndex === Math.floor(match.matchIndex / 2));
      if (!target) return [];
      const slot = match.matchIndex % 2 === 0 ? 'player1_id' : 'player2_id';
      return [supabase.from('matches').update({ [slot]: advancing }).eq('id', target.id)];
    }),
  );
  const propErr = propagated.find((r) => r.error);
  return propErr?.error ? { error: propErr.error.message } : {};
}

/**
 * Puts registered players into open first-round slots.
 *
 * Reads the draw fresh from the database rather than trusting the caller's
 * snapshot, and skips anyone already holding a slot. Both matter: a stale
 * snapshot plus no duplicate check is what previously let the same player be
 * written into two slots at once, which silently corrupts a draw.
 *
 * Filling a slot that belonged to a bye undoes that bye first, so the match
 * becomes a real contest instead of leaving a phantom winner in the next round.
 */
export async function addPlayersToDraw(
  supabase: SupabaseClient,
  tournamentId: string,
  playerIds: string[],
): Promise<WriteResult & { added: number; skipped: number; noRoom: number }> {
  const fail = (error: string) => ({ error, added: 0, skipped: 0, noRoom: 0 });

  const { data: rows, error: readErr } = await supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('round_index')
    .order('match_index');
  if (readErr) return fail(readErr.message);

  let working: Match[] = (rows ?? []).map((r) => mapMatch(r as Record<string, unknown>));
  const round0 = () => working.filter((m) => m.bracket === 'main' && m.roundIndex === 0).sort((a, b) => a.matchIndex - b.matchIndex);

  const placed = new Set(
    round0().flatMap((m) => [m.player1Id, m.player2Id]).filter((id): id is string => !!id && id !== 'BYE'),
  );

  let added = 0;
  let skipped = 0;
  let noRoom = 0;

  for (const playerId of playerIds) {
    if (placed.has(playerId)) { skipped += 1; continue; }

    const target = round0().find((m) => !m.player1Id || !m.player2Id);
    if (!target) { noRoom += 1; continue; }

    if (target.winnerId) {
      const undo = await persistReversal(supabase, working, target.id);
      if (undo.error) return { error: undo.error, added, skipped, noRoom };
      working = reverseWinner(working, target.id);
    }

    const field = !target.player1Id ? 'player1_id' : 'player2_id';
    const { error } = await supabase
      .from('matches')
      .update({
        [field]: playerId,
        winner_id: null,
        status: target.courtNumber ? 'court_assigned' : 'scheduled',
      })
      .eq('id', target.id);
    if (error) return { error: error.message, added, skipped, noRoom };

    working = working.map((m) =>
      m.id === target.id
        ? { ...m, [field === 'player1_id' ? 'player1Id' : 'player2Id']: playerId, winnerId: null }
        : m,
    );
    placed.add(playerId);
    added += 1;
  }

  return { added, skipped, noRoom };
}

/**
 * A player who can no longer make it, pulled off the tournament's active side
 * without erasing their record. If they're sitting in an unplayed match
 * against a real opponent, that opponent is awarded a walkover — the same
 * advancement the referee console applies for an in-match no-show (see
 * resolveAdvancement) — so the bracket keeps moving instead of stalling on
 * someone who isn't coming. A slot still waiting on the other side of the
 * bracket (no opponent decided yet) is left alone; there's nothing to award a
 * walkover to yet, and a director can sort out the placement by hand once the
 * opponent is known.
 *
 * Reuses no_show_eliminated — the same status an in-match walkover already
 * sets — so everywhere that already treats it as "not an active registrant"
 * (cap counts, the players table's own no-show badge) treats a withdrawal
 * exactly the same way.
 */
export async function withdrawPlayer(
  supabase: SupabaseClient,
  matches: Match[],
  tournamentId: string,
  playerId: string,
  winnersRounds: number,
): Promise<WriteResult> {
  const current = matches.find(
    (m) => (m.player1Id === playerId || m.player2Id === playerId) && !m.winnerId && m.status !== 'walkover',
  );
  const opponentId = current
    ? (current.player1Id === playerId ? current.player2Id : current.player1Id)
    : null;

  if (current && opponentId && opponentId !== 'BYE') {
    const advancement = resolveAdvancement(matches, current, opponentId, playerId, winnersRounds);
    const [first, ...rest] = advancement;
    const { error } = await supabase
      .from('matches')
      .update({ ...matchUpdatesToColumns(first.updates), status: 'walkover' })
      .eq('id', first.matchId);
    if (error) return { error: error.message };
    for (const { matchId, updates } of rest) {
      const { error: restErr } = await supabase.from('matches').update(matchUpdatesToColumns(updates)).eq('id', matchId);
      if (restErr) return { error: restErr.message };
    }
    await releaseCourtToNextMatch(supabase, tournamentId, current.courtNumber);
  }

  const { error } = await supabase.from('players').update({ status: 'no_show_eliminated' }).eq('id', playerId);
  return error ? { error: error.message } : {};
}
