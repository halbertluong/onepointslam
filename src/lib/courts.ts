import type { SupabaseClient } from '@supabase/supabase-js';

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
