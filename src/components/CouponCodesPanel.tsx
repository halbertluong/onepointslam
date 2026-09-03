'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { formatCurrency } from '@/lib/pricing';
import { couponsEnabled } from '@/lib/coupons';
import { mapCoupon, type Coupon, type Tournament } from '@/types';

interface Redemption {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Director-only tab: turns coupon codes on for this tournament and manages
 * the codes themselves.
 *
 * Off by default — nothing here is visible to registrants until a director
 * both flips the switch below and creates at least one code. Codes and their
 * usage counts live in their own table (not the settings jsonb everything
 * else on this page uses) because redemption has to be race-safe: two
 * registrants entering the same code at once can't both be handed the last
 * remaining use, which a read-then-write settings patch can't guarantee.
 */
export default function CouponCodesPanel({
  tournament,
  tournamentId,
  onSaveSettings,
}: {
  tournament: Tournament;
  tournamentId: string;
  /** Persists a settings patch — the same prop RegistrationPanel uses for its
   *  donate-link switch. */
  onSaveSettings: (patch: Partial<Tournament['settings']>) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(couponsEnabled(tournament.settings));
  const [enabledSaving, setEnabledSaving] = useState(false);

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  // Which registrants redeemed each coupon, keyed by coupon id — fetched
  // alongside the coupons themselves so expanding a row is instant rather than
  // a fresh round trip every time.
  const [redemptions, setRedemptions] = useState<Record<string, Redemption[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState('');
  const [limit, setLimit] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function fetchCouponsAndRedemptions(tid: string) {
    const supabase = createClient();
    const [{ data: couponRows, error: couponError }, { data: playerRows, error: playerError }] = await Promise.all([
      supabase.from('coupons').select('*').eq('tournament_id', tid).order('created_at', { ascending: false }),
      supabase.from('players').select('id, full_name, email, created_at, coupon_id').eq('tournament_id', tid).not('coupon_id', 'is', null),
    ]);
    const loadError = couponError ?? playerError;
    if (loadError) return { coupons: [] as Coupon[], redemptions: {} as Record<string, Redemption[]>, error: loadError.message };

    const byCoupon: Record<string, Redemption[]> = {};
    for (const row of (playerRows ?? []) as Record<string, unknown>[]) {
      const couponId = row.coupon_id as string;
      (byCoupon[couponId] ??= []).push({
        id: row.id as string,
        fullName: row.full_name as string,
        email: row.email as string,
        createdAt: row.created_at as string,
      });
    }
    return {
      coupons: (couponRows ?? []).map((row) => mapCoupon(row as Record<string, unknown>)),
      redemptions: byCoupon,
      error: undefined as string | undefined,
    };
  }

  const load = useCallback(async () => {
    const result = await fetchCouponsAndRedemptions(tournamentId);
    if (result.error) setError(result.error);
    else {
      setCoupons(result.coupons);
      setRedemptions(result.redemptions);
      setError('');
    }
    setLoading(false);
  }, [tournamentId]);

  // Reloads whenever the tournament changes. The guard drops a response that
  // arrives after this panel has moved on, so a slow request for the previous
  // tournament can't overwrite the current one's list.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchCouponsAndRedemptions(tournamentId);
      if (cancelled) return;
      if (result.error) setError(result.error);
      else {
        setCoupons(result.coupons);
        setRedemptions(result.redemptions);
        setError('');
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tournamentId]);

  function toggleExpanded(couponId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(couponId)) next.delete(couponId);
      else next.add(couponId);
      return next;
    });
  }

  async function toggleEnabled(next: boolean) {
    setEnabled(next);
    setEnabledSaving(true);
    try {
      await onSaveSettings({ couponCodesEnabled: next });
    } catch {
      setEnabled(!next); // save failed — don't leave the switch claiming otherwise
    }
    setEnabledSaving(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmedCode = code.trim().toUpperCase();
    const discountDollars = parseFloat(discount);
    const usageLimit = parseInt(limit, 10);
    if (!trimmedCode || isNaN(discountDollars) || discountDollars <= 0 || isNaN(usageLimit) || usageLimit <= 0) {
      setError('Enter a code, a discount amount greater than $0, and a limit of at least 1.');
      return;
    }

    setCreating(true);
    setError('');
    const supabase = createClient();
    const { error: insertError } = await supabase.from('coupons').insert({
      tournament_id: tournamentId,
      code: trimmedCode,
      discount_cents: Math.round(discountDollars * 100),
      usage_limit: usageLimit,
    });
    setCreating(false);
    if (insertError) {
      setError(
        insertError.code === '23505'
          ? `"${trimmedCode}" is already a coupon code for this tournament.`
          : insertError.message,
      );
      return;
    }
    setCode('');
    setDiscount('');
    setLimit('');
    await load();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError('');
    const supabase = createClient();
    const { error: deleteError } = await supabase.from('coupons').delete().eq('id', id);
    if (deleteError) setError(deleteError.message);
    setDeletingId(null);
    await load();
  }

  return (
    <div className="space-y-5">
      {/* On/off switch */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <h2 className="font-bold text-slate-800">Coupon Codes</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Let registrants enter a discount code on the registration page before they pay.
          </p>
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3.5 cursor-pointer hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            checked={enabled}
            disabled={enabledSaving}
            onChange={(e) => toggleEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-700">
              Accept coupon codes on this tournament
              {enabledSaving && <span className="text-xs font-normal text-slate-400 ml-2">Saving…</span>}
            </span>
            <span className="block text-xs text-slate-400 mt-0.5">
              {enabled
                ? 'Off by default. Registrants now see a coupon code field before paying.'
                : 'Codes below are kept even while this is off — turn it on to let registrants use them.'}
            </span>
          </span>
        </label>
      </div>

      {enabled && (
        <>
          {/* Create form */}
          <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">Create a coupon</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="SPRING10"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Discount
                </label>
                <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
                  <span className="px-3 py-2.5 bg-slate-50 text-slate-400 text-sm border-r border-slate-200">$</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="10.00"
                    className="flex-1 min-w-0 px-3 py-2.5 text-sm focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Usage Limit
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="20"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
            >
              {creating ? 'Creating…' : '+ Create Coupon'}
            </button>
          </form>

          {error && (
            <p className="text-sm bg-red-50 text-red-700 rounded-xl px-4 py-2.5">{error}</p>
          )}

          {/* List */}
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
              Loading coupons…
            </div>
          ) : coupons.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <p className="text-3xl mb-2">🎟️</p>
              <p className="font-semibold text-slate-600">No coupon codes yet</p>
              <p className="text-sm text-slate-400 mt-1">Create one above to get started.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left">
                      <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Code</th>
                      <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Discount</th>
                      <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Limit</th>
                      <th className="px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Used</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {coupons.map((c) => {
                      const isOpen = expanded.has(c.id);
                      const users = redemptions[c.id] ?? [];
                      return (
                        <Fragment key={c.id}>
                          <tr>
                            <td className="px-5 py-3 font-mono font-bold text-slate-800">{c.code}</td>
                            <td className="px-5 py-3 text-emerald-600 font-semibold">{formatCurrency(c.discountCents / 100)}</td>
                            <td className="px-5 py-3 text-slate-600">{c.usageLimit}</td>
                            <td className="px-5 py-3">
                              <button
                                type="button"
                                onClick={() => toggleExpanded(c.id)}
                                disabled={c.usedCount === 0}
                                aria-expanded={isOpen}
                                className="flex items-center gap-1.5 text-slate-600 font-semibold disabled:cursor-default group"
                                title={c.usedCount === 0 ? 'No registrants have used this code yet' : isOpen ? 'Hide who used this code' : 'Show who used this code'}
                              >
                                {c.usedCount > 0 && (
                                  <span className={`text-slate-400 text-[10px] transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                                )}
                                <span className={c.usedCount > 0 ? 'underline decoration-dotted underline-offset-2 group-hover:text-slate-900' : ''}>
                                  {c.usedCount}
                                </span>
                                {c.usedCount >= c.usageLimit && (
                                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wide">
                                    Exhausted
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button
                                onClick={() => handleDelete(c.id)}
                                disabled={deletingId === c.id}
                                className="text-xs text-slate-300 hover:text-red-600 font-semibold transition-colors disabled:opacity-50"
                              >
                                {deletingId === c.id ? '…' : 'Delete'}
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={5} className="px-5 py-3 bg-slate-50">
                                {users.length === 0 ? (
                                  <p className="text-xs text-slate-400">
                                    Recorded as used, but no matching registrant found yet — it may still be finishing payment.
                                  </p>
                                ) : (
                                  <ul className="divide-y divide-slate-200">
                                    {users.map((u) => (
                                      <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                                        <span className="font-semibold text-slate-700">{u.fullName}</span>
                                        <span className="text-slate-400 truncate">{u.email}</span>
                                        <span className="text-xs text-slate-400 shrink-0">{formatWhen(u.createdAt)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
