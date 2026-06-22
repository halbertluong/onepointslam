'use client';

import { useState } from 'react';
import { calcGoalBased, calcPlayerBased, formatCurrency, DEFAULT_PLATFORM_FEE } from '@/lib/pricing';

interface FundraisingCalculatorProps {
  onPriceSet?: (entranceFeePerPlayer: number) => void;
}

export default function FundraisingCalculator({ onPriceSet }: FundraisingCalculatorProps) {
  const [mode, setMode] = useState<'goal' | 'player'>('goal');

  // Goal-based inputs
  const [goal, setGoal] = useState('10000');
  const [goalPlayerCount, setGoalPlayerCount] = useState('64');

  // Player-based inputs
  const [entranceFee, setEntranceFee] = useState('20');
  const [playerPlayerCount, setPlayerPlayerCount] = useState('64');

  const goalResult = calcGoalBased(parseFloat(goal) || 0, parseInt(goalPlayerCount) || 1);
  const playerResult = calcPlayerBased(parseFloat(entranceFee) || 0, parseInt(playerPlayerCount) || 1);

  const activeEntranceFee = mode === 'goal' ? goalResult.entranceFeePerPlayer : playerResult.entranceFeePerPlayer;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
      <div>
        <h3 className="font-bold text-slate-800 text-lg">Fundraising Calculator</h3>
        <p className="text-sm text-slate-500 mt-1">Set the entrance fee for your draw</p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setMode('goal')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
            mode === 'goal' ? 'text-white' : 'text-slate-600 bg-white hover:bg-slate-50'
          }`}
          style={mode === 'goal' ? { backgroundColor: 'var(--tenant-primary)' } : {}}
        >
          Goal-Based
        </button>
        <button
          onClick={() => setMode('player')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
            mode === 'player' ? 'text-white' : 'text-slate-600 bg-white hover:bg-slate-50'
          }`}
          style={mode === 'player' ? { backgroundColor: 'var(--tenant-primary)' } : {}}
        >
          Player-Based
        </button>
      </div>

      {mode === 'goal' ? (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Enter your fundraising goal and expected player count — we&apos;ll calculate the entrance fee per player.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Fundraising Goal ($)
              </label>
              <input
                type="number"
                min="0"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Expected Players
              </label>
              <input
                type="number"
                min="1"
                value={goalPlayerCount}
                onChange={(e) => setGoalPlayerCount(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1"
              />
            </div>
          </div>

          {/* Result */}
          <div className="rounded-xl overflow-hidden border border-slate-100">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Result</span>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex justify-between px-4 py-3">
                <span className="text-sm text-slate-600">Fundraising goal</span>
                <span className="text-sm font-semibold text-slate-700">{formatCurrency(parseFloat(goal) || 0)}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-sm text-slate-600">Players</span>
                <span className="text-sm font-semibold text-slate-700">{parseInt(goalPlayerCount) || 0}</span>
              </div>
              <div
                className="flex justify-between px-4 py-4"
                style={{ backgroundColor: 'color-mix(in srgb, var(--tenant-primary) 8%, white)' }}
              >
                <span className="text-sm font-bold text-slate-800">Entrance fee per player</span>
                <span className="text-base font-black" style={{ color: 'var(--tenant-primary)' }}>
                  {formatCurrency(goalResult.entranceFeePerPlayer)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Enter the entrance fee per player and your expected player count — we&apos;ll show your total school revenue.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Entrance Fee Per Player ($)
              </label>
              <input
                type="number"
                min="0"
                value={entranceFee}
                onChange={(e) => setEntranceFee(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Expected Players
              </label>
              <input
                type="number"
                min="1"
                value={playerPlayerCount}
                onChange={(e) => setPlayerPlayerCount(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1"
              />
            </div>
          </div>

          {/* Result */}
          <div className="rounded-xl overflow-hidden border border-slate-100">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Result</span>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex justify-between px-4 py-3">
                <span className="text-sm text-slate-600">Entrance fee per player</span>
                <span className="text-sm font-semibold text-slate-700">{formatCurrency(parseFloat(entranceFee) || 0)}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-sm text-slate-600">Players</span>
                <span className="text-sm font-semibold text-slate-700">{parseInt(playerPlayerCount) || 0}</span>
              </div>
              <div
                className="flex justify-between px-4 py-4"
                style={{ backgroundColor: 'color-mix(in srgb, var(--tenant-primary) 8%, white)' }}
              >
                <span className="text-sm font-bold text-slate-800">Total school revenue</span>
                <span className="text-base font-black" style={{ color: 'var(--tenant-primary)' }}>
                  {formatCurrency(playerResult.schoolRevenue)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Platform fee disclaimer */}
      <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <span className="text-slate-400 mt-0.5 shrink-0">ℹ️</span>
        <p className="text-xs text-slate-500 leading-relaxed">
          A <strong className="text-slate-700">{formatCurrency(DEFAULT_PLATFORM_FEE)} platform fee per registrant</strong> is
          charged separately at checkout and goes directly to One Point Slam. This fee is not
          included in the calculations above.
        </p>
      </div>

      {onPriceSet && (
        <button
          onClick={() => onPriceSet(activeEntranceFee)}
          className="btn-primary w-full py-3 rounded-xl font-semibold text-sm"
        >
          Use This Price — {formatCurrency(activeEntranceFee)} per player
        </button>
      )}
    </div>
  );
}
