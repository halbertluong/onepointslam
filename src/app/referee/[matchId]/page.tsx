'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useParams, useRouter } from 'next/navigation';
import RefereeMatchClient from '@/components/RefereeMatchClient';
import type { Match, Player, Tournament } from '@/types';
import { mapPlayer } from '@/types';
import { advanceWinner } from '@/lib/bracket';

export default function RefereeMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const router = useRouter();

  const [match, setMatch] = useState<Match | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [player1, setPlayer1] = useState<Player | null>(null);
  const [player2, setPlayer2] = useState<Player | null>(null);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: m } = await supabase.from('matches').select('*').eq('id', matchId).single();
    if (!m) return;

    const matchData: Match = {
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
    };
    setMatch(matchData);

    const [{ data: t }, { data: players }, { data: allM }] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', m.tournament_id).single(),
      supabase
        .from('players')
        .select('*')
        .in('id', [m.player1_id, m.player2_id].filter(Boolean)),
      supabase.from('matches').select('*').eq('tournament_id', m.tournament_id),
    ]);

    if (t) setTournament(t as unknown as Tournament);
    if (players) {
      const mapped = players.map((p) => mapPlayer(p as Record<string, unknown>));
      setPlayer1(mapped.find((p) => p.id === m.player1_id) ?? null);
      setPlayer2(mapped.find((p) => p.id === m.player2_id) ?? null);
    }
    setAllMatches(
      (allM ?? []).map((x) => ({
        id: x.id,
        tournamentId: x.tournament_id,
        roundIndex: x.round_index,
        matchIndex: x.match_index,
        player1Id: x.player1_id,
        player2Id: x.player2_id,
        serverPlayerId: x.server_player_id,
        winnerId: x.winner_id,
        status: x.status,
        courtNumber: x.court_number,
      })),
    );
    setLoading(false);
  }, [matchId]);

  useEffect(() => { load(); }, [load]);

  async function handleDeclareWinner(winnerId: string) {
    const supabase = createClient();
    await supabase
      .from('matches')
      .update({ winner_id: winnerId, status: 'finalized' })
      .eq('id', matchId);

    if (match) {
      const slot = match.matchIndex % 2 === 0 ? 'player1_id' : 'player2_id';
      await supabase
        .from('matches')
        .update({ [slot]: winnerId })
        .eq('tournament_id', match.tournamentId)
        .eq('round_index', match.roundIndex + 1)
        .eq('match_index', Math.floor(match.matchIndex / 2));
    }
  }

  async function handleWalkover(winnerId: string) {
    const supabase = createClient();
    const loserId = winnerId === player1?.id ? player2?.id : player1?.id;
    if (loserId) {
      await supabase.from('players').update({ status: 'no_show_eliminated' }).eq('id', loserId);
    }

    await supabase
      .from('matches')
      .update({ winner_id: winnerId, status: 'walkover' })
      .eq('id', matchId);

    if (match) {
      const updated = advanceWinner(allMatches, matchId, winnerId);
      const nextMatch = updated.find(
        (m) =>
          m.roundIndex === match.roundIndex + 1 &&
          m.matchIndex === Math.floor(match.matchIndex / 2) &&
          m.id !== matchId,
      );
      if (nextMatch) {
        const slot = match.matchIndex % 2 === 0 ? 'player1_id' : 'player2_id';
        await supabase
          .from('matches')
          .update({ [slot]: winnerId })
          .eq('tournament_id', match.tournamentId)
          .eq('round_index', match.roundIndex + 1)
          .eq('match_index', Math.floor(match.matchIndex / 2));
      }
    }
  }

  if (loading || !match || !player1 || !player2) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white/30 animate-pulse">Loading match…</div>
      </div>
    );
  }

  return (
    <RefereeMatchClient
      match={match}
      player1={player1}
      player2={player2}
      tournamentName={tournament?.name ?? ''}
      serveRuleProfile={tournament?.settings?.serveRuleProfile}
      useRandomToss={tournament?.settings?.serverDetermination === 'random_coin_toss'}
      onDeclareWinner={handleDeclareWinner}
      onWalkover={handleWalkover}
      onBack={() => router.push('/referee')}
      onNext={() => router.push('/referee')}
    />
  );
}
