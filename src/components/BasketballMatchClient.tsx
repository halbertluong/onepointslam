'use client';

import { useState } from 'react';
import CoinTossAnimation from './CoinTossAnimation';
import { motion, AnimatePresence } from 'framer-motion';
import type { Match, Player, PossessionOutcome } from '@/types';
import { determineOnePointBowlWinner } from '@/lib/bracket';

type Phase = 'player_check' | 'coin_flip' | 'role_select' | 'possession_outcome' | 'finalized';

interface Props {
  match: Match;
  player1: Player;
  player2: Player;
  tournamentName: string;
  /** Called once the possession outcome is recorded. Caller is responsible for persistence and winner advancement. */
  onDeclareResult: (
    coinFlipWinnerId: string,
    offensePlayerId: string,
    defensePlayerId: string,
    outcome: PossessionOutcome,
  ) => void | Promise<void>;
  /** Called when a walkover is given. `winnerId` is the advancing player. */
  onWalkover: (winnerId: string) => void | Promise<void>;
  onBack: () => void;
  onNext: () => void;
}

const OUTCOME_OPTIONS: { outcome: PossessionOutcome; label: string; emoji: string }[] = [
  { outcome: 'made', label: 'Made Shot — Offense Scores', emoji: '🏀' },
  { outcome: 'missed', label: 'Missed Shot', emoji: '❌' },
  { outcome: 'stolen', label: 'Stolen by Defense', emoji: '🖐️' },
  { outcome: 'blocked', label: 'Blocked by Defense', emoji: '🚫' },
];

export default function BasketballMatchClient({
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
      : match.offensePlayerId
      ? 'possession_outcome'
      : match.coinFlipWinnerId
      ? 'role_select'
      : 'player_check';

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [coinFlipWinnerId, setCoinFlipWinnerId] = useState<string | null>(match.coinFlipWinnerId ?? null);
  const [offenseId, setOffenseId] = useState<string | null>(match.offensePlayerId ?? null);
  const [defenseId, setDefenseId] = useState<string | null>(match.defensePlayerId ?? null);
  const [confirming, setConfirming] = useState<PossessionOutcome | null>(null);
  const [saving, setSaving] = useState(false);

  const p1Name = player1.fullName;
  const p2Name = player2.fullName;

  const coinFlipWinner = coinFlipWinnerId === player1.id ? player1 : coinFlipWinnerId === player2.id ? player2 : null;
  const offense = offenseId === player1.id ? player1 : offenseId === player2.id ? player2 : null;
  const defense = defenseId === player1.id ? player1 : defenseId === player2.id ? player2 : null;

  async function handleWalkover(winnerId: string) {
    setSaving(true);
    await onWalkover(winnerId);
    setSaving(false);
    setPhase('finalized');
  }

  function handleCoinFlipResult(result: 'player1' | 'player2') {
    setCoinFlipWinnerId(result === 'player1' ? player1.id : player2.id);
    setPhase('role_select');
  }

  function handleRoleSelect(role: 'offense' | 'defense') {
    if (!coinFlipWinnerId) return;
    const otherId = coinFlipWinnerId === player1.id ? player2.id : player1.id;
    if (role === 'offense') {
      setOffenseId(coinFlipWinnerId);
      setDefenseId(otherId);
    } else {
      setDefenseId(coinFlipWinnerId);
      setOffenseId(otherId);
    }
    setPhase('possession_outcome');
  }

  async function handleConfirmOutcome(outcome: PossessionOutcome) {
    if (!coinFlipWinnerId || !offenseId || !defenseId) return;
    setSaving(true);
    await onDeclareResult(coinFlipWinnerId, offenseId, defenseId, outcome);
    setSaving(false);
    setPhase('finalized');
  }

  const winnerId = offenseId && defenseId && match.possessionOutcome
    ? determineOnePointBowlWinner(offenseId, defenseId, match.possessionOutcome)
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
            One Point Bowl
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
            const role = key === offenseId ? 'Offense' : key === defenseId ? 'Defense' : null;
            const isFlipWinner = !role && key === coinFlipWinnerId;
            return (
              <div
                key={key}
                className="rounded-2xl p-4 transition-all bg-white/5"
                style={
                  role || isFlipWinner
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
                      {role === 'Offense' ? '🏀 Offense' : '🛡️ Defense'}
                    </div>
                  )}
                  {isFlipWinner && (
                    <div className="text-xs font-semibold mt-0.5" style={{ color: 'var(--tenant-primary)' }}>
                      Won the flip
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
                <p className="text-white/40 text-sm">Are both players on the court and ready?</p>
              </div>

              <button
                onClick={() => setPhase('coin_flip')}
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

          {/* Coin flip */}
          {phase === 'coin_flip' && (
            <motion.div
              key="flip"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white/5 rounded-2xl overflow-hidden"
            >
              <CoinTossAnimation
                player1Name={p1Name}
                player2Name={p2Name}
                onResult={handleCoinFlipResult}
                title="Coin Flip — Who Chooses?"
                resultLabel="wins the flip and picks offense or defense"
                icon="🏀"
              />
              <div className="px-5 pb-5">
                <p className="text-xs text-white/30 text-center mb-2">Or manually assign the coin flip winner:</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: p1Name, val: 'player1' as const },
                    { label: p2Name, val: 'player2' as const },
                  ].map(({ label, val }) => (
                    <button
                      key={val}
                      onClick={() => handleCoinFlipResult(val)}
                      className="bg-white/5 hover:bg-white/10 rounded-xl py-2.5 text-sm font-semibold text-white/60 transition-colors"
                    >
                      {label} wins flip
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Role selection */}
          {phase === 'role_select' && coinFlipWinner && (
            <motion.div
              key="roles"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="bg-white/5 rounded-2xl p-5 text-center">
                <p className="text-white/80 font-semibold mb-1">{coinFlipWinner.fullName} won the flip</p>
                <p className="text-white/40 text-sm">They choose offense or defense. The other player gets the remaining role automatically.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleRoleSelect('offense')}
                  className="tap-target w-full rounded-2xl transition-all active:scale-95 font-black text-lg tracking-tight"
                  style={{
                    background: 'linear-gradient(135deg, var(--tenant-primary), var(--tenant-secondary, var(--tenant-primary)))',
                    minHeight: '90px',
                  }}
                >
                  Offense 🏀
                </button>
                <button
                  onClick={() => handleRoleSelect('defense')}
                  className="tap-target w-full rounded-2xl transition-all active:scale-95 font-black text-lg tracking-tight"
                  style={{
                    background: 'linear-gradient(135deg, var(--tenant-primary), var(--tenant-secondary, var(--tenant-primary)))',
                    minHeight: '90px',
                  }}
                >
                  Defense 🛡️
                </button>
              </div>
            </motion.div>
          )}

          {/* Possession outcome */}
          {phase === 'possession_outcome' && offense && defense && (
            <motion.div
              key="outcome"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <div className="text-center">
                <p className="text-white/80 font-semibold">
                  {offense.fullName} shoots. {defense.fullName} defends.
                </p>
                <p className="text-white/40 text-sm mt-1">Record the outcome of the possession</p>
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
                          Winner: {determineOnePointBowlWinner(offense.id, defense.id, confirming) === offense.id ? offense.fullName : defense.fullName}
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
                    className="tap-target w-full rounded-2xl transition-all active:scale-95 font-black text-lg tracking-tight"
                    style={{
                      background: 'linear-gradient(135deg, var(--tenant-primary), var(--tenant-secondary, var(--tenant-primary)))',
                      minHeight: '72px',
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
