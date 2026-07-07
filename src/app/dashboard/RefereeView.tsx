'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import RefereeQueueClient from '@/app/referee/RefereeQueueClient';

interface MatchRow {
  id: string;
  tournament_id: string;
  round_index: number;
  match_index: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  status: string;
  court_number: number | null;
}

interface TournamentRow {
  id: string;
  name: string;
  tenant_id: string;
  settings: Record<string, unknown>;
  tenants: Record<string, unknown> | undefined;
}

export default function RefereeView({ tenantIds }: { tenantIds: string[] }) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [players, setPlayers] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const tournamentsQuery = supabase
        .from('tournaments')
        .select('id, name, tenant_id, settings, tenants(display_name, primary_color)')
        .in('status', ['live_play', 'bracket_generated']);

      if (tenantIds.length > 0) {
        tournamentsQuery.in('tenant_id', tenantIds);
      }

      const { data: tournamentsData } = await tournamentsQuery;
      const tournamentRows: TournamentRow[] = (tournamentsData ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        tenant_id: t.tenant_id,
        settings: t.settings as Record<string, unknown>,
        tenants: t.tenants as unknown as Record<string, unknown> | undefined,
      }));
      setTournaments(tournamentRows);

      const tournamentIds = tournamentRows.map((t) => t.id);
      if (tournamentIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: rawMatches } = await supabase
        .from('matches')
        .select('*')
        .in('tournament_id', tournamentIds)
        .in('status', ['scheduled', 'court_assigned', 'warmup', 'playing'])
        .is('winner_id', null)
        .not('player1_id', 'is', null)
        .not('player2_id', 'is', null)
        .neq('player1_id', 'BYE')
        .neq('player2_id', 'BYE')
        .order('match_index');

      const matchRows: MatchRow[] = (rawMatches ?? []).map((m) => ({
        id: m.id,
        tournament_id: m.tournament_id,
        round_index: m.round_index,
        match_index: m.match_index,
        player1_id: m.player1_id,
        player2_id: m.player2_id,
        winner_id: m.winner_id,
        status: m.status,
        court_number: m.court_number,
      }));
      setMatches(matchRows);

      const playerIds = [...new Set(
        matchRows.flatMap((m) => [m.player1_id, m.player2_id]).filter(Boolean) as string[]
      )];

      if (playerIds.length > 0) {
        const { data: playerData } = await supabase
          .from('players')
          .select('id, full_name, ntrp_rating, utr_rating, seed_rating, gender, age, skill_tier, tournament_id, email, status')
          .in('id', playerIds);
        setPlayers(Object.fromEntries((playerData ?? []).map((p) => [p.id, p as Record<string, unknown>])));
      }

      setLoading(false);
    }

    fetchData();
  }, [tenantIds]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-white/40 text-sm">Loading matches…</p>
      </div>
    );
  }

  if (tournaments.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <p className="text-4xl">🎾</p>
          <p className="font-bold text-white/60">No live tournaments right now</p>
          <p className="text-sm text-white/30 max-w-xs">Start live play on a tournament to see matches here.</p>
        </div>
      </div>
    );
  }

  return <RefereeQueueClient matches={matches} tournaments={tournaments} players={players} />;
}
