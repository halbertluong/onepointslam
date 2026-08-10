'use client';

import { useState } from 'react';
import CoinTossAnimation from './CoinTossAnimation';
import { motion, AnimatePresence } from 'framer-motion';
import type { Match, Player } from '@/types';

type Phase = 'player_check' | 'coin_toss' | 'scoring' | 'finalized';

interface Props {
  match: Match;
  player1: Player;
  player2: Player;
  tournamentName: string;
  serveRuleProfile?: string;
  useRandomToss?: boolean;
  /** Called when a winner is declared. Caller is responsible for persistence. */
  onDeclareWinner: (winnerId: string) => void | Promise<void>;
  /** Called when a walkover is given. `winnerId` is the advancing player. */
  onWalkover: (winnerId: string) => void | Promise<void>;
  onBack: () => void;
  onNext: () => void;
}

export default function RefereeMatchClient({
  match,
  player1,
  player2,
  tournamentName,
  serveRuleProfile = 'one_serve_sudden_death',
  useRandomToss = true,
  onDeclareWinner,
  onWalkover,
  onBack,
  onNext,
}: Props) {
  const initialPhase: Phase =
    match.status === 'finalized' || match.status === 'walkover'
      ? 'finalized'
      : match.serverPlayerId
      ? 'scoring'
      : 'player_check';

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [server, setServer] = useState<'player1' | 'player2' | null>(null);
  const [overrideServer, setOverrideServer] = useState<'player1' | 'player2' | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const effectiveServer = overrideServer ?? server;
  const p1Name = player1.fullName;
  const p2Name = player2.fullName;

  async function handleWalkover(winnerId: string) {
    setSaving(true);
    await onWalkover(winnerId);
    setSaving(false);
    setPhase('finalized');
  }

  function handleCoinTossResult(result: 'player1' | 'player2') {
    setServer(result);
    setPhase('scoring');
  }

  async function handleDeclareWinner(winnerId: string) {
    setSaving(true);
    await onDeclareWinner(winnerId);
    setSaving(false);
    setPhase('finalized');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
        <button onClick={onBack} className="text-white/40 hover:text-white text-sm transition-colors">
          ← Back
        </button>
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest font-bold" style={{ color: 'var(--tenant-primary)' }}>
            Match
          </p>
          <p className="text-sm font-bold text-white/70">{tournamentName}</p>
        </div>
        <div className="w-12" />
      </div>

      <div className="flex-1 flex flex-col px-4 py-6 max-w-lg mx-auto w-full space-y-6">
        {/* Player cards */}
        <div className="grid grid-cols-2 gap-3">
          {([
            { player: player1, name: p1Name, key: 'player1' as const },
            { player: player2, name: p2Name, key: 'player2' as const },
          ] as const).map(({ player, name, key }) => (
            <div
              key={key}
              className="rounded-2xl p-4 transition-all bg-white/5"
              style={
                effectiveServer === key
                  ? {
                      outline: '2px solid var(--tenant-primary)',
                      outlineOffset: '0px',
                      backgroundColor: 'color-mix(in srgb, var(--tenant-primary) 12%, #0f172a)',
                    }
                  : {}
              }
            >
              <div className="text-center">
                {player.seedRating && (
                  <span className="text-xs font-bold mr-1" style={{ color: 'var(--tenant-primary)' }}>
                    [{player.seedRating}]
                  </span>
                )}
                <span className="font-bold text-base">{name}</span>
                {effectiveServer === key && (
                  <div className="text-xs font-semibold mt-0.5" style={{ color: 'var(--tenant-primary)' }}>
                    Serves
                  </div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs">
                {player.ntrpRating != null && (
                  <div>
                    <p className="text-white/30 uppercase tracking-wide" style={{ fontSize: '9px' }}>NTRP</p>
                    <p className="font-bold" style={{ color: 'var(--tenant-primary)' }}>{player.ntrpRating}</p>
                  </div>
                )}
                {player.utrRating != null && (
                  <div>
                    <p className="text-white/30 uppercase tracking-wide" style={{ fontSize: '9px' }}>UTR</p>
                    <p className="font-bold text-white/70">{player.utrRating}</p>
                  </div>
                )}
                {player.age != null && (
                  <div>
                    <p className="text-white/30 uppercase tracking-wide" style={{ fontSize: '9px' }}>Age</p>
                    <p className="font-bold text-white/70">{player.age}</p>
                  </div>
                )}
                {player.gender && (
                  <div>
                    <p className="text-white/30 uppercase tracking-wide" style={{ fontSize: '9px' }}>Gender</p>
                    <p className="font-bold text-white/70 capitalize">{player.gender}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Player check */}
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
                    { label: `${p1Name} no-show`, winner: player2.id, winnerName: p2Name },
                    { label: `${p2Name} no-show`, winner: player1.id, winnerName: p1Name },
                  ].map(({ winner, winnerName }) => (
                    <button
                      key={winner}
                      onClick={() => handleWalkover(winner)}
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

          {/* Coin toss */}
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

          {/* Scoring */}
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
                        {confirming === player1.id ? p1Name : p2Name}
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
                    key={player.id}
                    onClick={() => setConfirming(player.id)}
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
                {serveRuleProfile === 'one_serve_sudden_death'
                  ? '1 Serve · Sudden Death'
                  : serveRuleProfile === 'skill_based'
                  ? 'Skill-Based · Pros 1 serve, Amateurs 2 serves'
                  : '2 Serves · Traditional'}
              </div>
            </motion.div>
          )}

          {/* Finalized */}
          {phase === 'finalized' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl p-8 text-center space-y-3 border border-white/10 bg-white/5"
            >
              <div className="text-4xl">✅</div>
              <p className="text-xl font-black" style={{ color: 'var(--tenant-primary)' }}>
                Match Finalized
              </p>
              <p className="text-white/40 text-sm">Winner recorded. Bracket updated.</p>
              <button onClick={onNext} className="btn-primary px-6 py-3 rounded-xl font-bold text-sm mt-2">
                Next Match
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
