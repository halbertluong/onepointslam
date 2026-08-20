'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import GenderDot from '@/components/GenderDot';
import { promoteFromWaitlist } from '@/lib/tournamentWrites';
import { byRegistrationOrder, formatRegisteredAt } from '@/lib/waitlist';
import type { Match, Player } from '@/types';

export default function WaitlistPanel({
  players,
  matches,
  tournamentId,
  onSaved,
}: {
  players: Player[];
  matches: Match[];
  tournamentId: string;
  onSaved: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const round0 = matches.filter((m) => m.bracket === 'main' && m.roundIndex === 0);
  const bracketExists = round0.length > 0;
  const openSlots = round0.reduce((n, m) => n + (m.player1Id ? 0 : 1) + (m.player2Id ? 0 : 1), 0);

  const waitlisted = byRegistrationOrder(players.filter((p) => p.status === 'waitlisted'));

  function flash(text: string) {
    setMsg(text);
    setErr('');
    onSaved();
    setTimeout(() => setMsg(''), 2500);
  }

  async function handlePromote(playerId: string) {
    setBusyId(playerId);
    const { error } = await promoteFromWaitlist(createClient(), tournamentId, playerId);
    setBusyId(null);
    if (error) { setErr(`Could not promote that player: ${error}`); return; }
    flash('Player promoted off the waitlist.');
  }

  async function handlePromoteAllThatFit() {
    if (openSlots === 0) return;
    setBulkBusy(true);
    const supabase = createClient();
    const batch = waitlisted.slice(0, openSlots);
    let promoted = 0;
    for (const p of batch) {
      const { error } = await promoteFromWaitlist(supabase, tournamentId, p.id);
      if (error) { setBulkBusy(false); setErr(`Stopped after promoting ${promoted}: ${error}`); onSaved(); return; }
      promoted += 1;
    }
    setBulkBusy(false);
    flash(`Promoted ${promoted} player${promoted === 1 ? '' : 's'} off the waitlist.`);
  }

  return (
    <div className="space-y-4">
      {msg && <p className="text-sm bg-emerald-50 text-emerald-700 rounded-xl p-3">{msg}</p>}
      {err && <p className="text-sm bg-red-50 text-red-700 rounded-xl p-3">{err}</p>}

      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-500">
          {!bracketExists
            ? 'No bracket generated yet — nobody is waitlisted until one exists.'
            : openSlots > 0
            ? `${openSlots} open slot${openSlots === 1 ? '' : 's'} in the bracket right now.`
            : 'The bracket is full — promoting someone here means placing them manually, or rebuilding at a larger draw size in the Draw Editor.'}
        </p>
        {waitlisted.length > 0 && openSlots > 0 && (
          <button
            onClick={handlePromoteAllThatFit}
            disabled={bulkBusy}
            className="btn-primary px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
          >
            {bulkBusy ? 'Promoting…' : `⬆ Promote ${Math.min(openSlots, waitlisted.length)} to fill open slots`}
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">Waitlist ({waitlisted.length})</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ordered by registration time — earliest waiting players are first in line for a seat.
          </p>
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
                <th className="px-4 py-3 text-left">Tier</th>
                <th className="px-4 py-3 text-left">Registered</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {waitlisted.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-slate-400">Nobody is waitlisted.</td></tr>
              )}
              {waitlisted.map((p, i) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      <GenderDot gender={p.gender} />
                      {p.fullName}
                    </div>
                    <div className="text-xs text-slate-400">{p.email}</div>
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
                  <td className="px-4 py-3 text-slate-500">{p.skillTier ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatRegisteredAt(p.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handlePromote(p.id)}
                      disabled={busyId === p.id || bulkBusy}
                      title={bracketExists && openSlots === 0 ? 'No open bracket slot — they will land back among the registered-but-unplaced' : 'Move back onto the active roster'}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 whitespace-nowrap"
                    >
                      {busyId === p.id ? '…' : '⬆ Promote'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
