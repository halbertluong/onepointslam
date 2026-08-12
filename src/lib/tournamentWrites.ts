import type { SupabaseClient } from '@supabase/supabase-js';
import type { Match, Player } from '@/types';
import { reverseWinner, distributeBySeeding } from './bracket';

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
): Promise<void> {
  const updated = reverseWinner(matches, matchId);

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

  for (const match of changed) {
    const patch: Record<string, unknown> = {
      winner_id: match.winnerId,
      player1_id: match.player1Id,
      player2_id: match.player2Id,
      status: statusAfterUndo(match),
    };
    if (!match.winnerId) Object.assign(patch, CLEARED_RESULT_FIELDS);
    await supabase.from('matches').update(patch).eq('id', match.id);
  }
}

/** Persist seed numbers for players. A blank or invalid entry clears the seed. */
export async function saveSeedRatings(
  supabase: SupabaseClient,
  seedEdits: Record<string, string>,
): Promise<void> {
  await Promise.all(
    Object.entries(seedEdits).map(([playerId, raw]) => {
      const parsed = parseInt(raw);
      const seed = raw.trim() && !isNaN(parsed) && parsed > 0 ? parsed : null;
      return supabase.from('players').update({ seed_rating: seed }).eq('id', playerId);
    }),
  );
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
): Promise<void> {
  const round0 = matches.filter((m) => m.roundIndex === 0).sort((a, b) => a.matchIndex - b.matchIndex);
  if (round0.length === 0) return;

  const slots = distributeBySeeding(players, round0.length * 2);

  // First round: real pairings play, half-empty pairings are byes that
  // auto-advance, fully empty pairings stay empty.
  await Promise.all(
    round0.map((match, i) => {
      const p1 = slots[i * 2] ?? null;
      const p2 = slots[i * 2 + 1] ?? null;
      const isBye = (p1 == null) !== (p2 == null);
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

  // Later rounds are emptied, then the byes are propagated forward into round 1.
  const laterRounds = matches.filter((m) => m.roundIndex > 0);
  await Promise.all(
    laterRounds.map((match) =>
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

  const round1 = matches.filter((m) => m.roundIndex === 1);
  await Promise.all(
    round0.map((match, i) => {
      const p1 = slots[i * 2] ?? null;
      const p2 = slots[i * 2 + 1] ?? null;
      const isBye = (p1 == null) !== (p2 == null);
      if (!isBye) return null;
      const advancing = p1 ?? p2;
      const target = round1.find((m) => m.matchIndex === Math.floor(match.matchIndex / 2));
      if (!target) return null;
      const slot = match.matchIndex % 2 === 0 ? 'player1_id' : 'player2_id';
      return supabase.from('matches').update({ [slot]: advancing }).eq('id', target.id);
    }).filter(Boolean),
  );
}
