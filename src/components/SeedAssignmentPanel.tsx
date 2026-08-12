'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { saveSeedRatings } from '@/lib/tournamentWrites';
import type { Player } from '@/types';
import GenderDot from '@/components/GenderDot';

/**
 * Assigns seed numbers to players. Seeds only decide where players land when
 * the draw is built or redistributed — changing a seed here does not move
 * anyone in an existing bracket until you redistribute in the Draw Editor.
 */
export default function SeedAssignmentPanel({
  players,
  onSaved,
}: {
  players: Player[];
  onSaved: () => void;
}) {
  const [seedEdits, setSeedEdits] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    players.forEach((p) => { m[p.id] = p.seedRating != null ? String(p.seedRating) : ''; });
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleSaveSeeds() {
    setSaving(true);
    await saveSeedRatings(createClient(), seedEdits);
    setSaving(false);
    setMsg('Seeds saved!');
    onSaved();
    setTimeout(() => setMsg(''), 2000);
  }

  function handleClearAll() {
    setSeedEdits(Object.fromEntries(players.map((p) => [p.id, ''])));
  }

  /** Duplicate seed numbers would make the draw ambiguous — flag them inline. */
  const seedCounts = Object.values(seedEdits).reduce<Record<string, number>>((acc, v) => {
    const t = v.trim();
    if (t) acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  const duplicates = Object.entries(seedCounts).filter(([, n]) => n > 1).map(([s]) => s);

  const seeded = players
    .filter((p) => seedEdits[p.id]?.trim())
    .sort((a, b) => (parseInt(seedEdits[a.id]) || 99) - (parseInt(seedEdits[b.id]) || 99));

  const sorted = [...players].sort((a, b) => {
    const sa = parseInt(seedEdits[a.id]) || Infinity;
    const sb = parseInt(seedEdits[b.id]) || Infinity;
    if (sa !== sb) return sa - sb;
    return a.fullName.localeCompare(b.fullName);
  });

  return (
    <div className="space-y-6">
      {msg && <p className="text-sm bg-emerald-50 text-emerald-700 rounded-xl p-3">{msg}</p>}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-slate-800">Seed Assignments</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Seed 1 is the top player. Seeds decide bracket placement when you build or
              redistribute the draw.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearAll}
              disabled={saving}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              Clear All
            </button>
            <button
              onClick={handleSaveSeeds}
              disabled={saving}
              className="btn-primary px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Seeds'}
            </button>
          </div>
        </div>

        {duplicates.length > 0 && (
          <p className="px-6 py-2.5 text-xs font-semibold text-amber-700 bg-amber-50 border-b border-amber-100">
            ⚠ Seed {duplicates.join(', ')} {duplicates.length === 1 ? 'is' : 'are'} assigned to more than
            one player — the draw will place them in an arbitrary order.
          </p>
        )}

        {players.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-400">No players registered yet.</p>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {sorted.map((p) => {
              const val = seedEdits[p.id] ?? '';
              const isDupe = !!val.trim() && duplicates.includes(val.trim());
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 rounded-xl p-2.5 border ${
                    isDupe ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'
                  }`}
                >
                  <GenderDot gender={p.gender} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{p.fullName}</p>
                    <div className="flex flex-wrap gap-x-2 gap-y-0 mt-0.5">
                      {p.ntrpRating != null && <span className="text-xs text-blue-500 font-medium">NTRP {p.ntrpRating}</span>}
                      {p.utrRating != null && <span className="text-xs text-purple-500 font-medium">UTR {p.utrRating}</span>}
                      {p.age != null && <span className="text-xs text-slate-400">{p.age}y</span>}
                    </div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max={players.length}
                    value={val}
                    onChange={(e) => setSeedEdits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder="—"
                    aria-label={`Seed for ${p.fullName}`}
                    className="w-11 text-center border border-slate-200 rounded-lg py-1 text-xs focus:outline-none bg-white"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {seeded.length > 0 && (
        <div className="bg-slate-50 rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Seed Order ({seeded.length} seeded)
          </p>
          <div className="flex flex-wrap gap-2">
            {seeded.map((p) => (
              <span key={p.id} className="px-2.5 py-1 bg-white border border-slate-200 rounded-full text-xs font-semibold text-slate-700">
                [{seedEdits[p.id]}] {p.fullName}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
