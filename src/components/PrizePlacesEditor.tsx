'use client';

import type { PrizePlace } from '@/types';

const PLACE_LABELS: Record<number, string> = { 1: '1st Place', 2: '2nd Place', 3: '3rd Place', 4: '4th Place' };

export default function PrizePlacesEditor({
  places,
  ticketPrice,
  onChange,
}: {
  places: PrizePlace[];
  ticketPrice: number;
  onChange: (p: PrizePlace[]) => void;
}) {
  function addPlace() {
    const next = places.length + 1;
    onChange([...places, { place: next, type: 'fixed', value: 0 }]);
  }
  function remove(i: number) {
    onChange(places.filter((_, idx) => idx !== i).map((p, idx) => ({ ...p, place: idx + 1 })));
  }
  function update(i: number, field: 'type' | 'value', val: string) {
    onChange(places.map((p, idx) =>
      idx === i ? { ...p, [field]: field === 'value' ? parseFloat(val) || 0 : val } : p
    ) as PrizePlace[]);
  }
  const totalPct = places.filter((p) => p.type === 'percentage').reduce((s, p) => s + p.value, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Prize Places</label>
        {places.length < 4 && (
          <button
            type="button"
            onClick={addPlace}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
          >
            + Add Place
          </button>
        )}
      </div>
      {places.length === 0 && (
        <p className="text-sm text-slate-400 py-2">No prize places — click &quot;Add Place&quot; to configure.</p>
      )}
      {places.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-600 w-16 shrink-0">{PLACE_LABELS[p.place] ?? `${p.place}th`}</span>
          <select
            value={p.type}
            onChange={(e) => update(i, 'type', e.target.value)}
            className="border border-slate-200 rounded-xl px-2.5 py-2 text-sm focus:outline-none"
          >
            <option value="fixed">$ Fixed</option>
            <option value="percentage">% of pool</option>
          </select>
          <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden flex-1">
            <span className="px-2.5 py-2 bg-slate-50 text-slate-400 text-sm border-r border-slate-200">
              {p.type === 'fixed' ? '$' : '%'}
            </span>
            <input
              type="number"
              min="0"
              step={p.type === 'fixed' ? '5' : '1'}
              max={p.type === 'percentage' ? 100 : undefined}
              value={p.value || ''}
              onChange={(e) => update(i, 'value', e.target.value)}
              className="flex-1 px-3 py-2 text-sm focus:outline-none"
              placeholder="0"
            />
          </div>
          {p.type === 'percentage' && ticketPrice > 0 && (
            <span className="text-xs text-slate-400 shrink-0 w-16 text-right">
              ≈ ${((p.value / 100) * ticketPrice).toFixed(0)}/player
            </span>
          )}
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-slate-300 hover:text-red-400 text-lg leading-none"
          >
            ×
          </button>
        </div>
      ))}
      {totalPct > 100 && (
        <p className="text-xs text-red-500 font-semibold">⚠ Percentage total exceeds 100% ({totalPct}%)</p>
      )}
    </div>
  );
}
