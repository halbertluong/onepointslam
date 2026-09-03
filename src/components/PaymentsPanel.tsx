'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatCurrency } from '@/lib/pricing';
import type { AnnotatedPayment, ReconciliationReport, StripePayment } from '@/lib/reconciliation';

type Report = ReconciliationReport & { tournamentName?: string };

const MATCH_STATE_STYLE: Record<AnnotatedPayment['matchState'], string> = {
  confirmed: 'bg-emerald-100 text-emerald-700',
  stuck: 'bg-amber-100 text-amber-800',
  stale: 'bg-amber-100 text-amber-800',
  orphan: 'bg-red-100 text-red-700',
};
const MATCH_STATE_LABEL: Record<AnnotatedPayment['matchState'], string> = {
  confirmed: 'Confirmed',
  stuck: 'Needs promoting',
  stale: 'Needs syncing',
  orphan: 'No record',
};

/**
 * The money check: what Stripe took for this tournament, against what the app
 * recorded — every succeeded payment, tagged with whether it's a normal
 * confirmed entry, a reservation that never got promoted, a stale legacy
 * status, or a payment with no record at all. Its job is to surface the case
 * nobody notices otherwise and let a director fix it on the spot rather than
 * reading a Stripe export by hand.
 */
export default function PaymentsPanel({ tournamentId, focusPaymentIntentId, onRecovered }: {
  tournamentId: string;
  /** Scrolls to and highlights this payment on load — set when a director
   *  clicks through from a player row in the Players tab. */
  focusPaymentIntentId?: string | null;
  onRecovered?: () => void;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [edits, setEdits] = useState<Record<string, { fullName: string; email: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const focusRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/payments/reconcile?tournamentId=${tournamentId}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Could not load payments.'); setReport(null); }
      else { setReport(json as Report); setError(''); }
    } catch {
      setError('Could not reach the server.');
    }
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (focusPaymentIntentId && report && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusPaymentIntentId, report]);

  function recheck() {
    setLoading(true);
    setError('');
    load();
  }

  function detailsFor(p: StripePayment) {
    return edits[p.id] ?? { fullName: p.registrantName ?? '', email: p.registrantEmail ?? '' };
  }

  async function act(paymentIntentId: string, action: 'recover' | 'promote' | 'sync', extra?: { fullName: string; email: string }) {
    setBusy(paymentIntentId);
    setNotice('');
    const res = await fetch('/api/payments/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId, paymentIntentId, action, ...extra }),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) { setError(json.error ?? 'Could not update this payment.'); return; }
    setNotice(
      json.linkedExisting ? 'Payment linked to the registration that already existed.'
        : json.alreadyRecorded ? 'That payment was already recorded.'
        : action === 'promote' ? 'Moved into the tournament roster, paid.'
        : action === 'sync' ? 'Marked as paid.'
        : extra ? `${extra.fullName} added to the tournament.` : 'Donation recorded.',
    );
    await load();
    onRecovered?.();
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-400">Checking Stripe…</div>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}{' '}
          <button onClick={recheck} className="font-semibold underline underline-offset-2">Try again</button>
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat label="Taken in Stripe" value={formatCurrency(report.stripeTotalCents / 100)} />
            <Stat label="Confirmed" value={formatCurrency(report.confirmedCents / 100)} />
            <Stat
              label="Needs attention"
              value={formatCurrency((report.stripeTotalCents - report.confirmedCents) / 100)}
              tone={report.balanced ? 'ok' : 'alert'}
            />
          </div>

          {report.balanced ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
              ✓ Every payment Stripe has taken for this tournament is confirmed here
              {report.matchedCount > 0 ? ` — ${report.matchedCount} in total` : ''}.
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              <strong>
                {report.orphans.length + report.stuckReservations.length + report.staleStatus.length} payment
                {report.orphans.length + report.stuckReservations.length + report.staleStatus.length === 1 ? '' : 's'} need attention below.
              </strong>{' '}
              Cards were charged but didn&apos;t end up correctly reflected in the roster — fix each one on the spot.
            </div>
          )}

          {report.stuckReservations.map((r) => {
            const p = report.payments.find((x) => x.id === r.paymentIntentId);
            return (
              <div
                key={r.paymentIntentId}
                ref={(el) => { if (r.paymentIntentId === focusPaymentIntentId) focusRef.current = el; }}
                className={`rounded-2xl border p-5 flex items-center justify-between gap-4 flex-wrap ${r.paymentIntentId === focusPaymentIntentId ? 'border-purple-400 ring-2 ring-purple-200' : 'border-slate-200 bg-white'}`}
              >
                <div>
                  <p className="font-bold text-slate-800">{r.label} · {p ? formatCurrency(p.amountCents / 100) : ''}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Paid in Stripe, still sitting as an open reservation. <span className="font-mono">{r.paymentIntentId}</span>
                  </p>
                </div>
                <button
                  onClick={() => act(r.paymentIntentId, 'promote')}
                  disabled={busy === r.paymentIntentId}
                  className="btn-primary px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-60"
                >
                  {busy === r.paymentIntentId ? 'Moving…' : 'Move to roster'}
                </button>
              </div>
            );
          })}

          {report.orphans.map((p) => {
            const d = detailsFor(p);
            return (
              <div
                key={p.id}
                ref={(el) => { if (p.id === focusPaymentIntentId) focusRef.current = el; }}
                className={`rounded-2xl border p-5 space-y-3 ${p.id === focusPaymentIntentId ? 'border-purple-400 ring-2 ring-purple-200' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-bold text-slate-800">
                      {formatCurrency(p.amountCents / 100)} · {p.kind === 'donation' ? 'Donation' : 'Entry'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(p.createdAt).toLocaleString()} · <span className="font-mono">{p.id}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => act(p.id, 'recover', p.kind === 'registration' ? d : undefined)}
                    disabled={busy === p.id || (p.kind === 'registration' && (!d.fullName.trim() || !d.email.trim()))}
                    className="btn-primary px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-60"
                  >
                    {busy === p.id ? 'Adding…' : p.kind === 'donation' ? 'Record donation' : 'Add to tournament'}
                  </button>
                </div>

                {p.kind === 'registration' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      value={d.fullName}
                      onChange={(e) => setEdits((s) => ({ ...s, [p.id]: { ...d, fullName: e.target.value } }))}
                      placeholder="Full name"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                    />
                    <input
                      value={d.email}
                      onChange={(e) => setEdits((s) => ({ ...s, [p.id]: { ...d, email: e.target.value } }))}
                      placeholder="Email"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                    />
                  </div>
                )}
                {p.kind === 'registration' && !p.registrantName && (
                  <p className="text-xs text-slate-400">
                    This payment carries no name — check the charge in Stripe for the cardholder,
                    then fill it in.
                  </p>
                )}
              </div>
            );
          })}

          {report.staleStatus.map((r) => (
            <div
              key={r.paymentIntentId}
              ref={(el) => { if (r.paymentIntentId === focusPaymentIntentId) focusRef.current = el; }}
              className={`rounded-2xl border p-5 flex items-center justify-between gap-4 flex-wrap ${r.paymentIntentId === focusPaymentIntentId ? 'border-purple-400 ring-2 ring-purple-200' : 'border-slate-200 bg-white'}`}
            >
              <div>
                <p className="font-bold text-slate-800">{r.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Stripe shows this paid, but the roster still says &ldquo;{r.storedStatus}&rdquo;.{' '}
                  <span className="font-mono">{r.paymentIntentId}</span>
                </p>
              </div>
              <button
                onClick={() => act(r.paymentIntentId, 'sync')}
                disabled={busy === r.paymentIntentId}
                className="btn-primary px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-60"
              >
                {busy === r.paymentIntentId ? 'Syncing…' : 'Mark as paid'}
              </button>
            </div>
          ))}

          {report.unbackedRecords.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold text-slate-800 text-sm">Recorded without a live payment</h3>
              <p className="text-xs text-slate-400 mt-0.5 mb-3">
                These have a payment reference that Stripe no longer reports as succeeded — usually
                a refund. Nothing to fix automatically; check them against Stripe.
              </p>
              <ul className="text-sm text-slate-600 space-y-1">
                {report.unbackedRecords.map((r) => (
                  <li key={r.paymentIntentId} className="flex justify-between gap-4">
                    <span>{r.label}</span>
                    <span className="font-mono text-xs text-slate-400">{r.paymentIntentId}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm">Every payment taken</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left">When</th>
                    <th className="px-4 py-2.5 text-left">Who</th>
                    <th className="px-4 py-2.5 text-left">Amount</th>
                    <th className="px-4 py-2.5 text-left">Status</th>
                    <th className="px-4 py-2.5 text-left">Payment reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.payments.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No payments yet</td></tr>
                  )}
                  {report.payments.map((p) => (
                    <tr
                      key={p.id}
                      ref={(el) => { if (p.id === focusPaymentIntentId) focusRef.current = el; }}
                      className={p.id === focusPaymentIntentId ? 'bg-purple-50' : 'hover:bg-slate-50'}
                    >
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{new Date(p.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-slate-700">{p.record?.label ?? p.registrantName ?? '—'}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{formatCurrency(p.amountCents / 100)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${MATCH_STATE_STYLE[p.matchState]}`}>
                          {MATCH_STATE_LABEL[p.matchState]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{p.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button onClick={recheck} className="text-sm text-slate-500 hover:text-slate-700 underline underline-offset-2">
            Re-check Stripe
          </button>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone = 'plain' }: { label: string; value: string; tone?: 'plain' | 'ok' | 'alert' }) {
  const toneClass = tone === 'alert' ? 'text-amber-700' : tone === 'ok' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-black mt-0.5 ${toneClass}`}>{value}</p>
    </div>
  );
}
