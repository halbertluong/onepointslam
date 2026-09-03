'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { saveSeedRatings, withdrawPlayer } from '@/lib/tournamentWrites';
import { getRoundsCount } from '@/lib/bracket';
import AwaitingPaymentTable from '@/components/AwaitingPaymentTable';
import PlayerDetailModal from '@/components/PlayerDetailModal';
import type { Match, PendingRegistration, Player } from '@/types';

/** Optional columns a director can hide to focus on what matters to them.
 *  '#' and Name are always shown — they're how you find a row — and Actions
 *  always shows because withdrawing a player needs to stay reachable. */
const OPTIONAL_COLUMNS = [
  { key: 'gender', label: 'Gender' },
  { key: 'ntrp', label: 'NTRP' },
  { key: 'utr', label: 'UTR' },
  { key: 'seed', label: 'Seed' },
  { key: 'tier', label: 'Tier' },
  { key: 'status', label: 'Status' },
  { key: 'payment', label: 'Payment' },
] as const;
type ColumnKey = (typeof OPTIONAL_COLUMNS)[number]['key'];

const COLUMNS_STORAGE_KEY = 'td-players-table-columns';

function loadVisibleColumns(): Record<ColumnKey, boolean> {
  const defaults = Object.fromEntries(OPTIONAL_COLUMNS.map((c) => [c.key, true])) as Record<ColumnKey, boolean>;
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

const PLAYER_STATUS_STYLE: Record<string, string> = {
  checked_in: 'bg-emerald-100 text-emerald-700',
  no_show_eliminated: 'bg-red-100 text-red-700',
  registered: 'bg-slate-100 text-slate-600',
};

const PAYMENT_STATUS_STYLE: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-slate-200 text-slate-600',
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  paid: 'Paid',
  pending: 'Unpaid',
  failed: 'Failed',
  refunded: 'Refunded',
};

