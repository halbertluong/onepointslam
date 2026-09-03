'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/pricing';
import type { ReconciliationReport, StripePayment } from '@/lib/reconciliation';

type Report = ReconciliationReport & { tournamentName?: string };

/**
 * The money check: what Stripe took for this tournament, against what the app
 * recorded. Its job is to surface the case nobody notices otherwise — a card
 * charged with no registration behind it — and to let a director fix it on the
 * spot rather than reading a Stripe export by hand.
 */
export default function PaymentsPanel({ tournamentId, onRecovered }: {
  tournamentId: string;
  onRecovered?: () => void;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [edits, setEdits] = useState<Record<string, { fullName: string; email: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  // No state is set before the first await, so this is safe to call straight
  // from an effect: the spinner starts from `loading`'s initial value, and
  // callers that re-check (the buttons below) raise it themselves first.
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

  function recheck() {
    setLoading(true);
    setError('');
    load();
  }

  function detailsFor(p: StripePayment) {
    return edits[p.id] ?? { fullName: p.registrantName ?? '', email: p.registrantEmail ?? '' };
  }

  async function recover(p: StripePayment) {
    const { fullName, email } = detailsFor(p);
    setBusy(p.id);
    setNotice('');
    const res = await fetch('/api/payments/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId, paymentIntentId: p.id, fullName, email }),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) { setError(json.error ?? 'Could not add this payment.'); return; }
    setNotice(
      json.linkedExisting
        ? 'Payment linked to the registration that already existed.'
        : json.alreadyRecorded
          ? 'That payment was already recorded.'
          : p.kind === 'donation' ? 'Donation recorded.' : `${fullName} added to the tournament.`,
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
            <Stat label="Recorded here" value={formatCurrency(report.recordedTotalCents / 100)} />
            <Stat
              label="Unaccounted for"
              value={formatCurrency((report.stripeTotalCents - report.recordedTotalCents) / 100)}
              tone={report.orphans.length > 0 ? 'alert' : 'ok'}
            />
          </div>

          {report.balanced ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
              ✓ Every payment Stripe has taken for this tournament has a registration or donation
              behind it{report.matchedCount > 0 ? ` — ${report.matchedCount} in total` : ''}.
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              <strong>{report.orphans.length} payment{report.orphans.length === 1 ? '' : 's'} with nothing behind {report.orphans.length === 1 ? 'it' : 'them'}.</strong>{' '}
              These cards were charged but the sign-up never landed — most likely the tournament
              filled up, or the browser closed, between paying and being added. Add them below and
              they keep the entry they paid for.
            </div>
          )}

          {report.orphans.map((p) => {
            const d = detailsFor(p);
            return (
              <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
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
                    onClick={() => recover(p)}
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
