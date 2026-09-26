import type { SupabaseClient } from '@supabase/supabase-js';
import type { Match, Player } from '@/types';
import { mapMatch } from '@/types';
import { reverseWinner, distributeBySeeding, resolveAdvancement, settleByeAdvancement, matchUpdatesToColumns } from './bracket';
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

/**
 * Swaps the occupants of two round-0 slots in the Draw Editor — a bye (null)
 * on either side is a valid occupant to swap in, same as a real player.
 *
 * Reads the two match rows fresh from the database rather than trusting the
 * caller's in-memory snapshot before computing and writing the swap — the
 * same reason addPlayersToDraw does its own fresh read. A snapshot that's
 * even slightly behind (the previous swap's reload hasn't landed in props
 * yet, another tab made a change) computes the swap from stale occupants,
 * and writing that stale pair can duplicate a player into two slots at once
 * instead of moving them.
 */
export async function persistSwap(
  supabase: SupabaseClient,
  aMatchId: string,
  aSlot: 'p1' | 'p2',
  bMatchId: string,
  bSlot: 'p1' | 'p2',
): Promise<WriteResult> {
  if (aMatchId === bMatchId && aSlot === bSlot) return {};

  const { data: rows, error: readErr } = await supabase
    .from('matches')
    .select('id, player1_id, player2_id')
    .in('id', aMatchId === bMatchId ? [aMatchId] : [aMatchId, bMatchId]);
  if (readErr) return { error: readErr.message };

  const ma = rows?.find((r) => r.id === aMatchId);
  const mb = rows?.find((r) => r.id === bMatchId);
  if (!ma || !mb) return { error: 'That slot no longer exists — reload the draw and try again.' };

  const aId = (aSlot === 'p1' ? ma.player1_id : ma.player2_id) as string | null;
  const bId = (bSlot === 'p1' ? mb.player1_id : mb.player2_id) as string | null;

  if (aMatchId === bMatchId) {
    const update = aSlot === 'p1' ? { player1_id: bId, player2_id: aId } : { player2_id: bId, player1_id: aId };
    const { error } = await supabase.from('matches').update(update).eq('id', aMatchId);
    return error ? { error: error.message } : {};
  }

  const aField = aSlot === 'p1' ? 'player1_id' : 'player2_id';
  const bField = bSlot === 'p1' ? 'player1_id' : 'player2_id';
  const results = await Promise.all([
    supabase.from('matches').update({ [aField]: bId }).eq('id', aMatchId),
    supabase.from('matches').update({ [bField]: aId }).eq('id', bMatchId),
  ]);
  const err = results.find((r) => r.error)?.error?.message;
  return err ? { error: err } : {};
}

/**
 * Settles every still-open first-round bye in the main bracket into a
 * walkover, once real play has actually started. A director isn't required
 * to click "Start Live Play" before recording results — the dashboard's
 * Bracket tab and the referee console both let results in as soon as the
 * draw exists — so this is called from every one of those result-recording
 * paths, not just Start Live Play itself, or a bye sharing a round with an
 * early result would sit unsettled and leave the bracket stuck one round
 * short of where it should be.
 */
export async function settleOpenByes(supabase: SupabaseClient, matches: Match[]): Promise<WriteResult> {
  for (const { matchId, updates } of settleByeAdvancement(matches)) {
    const { error } = await supabase.from('matches').update(matchUpdatesToColumns(updates)).eq('id', matchId);
    if (error) return { error: error.message };
  }
  return {};
}

/** Fix a registrant's name, gender, age, or ratings, e.g. after a typo or a re-assessment. */
export async function updatePlayerInfo(
  supabase: SupabaseClient,
  playerId: string,
  info: { fullName: string; gender: string | null; age: number | null; ntrpRating: number | null; utrRating: number | null },
): Promise<WriteResult> {
  const { error } = await supabase
    .from('players')
    .update({
      full_name: info.fullName,
      gender: info.gender,
      age: info.age,
      ntrp_rating: info.ntrpRating,
      utr_rating: info.utrRating,
    })
    .eq('id', playerId);
  return error ? { error: error.message } : {};
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
 * Clears every recorded result — winners, court assignments, per-sport toss
 * / kick / possession fields — across every bracket, so a director can run
 * the whole tournament through again (e.g. as a dry run of double
 * elimination) without redoing the work of building the draw.
 *
 * The generated draw itself is left untouched: main round 0 is the only
 * place player placement is ever a director decision (seeding, manual
 * placement in the Draw Editor, byes) rather than something a match result
 * produced, so its player1_id/player2_id are the one thing this keeps.
 * Every other slot — later main rounds, the whole losers/consolation
 * bracket, the grand final — only ever holds a player because some match's
 * result put them there, so those are cleared back to empty along with the
 * result itself; they'll refill the same way they did the first time, as
 * real results come back in.
 *
 * Finishes by resettling round-0 byes (see settleByeAdvancement) so the
 * bracket lands right back in its post-generation state — byes walked over
 * and advanced — rather than sitting one round behind where a fresh draw
 * would be.
 */
export async function resetMatchResults(
  supabase: SupabaseClient,
  matches: Match[],
): Promise<WriteResult> {
  const cleared: Match[] = [];

  for (const match of matches) {
    const isMainRoundZero = match.bracket === 'main' && match.roundIndex === 0;
    const patch: Record<string, unknown> = {
      winner_id: null,
      loser_id: null,
      status: 'scheduled',
      court_number: null,
      ...CLEARED_RESULT_FIELDS,
    };
    if (!isMainRoundZero) {
      patch.player1_id = null;
      patch.player2_id = null;
    }
    const { error } = await supabase.from('matches').update(patch).eq('id', match.id);
    if (error) return { error: error.message };

    cleared.push({
      ...match,
      winnerId: null,
      loserId: null,
      status: 'scheduled',
      courtNumber: undefined,
      player1Id: isMainRoundZero ? match.player1Id : null,
      player2Id: isMainRoundZero ? match.player2Id : null,
    });
  }

  return settleOpenByes(supabase, cleared);
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

  // First round takes the new pairings, byes included — but a bye is not
  // resolved here. Nobody is "advanced" until the tournament actually goes
  // live (see settleByeAdvancement), so a director can keep freely
  // rearranging the draw, byes included, right up to that point.
  const firstRound = await Promise.all(
    round0.map((match, i) =>
      supabase
        .from('matches')
        .update({
          player1_id: slots[i * 2] ?? null,
          player2_id: slots[i * 2 + 1] ?? null,
          winner_id: null,
          status: 'scheduled',
          court_number: null,
          ...CLEARED_RESULT_FIELDS,
        })
        .eq('id', match.id),
    ),
  );
  const firstRoundErr = firstRound.find((r) => r.error);
  if (firstRoundErr?.error) return { error: firstRoundErr.error.message };

  // Later rounds are emptied — nothing to propagate forward yet.
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
  return laterErr?.error ? { error: laterErr.error.message } : {};
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
    // A withdrawal's walkover is a real result too — see settleOpenByes — so
    // a bye sharing that round settles now, even before live play officially starts.
    const settleErr = (await settleOpenByes(supabase, matches)).error;
    if (settleErr) return { error: settleErr };
    await releaseCourtToNextMatch(supabase, tournamentId, current.courtNumber);
  }

  const { error } = await supabase.from('players').update({ status: 'no_show_eliminated' }).eq('id', playerId);
  return error ? { error: error.message } : {};
}
