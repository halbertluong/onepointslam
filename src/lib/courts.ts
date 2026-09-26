import type { SupabaseClient } from '@supabase/supabase-js';
import type { Match } from '@/types';
import { queueRoundPriority } from './bracket';

/**
 * When a match finishes, its court becomes free. Hand that court number to
 * the next queued, ready match (both players decided, no court assigned
 * yet) so at most `numberOfCourts` matches are ever in play at once, instead
 * of pre-assigning every first-round match up front.
 *
 * "Next" means next in queue order (see queueRoundPriority), not next by raw
 * round_index — a consolation bracket's round_index resets to 0, so sorting
 * by round_index alone let a consolation round-0 match jump ahead of a main
 * round-2+ match that hadn't been played yet, handing out a court to the
 * consolation bracket before the main bracket the queue said should go
 * first.
 */
export async function releaseCourtToNextMatch(
  supabase: SupabaseClient,
  tournamentId: string,
  freedCourtNumber: number | null | undefined,
): Promise<void> {
  if (!freedCourtNumber) return;

  const { data: candidates } = await supabase
    .from('matches')
    .select('id, bracket, round_index, match_index')
    .eq('tournament_id', tournamentId)
    .eq('status', 'scheduled')
    .is('court_number', null)
    .not('player1_id', 'is', null)
    .not('player2_id', 'is', null);

  const next = (candidates ?? []).sort((a, b) =>
    queueRoundPriority(a.bracket, a.round_index) - queueRoundPriority(b.bracket, b.round_index)
    || a.match_index - b.match_index
  )[0];

  if (next) {
    const { error } = await supabase
      .from('matches')
      .update({ court_number: freedCourtNumber, status: 'court_assigned' })
      .eq('id', next.id);
    // Best-effort hand-off — the match that just finished is already saved
    // either way — but a silent failure here is exactly how a court gets
    // stuck on a finished match forever, so at least surface it.
    if (error) console.error('releaseCourtToNextMatch: failed to hand off court', error);
  }
}

/**
 * Same rule as releaseCourtToNextMatch, for callers working on an in-memory
 * Match[] instead of Supabase (e.g. the /demo sandbox, which simulates a
 * tournament entirely in local state).
 */
export function releaseCourtToNextMatchLocal(
  matches: Match[],
  freedCourtNumber: number | null | undefined,
): Match[] {
  if (!freedCourtNumber) return matches;

  const next = matches
    .filter((m) =>
      m.status === 'scheduled' &&
      !m.courtNumber &&
      m.player1Id && m.player1Id !== 'BYE' &&
      m.player2Id && m.player2Id !== 'BYE',
    )
    .sort((a, b) =>
      queueRoundPriority(a.bracket, a.roundIndex) - queueRoundPriority(b.bracket, b.roundIndex)
      || a.matchIndex - b.matchIndex
    )[0];

  if (!next) return matches;

  return matches.map((m) =>
    m.id === next.id ? { ...m, courtNumber: freedCourtNumber, status: 'court_assigned' as const } : m,
  );
}
