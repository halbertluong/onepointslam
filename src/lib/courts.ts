import type { SupabaseClient } from '@supabase/supabase-js';
import type { Match } from '@/types';

/**
 * When a match finishes, its court becomes free. Hand that court number to
 * the next queued, ready match (both players decided, no court assigned
 * yet) so at most `numberOfCourts` matches are ever in play at once, instead
 * of pre-assigning every first-round match up front.
 */
export async function releaseCourtToNextMatch(
  supabase: SupabaseClient,
  tournamentId: string,
  freedCourtNumber: number | null | undefined,
): Promise<void> {
  if (!freedCourtNumber) return;

  const { data: next } = await supabase
    .from('matches')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('status', 'scheduled')
    .is('court_number', null)
    .not('player1_id', 'is', null)
    .not('player2_id', 'is', null)
    .order('round_index', { ascending: true })
    .order('match_index', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (next) {
    await supabase
      .from('matches')
      .update({ court_number: freedCourtNumber, status: 'court_assigned' })
      .eq('id', next.id);
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
    .sort((a, b) => a.roundIndex - b.roundIndex || a.matchIndex - b.matchIndex)[0];

  if (!next) return matches;

  return matches.map((m) =>
    m.id === next.id ? { ...m, courtNumber: freedCourtNumber, status: 'court_assigned' as const } : m,
  );
}
