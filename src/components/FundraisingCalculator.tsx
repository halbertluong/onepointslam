'use client';

import { useState } from 'react';
import { calcGoalBased, calcMarginBased, formatCurrency, SYSTEM_TECH_FEE } from '@/lib/pricing';

interface FundraisingCalculatorProps {
  onPriceSet?: (price: number) => void;
}

export default function FundraisingCalculator({ onPriceSet }: FundraisingCalculatorProps) {
  const [mode, setMode] = useState<'goal' | 'margin'>('goal');
  const [goal, setGoal] = useState('1000');
  const [playerCount, setPlayerCount] = useState('64');
  const [margin, setMargin] = useState('15');

  const breakdown =
    mode === 'goal'
      ? calcGoalBased(parseFloat(goal) || 0, parseInt(playerCount) || 1)
      : calcMarginBased(parseFloat(margin) || 0);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
      <div>
        <h3 className="font-bold text-slate-800 text-lg">Fundraising Calculator</h3>
        <p className="text-sm text-slate-500 mt-1">Calculate player registration price</p>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setMode('goal')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
            mode === 'goal'
              ? 'text-white'
              : 'text-slate-600 bg-white hover:bg-slate-50'
          }`}
          style={mode === 'goal' ? { backgroundColor: 'var(--tenant-primary)' } : {}}
        >
          Goal-Based
        </button>
        <button
          onClick={() => setMode('margin')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
            mode === 'margin'
              ? 'text-white'
              : 'text-slate-600 bg-white hover:bg-slate-50'
          }`}
          style={mode === 'margin' ? { backgroundColor: 'var(--tenant-primary)' } : {}}
        >
          Margin-Based
        </button>
      </div>

      {mode === 'goal' ? (
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
              style={{ '--tw-ring-color': 'var(--tenant-primary)' } as React.CSSProperties}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Target Player Count
            </label>
            <input
              type="number"
              min="1"
              value={playerCount}
              onChange={(e) => setPlayerCount(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1"
            />
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Desired Profit Per Player ($)
          </label>
          <input
            type="number"
            min="0"
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1"
          />
        </div>
      )}

      {/* Breakdown */}
      <div className="rounded-xl overflow-hidden border border-slate-100">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Price Breakdown
          </span>
        </div>
        <div className="divide-y divide-slate-100">
          <div className="flex justify-between px-4 py-3">
            <span className="text-sm text-slate-600">School receives</span>
            <span className="text-sm font-semibold text-emerald-600">
              {formatCurrency(breakdown.schoolRevenue)}
            </span>
          </div>
          <div className="flex justify-between px-4 py-3">
            <span className="text-sm text-slate-600">Platform fee</span>
            <span className="text-sm font-semibold text-slate-500">
              {formatCurrency(breakdown.systemFee)}
            </span>
          </div>
          <div
            className="flex justify-between px-4 py-3"
            style={{ backgroundColor: 'color-mix(in srgb, var(--tenant-primary) 8%, white)' }}
          >
            <span className="text-sm font-bold text-slate-800">Player pays total</span>
            <span className="text-base font-black" style={{ color: 'var(--tenant-primary)' }}>
              {formatCurrency(breakdown.playerTotal)}
            </span>
          </div>
        </div>
      </div>

      {onPriceSet && (
        <button
          onClick={() => onPriceSet(breakdown.schoolRevenue)}
          className="btn-primary w-full py-3 rounded-xl font-semibold text-sm"
        >
          Use This Price
        </button>
      )}
    </div>
  );
}
