import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import BracketView from '@/components/BracketView';
import type { Player, Match } from '@/types';

interface Props {
  params: Promise<{ slug: string; tournamentId: string }>;
}

export default async function PublicBracketPage({ params }: Props) {
  const { tournamentId } = await params;
  const supabase = await createClient();

  const [{ data: tournament }, { data: players }, { data: matches }] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', tournamentId).single(),
    supabase.from('players').select('*').eq('tournament_id', tournamentId),
    supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('round_index')
      .order('match_index'),
  ]);

  if (!tournament) notFound();

  const typedPlayers: Player[] = (players ?? []).map((p) => ({
    id: p.id,
    tournamentId: p.tournament_id,
    fullName: p.full_name,
    email: p.email,
    seedRating: p.seed_rating,
    skillTier: p.skill_tier,
    status: p.status,
  }));

  const typedMatches: Match[] = (matches ?? []).map((m) => ({
    id: m.id,
    tournamentId: m.tournament_id,
    roundIndex: m.round_index,
    matchIndex: m.match_index,
    player1Id: m.player1_id,
    player2Id: m.player2_id,
    serverPlayerId: m.server_player_id,
    winnerId: m.winner_id,
    status: m.status,
    courtNumber: m.court_number,
  }));

  const isLive = tournament.status === 'live_play';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">{tournament.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {isLive && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 animate-pulse">
                  ● LIVE
                </span>
              )}
              <span className="text-sm text-slate-500">
                {typedPlayers.length} players
              </span>
            </div>
          </div>
        </div>

        {typedMatches.length === 0 ? (
          <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <p className="text-3xl mb-2">🎾</p>
            <p className="font-medium">Bracket not yet generated.</p>
            <p className="text-sm mt-1">Check back when registration closes.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <BracketView
              initialMatches={typedMatches}
              players={typedPlayers}
              maxPlayers={tournament.settings?.maxPlayers ?? 32}
              tournamentId={tournamentId}
              liveUpdates={isLive}
            />
          </div>
        )}
      </div>
    </div>
  );
}
