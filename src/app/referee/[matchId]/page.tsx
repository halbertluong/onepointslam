'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useParams, useRouter } from 'next/navigation';
import RefereeMatchClient from '@/components/RefereeMatchClient';
import SoccerMatchClient from '@/components/SoccerMatchClient';
import BasketballMatchClient from '@/components/BasketballMatchClient';
import type { Match, Player, Tournament, KickOutcome, PossessionOutcome } from '@/types';
import { mapPlayer } from '@/types';
import { determineOneGoalBowlWinner, determineOnePointBowlWinner, resolveAdvancement, matchUpdatesToColumns, getRoundsCount } from '@/lib/bracket';
import { releaseCourtToNextMatch } from '@/lib/courts';

export default function RefereeMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const router = useRouter();

  const [match, setMatch] = useState<Match | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [player1, setPlayer1] = useState<Player | null>(null);
  const [player2, setPlayer2] = useState<Player | null>(null);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState('');

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
      loserId: m.loser_id,
      status: m.status,
      bracket: m.bracket ?? 'main',
      courtNumber: m.court_number,
      tossWinnerId: m.toss_winner_id,
      kickerPlayerId: m.kicker_player_id,
      keeperPlayerId: m.keeper_player_id,
      kickOutcome: m.kick_outcome,
      coinFlipWinnerId: m.coin_flip_winner_id,
      offensePlayerId: m.offense_player_id,
      defensePlayerId: m.defense_player_id,
      possessionOutcome: m.possession_outcome,
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
        loserId: x.loser_id,
        status: x.status,
        bracket: x.bracket ?? 'main',
        courtNumber: x.court_number,
      })),
    );
    setLoading(false);
  }, [matchId]);

  useEffect(() => { load(); }, [load]);

  async function handleServerDetermined(tossWinnerId: string | null, serverPlayerId: string) {
    const supabase = createClient();
    await supabase
      .from('matches')
      .update({ toss_winner_id: tossWinnerId, server_player_id: serverPlayerId })
      .eq('id', matchId);
  }

  async function applyAdvancement(winnerId: string, extraFields?: Record<string, unknown>): Promise<boolean> {
    if (!match || !tournament) return false;
    const supabase = createClient();
    const loserId = winnerId === player1?.id ? (player2?.id ?? null) : (player1?.id ?? null);
    const winnersRounds = getRoundsCount(tournament.settings?.maxPlayers ?? 8);
    const advancement = resolveAdvancement(allMatches, match, winnerId, loserId, winnersRounds);
    const [first, ...rest] = advancement;
    const { error } = await supabase
      .from('matches')
      .update({ ...matchUpdatesToColumns(first.updates), ...extraFields })
      .eq('id', first.matchId);
    if (error) { setSaveError(`Could not save result: ${error.message}`); return false; }
    setSaveError('');
    for (const { matchId: id, updates } of rest) {
      await supabase.from('matches').update(matchUpdatesToColumns(updates)).eq('id', id);
    }
    await releaseCourtToNextMatch(supabase, match.tournamentId, match.courtNumber);
    return true;
  }

  async function handleDeclareWinner(winnerId: string) {
    if (match?.status === 'finalized' || match?.status === 'walkover') return;
    await applyAdvancement(winnerId);
  }

  async function handleDeclareSoccerResult(kickerPlayerId: string, keeperPlayerId: string, outcome: KickOutcome) {
    if (match?.status === 'finalized' || match?.status === 'walkover') return;
    const winnerId = determineOneGoalBowlWinner(kickerPlayerId, keeperPlayerId, outcome);
    await applyAdvancement(winnerId, {
      kicker_player_id: kickerPlayerId,
      keeper_player_id: keeperPlayerId,
      kick_outcome: outcome,
    });
  }

  async function handleDeclareBasketballResult(
    coinFlipWinnerId: string,
    offensePlayerId: string,
    defensePlayerId: string,
    outcome: PossessionOutcome,
  ) {
    if (match?.status === 'finalized' || match?.status === 'walkover') return;
    const winnerId = determineOnePointBowlWinner(offensePlayerId, defensePlayerId, outcome);
    await applyAdvancement(winnerId, {
      coin_flip_winner_id: coinFlipWinnerId,
      offense_player_id: offensePlayerId,
      defense_player_id: defensePlayerId,
      possession_outcome: outcome,
    });
  }

  async function handleWalkover(winnerId: string) {
    if (match?.status === 'finalized' || match?.status === 'walkover') return;
    const supabase = createClient();
    const loserId = winnerId === player1?.id ? player2?.id : player1?.id;
    if (loserId) {
      await supabase.from('players').update({ status: 'no_show_eliminated' }).eq('id', loserId);
    }
    await applyAdvancement(winnerId, { status: 'walkover' });
  }

  if (loading || !match || !player1 || !player2) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white/30 animate-pulse">Loading match…</div>
      </div>
    );
  }

  const errorBanner = saveError && (
    <div className="fixed top-0 inset-x-0 z-50 bg-red-600 text-white text-sm font-semibold px-4 py-2.5 flex items-center justify-between gap-3">
      <span>⚠️ {saveError}</span>
      <button onClick={() => setSaveError('')} className="shrink-0 underline">Dismiss</button>
    </div>
  );

  if (tournament?.settings?.sport === 'soccer') {
    return (
      <>
        {errorBanner}
        <SoccerMatchClient
          match={match}
          player1={player1}
          player2={player2}
          tournamentName={tournament?.name ?? ''}
          onDeclareResult={handleDeclareSoccerResult}
          onWalkover={handleWalkover}
          onBack={() => router.push('/referee')}
          onNext={() => router.push('/referee')}
        />
      </>
    );
  }

  if (tournament?.settings?.sport === 'basketball') {
    return (
      <>
        {errorBanner}
        <BasketballMatchClient
          match={match}
          player1={player1}
          player2={player2}
          tournamentName={tournament?.name ?? ''}
          onDeclareResult={handleDeclareBasketballResult}
          onWalkover={handleWalkover}
          onBack={() => router.push('/referee')}
          onNext={() => router.push('/referee')}
        />
      </>
    );
  }

  return (
    <>
      {errorBanner}
      <RefereeMatchClient
        match={match}
        player1={player1}
        player2={player2}
        tournamentName={tournament?.name ?? ''}
        serveRuleProfile={tournament?.settings?.serveRuleProfile}
        useRandomToss={tournament?.settings?.serverDetermination === 'random_coin_toss'}
        onServerDetermined={handleServerDetermined}
        onDeclareWinner={handleDeclareWinner}
        onWalkover={handleWalkover}
        onBack={() => router.push('/referee')}
        onNext={() => router.push('/referee')}
      />
    </>
  );
}
