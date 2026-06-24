'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useParams, useRouter } from 'next/navigation';
import CoinTossAnimation from '@/components/CoinTossAnimation';
import { motion, AnimatePresence } from 'framer-motion';
import type { Match, Player, Tournament } from '@/types';
import { mapPlayer } from '@/types';
import { advanceWinner } from '@/lib/bracket';

type Phase = 'loading' | 'player_check' | 'coin_toss' | 'scoring' | 'finalized';

export default function RefereeMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const router = useRouter();

  const [match, setMatch] = useState<Match | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [player1, setPlayer1] = useState<Player | null>(null);
  const [player2, setPlayer2] = useState<Player | null>(null);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [server, setServer] = useState<'player1' | 'player2' | null>(null);
  const [overrideServer, setOverrideServer] = useState<'player1' | 'player2' | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null); // playerId being confirmed as winner
  const [saving, setSaving] = useState(false);

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
      supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', m.tournament_id),
    ]);

    if (t) setTournament(t);
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

    if (m.status === 'finalized' || m.status === 'walkover') {
      setPhase('finalized');
    } else if (m.server_player_id) {
      setPhase('scoring');
    } else {
      setPhase('player_check');
    }
  }, [matchId]);

  useEffect(() => { load(); }, [load]);

  async function handleWalkover(winnerId: string) {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from('players')
      .update({ status: 'no_show_eliminated' })
      .eq('id', winnerId === player1?.id ? player2?.id : player1?.id);

    const updated = advanceWinner(allMatches, matchId, winnerId);
    await supabase
      .from('matches')
      .update({ winner_id: winnerId, status: 'walkover' })
      .eq('id', matchId);

    // Propagate winner to next round
    const nextMatch = updated.find(
      (m) => m.roundIndex === match!.roundIndex + 1 &&
        m.matchIndex === Math.floor(match!.matchIndex / 2) &&
        m.id !== matchId,
    );
    if (nextMatch) {
      const slot = match!.matchIndex % 2 === 0 ? 'player1_id' : 'player2_id';
      await supabase
        .from('matches')
        .update({ [slot]: winnerId })
        .eq('tournament_id', match!.tournamentId)
        .eq('round_index', match!.roundIndex + 1)
        .eq('match_index', Math.floor(match!.matchIndex / 2));
    }
    setSaving(false);
    router.push('/referee');
  }

  async function handleCoinTossResult(result: 'player1' | 'player2') {
    setServer(result);
    const serverId = result === 'player1' ? player1?.id : player2?.id;
    if (!serverId) return;
    const supabase = createClient();
    await supabase
      .from('matches')
      .update({ server_player_id: serverId, status: 'playing' })
      .eq('id', matchId);
    setPhase('scoring');
  }

  async function handleDeclareWinner(winnerId: string) {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from('matches')
      .update({ winner_id: winnerId, status: 'finalized' })
      .eq('id', matchId);

    const slot = match!.matchIndex % 2 === 0 ? 'player1_id' : 'player2_id';
    await supabase
      .from('matches')
      .update({ [slot]: winnerId })
      .eq('tournament_id', match!.tournamentId)
      .eq('round_index', match!.roundIndex + 1)
      .eq('match_index', Math.floor(match!.matchIndex / 2));

    setPhase('finalized');
    setSaving(false);
  }

  const effectiveServer = overrideServer ?? server;
  const p1Name = player1?.fullName ?? 'Player 1';
  const p2Name = player2?.fullName ?? 'Player 2';
  const useRandomToss = tournament?.settings?.serverDetermination === 'random_coin_toss';

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white/30 animate-pulse">Loading match…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
        <button
          onClick={() => router.push('/referee')}
          className="text-white/40 hover:text-white text-sm transition-colors"
        >
          ← Back
        </button>
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest font-bold" style={{ color: 'var(--tenant-primary)' }}>Match</p>
          <p className="text-sm font-bold text-white/70">{tournament?.name}</p>
        </div>
        <div className="w-12" />
      </div>

      <div className="flex-1 flex flex-col px-4 py-6 max-w-lg mx-auto w-full space-y-6">
        {/* Player stat cards */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { player: player1, name: p1Name, key: 'player1' as const },
            { player: player2, name: p2Name, key: 'player2' as const },
          ].map(({ player, name, key }) => (
            <div
              key={key}
              className="rounded-2xl p-4 transition-all bg-white/5"
              style={effectiveServer === key ? {
                outline: '2px solid var(--tenant-primary)',
                outlineOffset: '0px',
                backgroundColor: 'color-mix(in srgb, var(--tenant-primary) 12%, #0f172a)',
              } : {}}
            >
              <div className="text-center">
                {player?.seedRating && (
                  <span className="text-xs font-bold mr-1" style={{ color: 'var(--tenant-primary)' }}>[{player.seedRating}]</span>
                )}
                <span className="font-bold text-base">{name}</span>
                {effectiveServer === key && (
                  <div className="text-xs font-semibold mt-0.5" style={{ color: 'var(--tenant-primary)' }}>Serves</div>
                )}
              </div>
              {player && (
                <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs">
                  {player.ntrpRating != null && (
                    <div>
                      <p className="text-white/30 uppercase tracking-wide" style={{fontSize:'9px'}}>NTRP</p>
                      <p className="font-bold" style={{ color: 'var(--tenant-primary)' }}>{player.ntrpRating}</p>
                    </div>
                  )}
                  {player.utrRating != null && (
                    <div>
                      <p className="text-white/30 uppercase tracking-wide" style={{fontSize:'9px'}}>UTR</p>
                      <p className="font-bold" style={{ color: 'var(--tenant-secondary, var(--tenant-primary))' }}>{player.utrRating}</p>
                    </div>
                  )}
                  {player.age != null && (
                    <div>
                      <p className="text-white/30 uppercase tracking-wide" style={{fontSize:'9px'}}>Age</p>
                      <p className="font-bold text-white/70">{player.age}</p>
                    </div>
                  )}
                  {player.gender && (
                    <div>
                      <p className="text-white/30 uppercase tracking-wide" style={{fontSize:'9px'}}>Gender</p>
                      <p className="font-bold text-white/70 capitalize">{player.gender}</p>
                    </div>
                  )}
                  {player.skillTier && (
                    <div className="col-span-2">
                      <p className="text-white/30 uppercase tracking-wide" style={{fontSize:'9px'}}>Skill Tier</p>
                      <p className="font-bold text-white/70">{player.skillTier}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Player check phase */}
          {phase === 'player_check' && (
            <motion.div
              key="check"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="bg-white/5 rounded-2xl p-5 text-center">
                <p className="text-white/80 font-semibold mb-1">Confirm Players Present</p>
                <p className="text-white/40 text-sm">Are both players on court and ready?</p>
              </div>

              <button
                onClick={() => setPhase(useRandomToss ? 'coin_toss' : 'scoring')}
                className="tap-target btn-primary w-full rounded-2xl"
              >
                Both Players Ready ✓
              </button>

              <div className="bg-white/5 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-semibold text-white/40 text-center">No-Show / Walkover</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: `${p1Name} no-show`, winner: player2?.id, winnerName: p2Name },
                    { label: `${p2Name} no-show`, winner: player1?.id, winnerName: p1Name },
                  ].map(({ label, winner, winnerName }) => (
                    <button
                      key={label}
                      onClick={() => winner && handleWalkover(winner)}
                      disabled={saving}
                      className="bg-white/5 hover:bg-red-900/40 border border-white/10 hover:border-red-500/50 rounded-xl py-3 px-3 text-xs font-semibold text-white/50 transition-colors text-center"
                    >
                      Walkover → {winnerName}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Coin toss phase */}
          {phase === 'coin_toss' && (
            <motion.div
              key="toss"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white/5 rounded-2xl overflow-hidden"
            >
              <CoinTossAnimation
                player1Name={p1Name}
                player2Name={p2Name}
                onResult={handleCoinTossResult}
              />
              <div className="px-5 pb-5">
                <p className="text-xs text-white/30 text-center mb-2">Or manually assign server:</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: p1Name, val: 'player1' as const },
                    { label: p2Name, val: 'player2' as const },
                  ].map(({ label, val }) => (
                    <button
                      key={val}
                      onClick={() => { setOverrideServer(val); handleCoinTossResult(val); }}
                      className="bg-white/5 hover:bg-white/10 rounded-xl py-2.5 text-sm font-semibold text-white/60 transition-colors"
                    >
                      {label} serves
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Scoring phase */}
          {phase === 'scoring' && (
            <motion.div
              key="scoring"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <div className="text-center">
                <p className="text-white/80 font-semibold">Declare the winner</p>
                <p className="text-white/40 text-sm mt-1">Tap the player who won the point</p>
              </div>

              <AnimatePresence>
                {confirming && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6"
                  >
                    <div className="bg-slate-900 border border-white/10 rounded-3xl p-7 max-w-sm w-full text-center space-y-4 shadow-2xl">
                      <p className="text-xl font-black">Confirm Winner?</p>
                      <p className="text-white/60">
                        {confirming === player1?.id ? p1Name : p2Name}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setConfirming(null)}
                          className="py-3 rounded-xl border border-white/10 text-white/50 font-semibold hover:bg-white/5 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => { handleDeclareWinner(confirming); setConfirming(null); }}
                          disabled={saving}
                          className="py-3 rounded-xl btn-primary font-bold disabled:opacity-60"
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-1 gap-4">
                {[
                  { player: player1, name: p1Name },
                  { player: player2, name: p2Name },
                ].map(({ player, name }) => (
                  <button
                    key={player?.id}
                    onClick={() => player?.id && setConfirming(player.id)}
                    className="tap-target w-full rounded-2xl transition-all active:scale-95 font-black text-2xl tracking-tight"
                    style={{
                      background: 'linear-gradient(135deg, var(--tenant-primary), var(--tenant-secondary, var(--tenant-primary)))',
                      minHeight: '100px',
                    }}
                  >
                    {name} Wins
                  </button>
                ))}
              </div>

              <div className="text-center text-xs text-white/20 pb-2">
                {tournament?.settings?.serveRuleProfile === 'one_serve_sudden_death'
                  ? '1 Serve · Sudden Death'
                  : tournament?.settings?.serveRuleProfile === 'skill_based'
                  ? 'Skill-Based · Pros 1 serve, Amateurs 2 serves'
                  : '2 Serves · Traditional'}
              </div>
            </motion.div>
          )}

          {/* Finalized phase */}
          {phase === 'finalized' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl p-8 text-center space-y-3 border border-white/10 bg-white/5"
            >
              <div className="text-4xl">✅</div>
              <p className="text-xl font-black" style={{ color: 'var(--tenant-primary)' }}>Match Finalized</p>
              <p className="text-white/40 text-sm">Winner recorded. Bracket updated.</p>
              <button
                onClick={() => router.push('/referee')}
                className="btn-primary px-6 py-3 rounded-xl font-bold text-sm mt-2"
              >
                Next Match
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