export default function PlayersPanel({
  players,
  matches,
  bracketGenerated,
  tournamentId,
  /** Draw size, for computing how many rounds a withdrawal's walkover needs to advance through. */
  maxPlayers = 8,
  /** The tournament's entry fee — when 0, this is a free event and there's
   *  nothing to reconcile, so the Payment column is hidden entirely. */
  entranceFee = 0,
  pendingRegistrations = [],
  onViewPayment,
  onDismissPending,
  onSaved,
}: {
  players: Player[];
  matches: Match[];
  bracketGenerated: boolean;
  tournamentId: string;
  maxPlayers?: number;
  entranceFee?: number;
  /** Registrations reserved before payment finished — see AwaitingPaymentTable. */
  pendingRegistrations?: PendingRegistration[];
  /** Jumps to the Payments tab, highlighting this payment. */
  onViewPayment: (paymentIntentId: string) => void;
  onDismissPending: (id: string) => Promise<{ error?: string }>;
  onSaved: () => void;
}) {
  const showPayments = entranceFee > 0;
  const unpaidPlayers = showPayments ? players.filter((p) => p.paymentStatus !== 'paid') : [];
  const [seedEdits, setSeedEdits] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    players.forEach((p) => { m[p.id] = p.seedRating != null ? String(p.seedRating) : ''; });
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const selectedPlayer = selectedPlayerId ? players.find((p) => p.id === selectedPlayerId) ?? null : null;
  const [visibleCols, setVisibleCols] = useState<Record<ColumnKey, boolean>>(loadVisibleColumns);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setColumnsOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function toggleColumn(key: ColumnKey) {
    setVisibleCols((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const dirty = players.some((p) => (seedEdits[p.id] ?? '') !== (p.seedRating != null ? String(p.seedRating) : ''));

  async function handleSaveSeeds() {
    setSaving(true);
    const { error } = await saveSeedRatings(createClient(), seedEdits);
    setSaving(false);
    if (error) { setErr(`Could not save seeds: ${error}`); return; }
    setErr('');
    setMsg('Seeds saved!');
    onSaved();
    setTimeout(() => setMsg(''), 2000);
  }

  async function handleWithdraw(p: Player) {
    if (!window.confirm(
      `Withdraw ${p.fullName} from the tournament? If they have an active match, ` +
      'their opponent will be awarded a walkover.',
    )) return;
    setWithdrawingId(p.id);
    const { error } = await withdrawPlayer(createClient(), matches, tournamentId, p.id, getRoundsCount(maxPlayers));
    setWithdrawingId(null);
    if (error) { setErr(`Could not withdraw ${p.fullName}: ${error}`); return; }
    setErr('');
    setMsg(`${p.fullName} withdrawn.`);
    onSaved();
    setTimeout(() => setMsg(''), 2500);
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

  // A withdrawn player who never held a slot isn't "missing" — they were
  // deliberately pulled, not left behind, so they don't belong in either the
  // warning banner or the amber "needs attention" sort/status below.
  const missingFromBracket = (p: Player) =>
    bracketGenerated && p.status !== 'no_show_eliminated' && !placedIds.has(p.id);

  const unplaced = players.filter(missingFromBracket);

  // Players missing from a generated draw sort to the very top — that's an
  // action the director needs to see immediately, not hunt for.
  const sorted = [...players].sort((a, b) => {
    const aMissing = missingFromBracket(a);
    const bMissing = missingFromBracket(b);
    if (aMissing !== bMissing) return aMissing ? -1 : 1;
    if (a.seedRating && b.seedRating) return a.seedRating - b.seedRating;
    if (a.seedRating) return -1;
    if (b.seedRating) return 1;
    return a.fullName.localeCompare(b.fullName);
  });

  function statusFor(p: Player): { label: string; cls: string } {
    if (p.status === 'no_show_eliminated') return { label: 'no show', cls: PLAYER_STATUS_STYLE.no_show_eliminated };
    if (missingFromBracket(p)) {
      return { label: '⚠ Not in bracket', cls: 'bg-amber-400 text-amber-950' };
    }
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
      {err && <p className="text-sm bg-red-50 text-red-700 rounded-xl p-3">{err}</p>}

      {showPayments && (
        <AwaitingPaymentTable
          pendingRegistrations={pendingRegistrations}
          onViewPayment={onViewPayment}
          onDismiss={onDismissPending}
        />
      )}

      {unpaidPlayers.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 flex items-start gap-3">
          <span className="text-2xl shrink-0" aria-hidden>💳</span>
          <div className="min-w-0">
            <p className="font-black text-amber-900">
              {unpaidPlayers.length} registrant{unpaidPlayers.length === 1 ? '' : 's'} without a payment on file
            </p>
            <p className="text-sm text-amber-800 mt-0.5">
              <strong>{unpaidPlayers.map((p) => p.fullName).join(', ')}</strong>{' '}
              {unpaidPlayers.length === 1 ? 'is' : 'are'} registered for a paid tournament but haven&apos;t
              paid. This is expected for offline entries recorded as unpaid — otherwise, verify the
              Stripe payment.
            </p>
          </div>
        </div>
      )}

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
          <div className="flex items-center gap-2">
            <div className="relative" ref={columnsMenuRef}>
              <button
                onClick={() => setColumnsOpen((v) => !v)}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Columns
              </button>
              {columnsOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-10 py-2">
                  {OPTIONAL_COLUMNS.filter((c) => c.key !== 'payment' || showPayments).map((c) => (
                    <label
                      key={c.key}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={visibleCols[c.key]}
                        onChange={() => toggleColumn(c.key)}
                        className="rounded border-slate-300"
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleSaveSeeds}
              disabled={saving || !dirty}
              className="btn-primary px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
            >
              {saving ? 'Saving…' : dirty ? 'Save Seeds' : 'Seeds Saved'}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Name</th>
                {visibleCols.gender && <th className="px-4 py-3 text-left">Gender</th>}
                {visibleCols.ntrp && <th className="px-4 py-3 text-left">NTRP</th>}
                {visibleCols.utr && <th className="px-4 py-3 text-left">UTR</th>}
                {visibleCols.seed && <th className="px-4 py-3 text-left">Seed</th>}
                {visibleCols.tier && <th className="px-4 py-3 text-left">Tier</th>}
                {visibleCols.status && <th className="px-4 py-3 text-left">Status</th>}
                {showPayments && visibleCols.payment && <th className="px-4 py-3 text-left">Payment</th>}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.length === 0 && (
                <tr><td colSpan={10} className="px-6 py-8 text-center text-slate-400">No players yet</td></tr>
              )}
              {sorted.map((p, i) => {
                const missing = missingFromBracket(p);
                const status = statusFor(p);
                return (
                  <tr key={p.id} className={missing ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-slate-50'}>
                    <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                    <td className={`px-4 py-3 ${missing ? 'font-black text-amber-900' : 'font-medium text-slate-800'}`}>
                      <button
                        onClick={() => setSelectedPlayerId(p.id)}
                        className="hover:underline underline-offset-2 text-left"
                      >
                        {p.fullName}
                      </button>
                      {p.seedRating && (
                        <span className="ml-1.5 text-xs text-amber-600 font-bold">[{p.seedRating}]</span>
                      )}
                    </td>
                    {visibleCols.gender && <td className="px-4 py-3 text-slate-500 capitalize">{p.gender ?? '—'}</td>}
                    {visibleCols.ntrp && (
                      <td className="px-4 py-3">
                        {p.ntrpRating != null ? (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-semibold text-xs">{p.ntrpRating}</span>
                        ) : '—'}
                      </td>
                    )}
                    {visibleCols.utr && (
                      <td className="px-4 py-3">
                        {p.utrRating != null ? (
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-semibold text-xs">{p.utrRating}</span>
                        ) : '—'}
                      </td>
                    )}
                    {visibleCols.seed && (
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
                    )}
                    {visibleCols.tier && <td className="px-4 py-3 text-slate-500">{p.skillTier ?? '—'}</td>}
                    {visibleCols.status && (
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>
                    )}
                    {showPayments && visibleCols.payment && (
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${PAYMENT_STATUS_STYLE[p.paymentStatus ?? 'pending']}`}>
                          {PAYMENT_STATUS_LABEL[p.paymentStatus ?? 'pending']}
                        </span>
                        {p.stripePaymentIntentId && (
                          <button
                            onClick={() => onViewPayment(p.stripePaymentIntentId!)}
                            className="ml-2 text-xs font-semibold text-slate-400 hover:text-slate-600 underline underline-offset-2"
                          >
                            View →
                          </button>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {p.status !== 'no_show_eliminated' ? (
                        <button
                          onClick={() => handleWithdraw(p)}
                          disabled={withdrawingId === p.id}
                          className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50"
                        >
                          {withdrawingId === p.id ? 'Withdrawing…' : 'Withdraw'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          showPayments={showPayments}
          onClose={() => setSelectedPlayerId(null)}
          onViewPayment={onViewPayment}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
