'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Match, Player, KickOutcome } from '@/types';
import { determineOneGoalBowlWinner } from '@/lib/bracket';

type Phase = 'player_check' | 'role_select' | 'kick_outcome' | 'finalized';

interface Props {
  match: Match;
  player1: Player;
  player2: Player;
  tournamentName: string;
  /** Called once the kick outcome is recorded. Caller is responsible for persistence and winner advancement. */
  onDeclareResult: (kickerPlayerId: string, keeperPlayerId: string, outcome: KickOutcome) => void | Promise<void>;
  /** Called when a walkover is given. `winnerId` is the advancing player. */
  onWalkover: (winnerId: string) => void | Promise<void>;
  onBack: () => void;
  onNext: () => void;
}

const OUTCOME_OPTIONS: { outcome: KickOutcome; label: string; emoji: string; result: 'kicker' | 'keeper' }[] = [
  { outcome: 'goal', label: 'Goal — Kicker Scores', emoji: '⚽', result: 'kicker' },
  { outcome: 'miss', label: 'Miss — Kicker Misses', emoji: '🚫', result: 'keeper' },
  { outcome: 'saved', label: 'Saved by Keeper', emoji: '🧤', result: 'keeper' },
];

export default function SoccerMatchClient({
  match,
  player1,
  player2,
  tournamentName,
  onDeclareResult,
  onWalkover,
  onBack,
  onNext,
}: Props) {
  const initialPhase: Phase =
    match.status === 'finalized' || match.status === 'walkover'
      ? 'finalized'
      : match.kickerPlayerId
      ? 'kick_outcome'
      : 'player_check';

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [kickerId, setKickerId] = useState<string | null>(match.kickerPlayerId ?? null);
  const [keeperId, setKeeperId] = useState<string | null>(match.keeperPlayerId ?? null);
  const [confirming, setConfirming] = useState<KickOutcome | null>(null);
  const [saving, setSaving] = useState(false);

  const p1Name = player1.fullName;
  const p2Name = player2.fullName;

  const kicker = kickerId === player1.id ? player1 : kickerId === player2.id ? player2 : null;
  const keeper = keeperId === player1.id ? player1 : keeperId === player2.id ? player2 : null;

  async function handleWalkover(winnerId: string) {
    setSaving(true);
    await onWalkover(winnerId);
    setSaving(false);
    setPhase('finalized');
  }

  function handleRoleSelect(chosenKickerId: string) {
    const otherId = chosenKickerId === player1.id ? player2.id : player1.id;
    setKickerId(chosenKickerId);
    setKeeperId(otherId);
    setPhase('kick_outcome');
  }

  async function handleConfirmOutcome(outcome: KickOutcome) {
    if (!kickerId || !keeperId) return;
    setSaving(true);
    await onDeclareResult(kickerId, keeperId, outcome);
    setSaving(false);
    setPhase('finalized');
  }

  const winnerId = kickerId && keeperId && match.kickOutcome
    ? determineOneGoalBowlWinner(kickerId, keeperId, match.kickOutcome)
    : null;
  const winnerName = winnerId === player1.id ? p1Name : winnerId === player2.id ? p2Name : null;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
        <button onClick={onBack} className="text-white/40 hover:text-white text-sm transition-colors">
          ← Back
        </button>
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest font-bold" style={{ color: 'var(--tenant-primary)' }}>
            One Goal Bowl
          </p>
          <p className="text-sm font-bold text-white/70">{tournamentName}</p>
        </div>
        <div className="w-12" />
      </div>

      <div className="flex-1 flex flex-col px-4 py-6 max-w-lg mx-auto w-full space-y-6">
        {/* Player cards */}
        <div className="grid grid-cols-2 gap-3">
          {([
            { player: player1, name: p1Name, key: player1.id },
            { player: player2, name: p2Name, key: player2.id },
          ] as const).map(({ player, name, key }) => {
            const role = key === kickerId ? 'Kicker' : key === keeperId ? 'Keeper' : null;
            return (
              <div
                key={key}
                className="rounded-2xl p-4 transition-all bg-white/5"
                style={
                  role
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
                  {role && (
                    <div className="text-xs font-semibold mt-0.5" style={{ color: 'var(--tenant-primary)' }}>
                      {role === 'Kicker' ? '⚽ Kicker' : '🧤 Keeper'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
                <p className="text-white/40 text-sm">Are both players on the pitch and ready?</p>
              </div>

              <button
                onClick={() => setPhase('role_select')}
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

          {/* Role selection */}
          {phase === 'role_select' && (
            <motion.div
              key="roles"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="bg-white/5 rounded-2xl p-5 text-center">
                <p className="text-white/80 font-semibold mb-1">Who&apos;s kicking?</p>
                <p className="text-white/40 text-sm">One player chooses to be kicker or keeper. The other gets the remaining role automatically.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: p1Name, id: player1.id },
                  { label: p2Name, id: player2.id },
                ].map(({ label, id }) => (
                  <button
                    key={id}
                    onClick={() => handleRoleSelect(id)}
                    className="tap-target w-full rounded-2xl transition-all active:scale-95 font-black text-lg tracking-tight"
                    style={{
                      background: 'linear-gradient(135deg, var(--tenant-primary), var(--tenant-secondary, var(--tenant-primary)))',
                      minHeight: '90px',
                    }}
                  >
                    {label} kicks ⚽
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Kick outcome */}
          {phase === 'kick_outcome' && kicker && keeper && (
            <motion.div
              key="outcome"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <div className="text-center">
                <p className="text-white/80 font-semibold">
                  {kicker.fullName} shoots. {keeper.fullName} keeps.
                </p>
                <p className="text-white/40 text-sm mt-1">Record the outcome of the kick</p>
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
                      <p className="text-xl font-black">Confirm Outcome?</p>
                      <p className="text-white/60">
                        {OUTCOME_OPTIONS.find((o) => o.outcome === confirming)?.label}
                        <br />
                        <span className="text-sm text-white/40">
                          Winner: {determineOneGoalBowlWinner(kicker.id, keeper.id, confirming) === kicker.id ? kicker.fullName : keeper.fullName}
                        </span>
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setConfirming(null)}
                          className="py-3 rounded-xl border border-white/10 text-white/50 font-semibold hover:bg-white/5 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => { handleConfirmOutcome(confirming); setConfirming(null); }}
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

              <div className="grid grid-cols-1 gap-3">
                {OUTCOME_OPTIONS.map(({ outcome, label, emoji }) => (
                  <button
                    key={outcome}
                    onClick={() => setConfirming(outcome)}
                    className="tap-target w-full rounded-2xl transition-all active:scale-95 font-black text-xl tracking-tight"
                    style={{
                      background: 'linear-gradient(135deg, var(--tenant-primary), var(--tenant-secondary, var(--tenant-primary)))',
                      minHeight: '80px',
                    }}
                  >
                    {emoji} {label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setPhase('role_select')}
                className="w-full text-center text-xs text-white/30 hover:text-white/60 transition-colors py-1"
              >
                ← Redo role selection
              </button>
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
              <p className="text-white/40 text-sm">
                {winnerName ? `${winnerName} advances. ` : ''}Bracket updated.
              </p>
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
