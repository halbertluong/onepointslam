import type { SupabaseClient } from '@supabase/supabase-js';
import type { Match } from '@/types';

/**
 * When a match finishes, its court becomes free. Hand that court number to
 * the next queued, ready match (both players decided, no court assigned
 * yet) so at most `numberOfCourts` matches are ever in play at once, instead
 * of pre-assigning every first-round match up front.
 *
 * Goes through the claim_next_court() RPC (see migration 034) rather than a
 * select-then-update from here: two matches finishing on different courts at
 * the same instant could otherwise both read the same "next" match before
 * either write commits, and the second update would silently overwrite the
 * first — one freed court loses the race and sits idle while the match that
 * should have gone to it flips to the other court instead. The RPC locks the
 * candidate row as part of selecting it, so that can't happen.
 */
export async function releaseCourtToNextMatch(
  supabase: SupabaseClient,
  tournamentId: string,
  freedCourtNumber: number | null | undefined,
): Promise<void> {
  if (!freedCourtNumber) return;
  await supabase.rpc('claim_next_court', { p_tournament_id: tournamentId, p_court_number: freedCourtNumber });
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
    .sort((a, b) => a.roundIndex - b.roundIndex || a.matchIndex - b.matchIndex)[0];

  if (!next) return matches;

  return matches.map((m) =>
    m.id === next.id ? { ...m, courtNumber: freedCourtNumber, status: 'court_assigned' as const } : m,
  );
}
