'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { saveSeedRatings } from '@/lib/tournamentWrites';
import type { Match, Player } from '@/types';

const PLAYER_STATUS_STYLE: Record<string, string> = {
  checked_in: 'bg-emerald-100 text-emerald-700',
  no_show_eliminated: 'bg-red-100 text-red-700',
  registered: 'bg-slate-100 text-slate-600',
};

export default function PlayersPanel({
  players,
  matches,
  bracketGenerated,
  onSaved,
}: {
  players: Player[];
  matches: Match[];
  bracketGenerated: boolean;
  onSaved: () => void;
}) {
  const [seedEdits, setSeedEdits] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    players.forEach((p) => { m[p.id] = p.seedRating != null ? String(p.seedRating) : ''; });
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const dirty = players.some((p) => (seedEdits[p.id] ?? '') !== (p.seedRating != null ? String(p.seedRating) : ''));

  async function handleSaveSeeds() {
    setSaving(true);
    await saveSeedRatings(createClient(), seedEdits);
    setSaving(false);
    setMsg('Seeds saved!');
    onSaved();
    setTimeout(() => setMsg(''), 2000);
  }

  // "In the bracket" means holding a first-round slot — that's the source of
  // truth for the draw; later rounds only ever fill by advancing.
  const placedIds = new Set(
    matches
      .filter((m) => m.roundIndex === 0)
      .flatMap((m) => [m.player1Id, m.player2Id])
      .filter((id): id is string => !!id && id !== 'BYE'),
  );

  const eliminatedIds = new Set(
    matches
      .filter((m) => m.winnerId)
      .flatMap((m) => [m.player1Id, m.player2Id])
      .filter((id): id is string => !!id && id !== 'BYE')
      .filter((id) => {
        const decided = matches.find(
          (m) => m.winnerId && (m.player1Id === id || m.player2Id === id) && m.winnerId !== id,
        );
        return !!decided;
      }),
  );

  const unplaced = bracketGenerated ? players.filter((p) => !placedIds.has(p.id)) : [];

  // Players missing from a generated draw sort to the very top — that's an
  // action the director needs to see immediately, not hunt for.
  const sorted = [...players].sort((a, b) => {
    const aMissing = bracketGenerated && !placedIds.has(a.id);
    const bMissing = bracketGenerated && !placedIds.has(b.id);
    if (aMissing !== bMissing) return aMissing ? -1 : 1;
    if (a.seedRating && b.seedRating) return a.seedRating - b.seedRating;
    if (a.seedRating) return -1;
    if (b.seedRating) return 1;
    return a.fullName.localeCompare(b.fullName);
  });

  function statusFor(p: Player): { label: string; cls: string } {
    if (bracketGenerated && !placedIds.has(p.id)) {
      return { label: '⚠ Not in bracket', cls: 'bg-amber-400 text-amber-950' };
    }
    if (p.status === 'no_show_eliminated') return { label: 'no show', cls: PLAYER_STATUS_STYLE.no_show_eliminated };
    if (placedIds.has(p.id)) {
      return eliminatedIds.has(p.id)
        ? { label: 'Eliminated', cls: 'bg-slate-200 text-slate-600' }
        : { label: 'In Bracket', cls: 'bg-emerald-100 text-emerald-700' };
    }
    return { label: p.status.replace(/_/g, ' '), cls: PLAYER_STATUS_STYLE[p.status] ?? PLAYER_STATUS_STYLE.registered };
  }

  return (
    <div className="space-y-4">
      {msg && <p className="text-sm bg-emerald-50 text-emerald-700 rounded-xl p-3">{msg}</p>}

      {unplaced.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 flex items-start gap-3">
          <span className="text-2xl shrink-0" aria-hidden>⚠️</span>
          <div className="min-w-0">
            <p className="font-black text-amber-900">
              {unplaced.length} player{unplaced.length === 1 ? '' : 's'} registered but not in the bracket
            </p>
            <p className="text-sm text-amber-800 mt-0.5">
              <strong>{unplaced.map((p) => p.fullName).join(', ')}</strong>{' '}
              {unplaced.length === 1 ? 'is' : 'are'} not in the draw. Add them from the Draw Editor tab,
              or they won&apos;t play.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-bold text-slate-800">Registered Players ({players.length})</h2>
          <button
            onClick={handleSaveSeeds}
            disabled={saving || !dirty}
            className="btn-primary px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
          >
            {saving ? 'Saving…' : dirty ? 'Save Seeds' : 'Seeds Saved'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Gender</th>
                <th className="px-4 py-3 text-left">NTRP</th>
                <th className="px-4 py-3 text-left">UTR</th>
                <th className="px-4 py-3 text-left">Seed</th>
                <th className="px-4 py-3 text-left">Tier</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-slate-400">No players yet</td></tr>
              )}
              {sorted.map((p, i) => {
                const missing = bracketGenerated && !placedIds.has(p.id);
                const status = statusFor(p);
                return (
                  <tr key={p.id} className={missing ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-slate-50'}>
                    <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                    <td className={`px-4 py-3 ${missing ? 'font-black text-amber-900' : 'font-medium text-slate-800'}`}>
                      {p.fullName}
                      {p.seedRating && (
                        <span className="ml-1.5 text-xs text-amber-600 font-bold">[{p.seedRating}]</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{p.gender ?? '—'}</td>
                    <td className="px-4 py-3">
                      {p.ntrpRating != null ? (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-semibold text-xs">{p.ntrpRating}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {p.utrRating != null ? (
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-semibold text-xs">{p.utrRating}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="1"
                        max={players.length}
                        value={seedEdits[p.id] ?? ''}
                        onChange={(e) => setSeedEdits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        placeholder="—"
                        aria-label={`Seed for ${p.fullName}`}
                        className="w-14 text-center border border-slate-200 rounded-lg py-1 text-xs focus:outline-none focus:border-slate-400"
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.skillTier ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${status.cls}`}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
