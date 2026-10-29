'use client';

import { useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { createClient } from '@/lib/supabase/browser';
import { formatCurrency } from '@/lib/pricing';
import { CHARGE_LABEL, SETTLEMENT_LABEL } from '@/lib/addOns';
import type { Player, PlayerCharge, SettlementMethod } from '@/types';

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

const OFFLINE_METHODS: SettlementMethod[] = ['cash', 'check', 'donation'];

function summarize(charges: PlayerCharge[]): string {
  const counts: Record<string, number> = {};
  for (const c of charges) counts[CHARGE_LABEL[c.kind]] = (counts[CHARGE_LABEL[c.kind]] ?? 0) + 1;
  return Object.entries(counts).map(([label, n]) => (n > 1 ? `${label} ×${n}` : label)).join(', ');
}

function StripeBalanceForm({ amountCents, onPaid, onCancel }: {
  amountCents: number;
  onPaid: (paymentIntentId: string) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError('');
    const { error: submitErr } = await elements.submit();
    if (submitErr) { setError(submitErr.message ?? 'Please check the card details.'); setBusy(false); return; }
    const { error: confirmErr, paymentIntent } = await stripe.confirmPayment({ elements, redirect: 'if_required' });
    if (confirmErr) { setError(confirmErr.message ?? 'Payment failed.'); setBusy(false); return; }
    if (paymentIntent?.status === 'succeeded') onPaid(paymentIntent.id);
    else { setError('Payment did not complete.'); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-md">
      <PaymentElement />
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !stripe} className="btn-primary px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">
          {busy ? 'Processing…' : `Charge ${formatCurrency(amountCents / 100)}`}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
      </div>
    </form>
  );
}

/**
 * The running balance of on-site add-ons (bought 2nd serves, buy-backs) each
 * player owes, collected at the end of the event. How it was paid is recorded
 * for documentation; only Stripe actually moves money from here.
 */
export default function BalancesPanel({ tournamentId, players, charges, onSaved }: {
  tournamentId: string;
  players: Player[];
  charges: PlayerCharge[];
  onSaved: () => void;
}) {
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);
  const [stripeSession, setStripeSession] = useState<{ playerId: string; clientSecret: string; amountCents: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const nameOf = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p.fullName])), [players]);
  const open = charges.filter((c) => !c.settledAt);
  const settled = charges.filter((c) => c.settledAt);
  const owing = useMemo(() => {
    const byPlayer = new Map<string, PlayerCharge[]>();
    for (const c of open) byPlayer.set(c.playerId, [...(byPlayer.get(c.playerId) ?? []), c]);
    return [...byPlayer.entries()]
      .map(([playerId, cs]) => ({ playerId, charges: cs, totalCents: cs.reduce((s, c) => s + c.amountCents, 0) }))
      .sort((a, b) => (nameOf[a.playerId] ?? '').localeCompare(nameOf[b.playerId] ?? ''));
  }, [open, nameOf]);

  const outstandingCents = open.reduce((s, c) => s + c.amountCents, 0);
  const collectedCents = settled.reduce((s, c) => s + c.amountCents, 0);

  function flash(text: string) { setMsg(text); setTimeout(() => setMsg(''), 3000); }

  async function settleOffline(playerId: string, method: SettlementMethod) {
    setBusy(true); setErr('');
    const { error } = await createClient()
      .from('player_charges')
      .update({ settled_at: new Date().toISOString(), settlement_method: method })
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId)
      .is('settled_at', null);
    setBusy(false);
    if (error) { setErr(`Could not record payment: ${error.message}`); return; }
    setOpenPlayerId(null);
    flash(`${nameOf[playerId] ?? 'Player'} settled — ${SETTLEMENT_LABEL[method]}.`);
    onSaved();
  }

  async function startStripe(playerId: string) {
    setBusy(true); setErr('');
    const res = await fetch('/api/payments/balance-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId, playerId }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? 'Could not start the payment.'); return; }
    if (data.mock) { setErr('Stripe is not configured in this environment.'); return; }
    setStripeSession({ playerId, clientSecret: data.clientSecret, amountCents: data.amountCents });
  }

  async function stripePaid(paymentIntentId: string) {
    const playerId = stripeSession?.playerId;
    setStripeSession(null);
    setOpenPlayerId(null);
    // The webhook is the source of truth; this just makes the table update now.
    await fetch('/api/payments/settle-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIntentId }),
    }).catch(() => undefined);
    flash(`${playerId ? nameOf[playerId] ?? 'Player' : 'Player'} settled — Stripe.`);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-bold text-slate-800">Add-On Balances</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Bought 2nd serves and buy-backs accrue here. Collect each player&apos;s balance at the end of the
          event and record how they paid.
        </p>
      </div>

      {msg && <p className="text-sm bg-emerald-50 text-emerald-700 rounded-xl p-3">{msg}</p>}
      {err && <p className="text-sm bg-red-50 text-red-700 rounded-xl p-3">{err}</p>}

      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Outstanding</p>
          <p className="text-xl font-black text-amber-900">{formatCurrency(outstandingCents / 100)}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Collected</p>
          <p className="text-xl font-black text-emerald-900">{formatCurrency(collectedCents / 100)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {owing.length === 0 ? (
          <p className="px-6 py-8 text-center text-slate-400 text-sm">No outstanding balances.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {owing.map(({ playerId, charges: cs, totalCents }) => (
              <li key={playerId} className="px-4 py-3 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-slate-800">{nameOf[playerId] ?? 'Removed player'}</p>
                    <p className="text-xs text-slate-400">{summarize(cs)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-slate-900">{formatCurrency(totalCents / 100)}</span>
                    <button
                      onClick={() => { setOpenPlayerId(openPlayerId === playerId ? null : playerId); setStripeSession(null); }}
                      className="btn-primary px-3 py-1.5 rounded-lg text-xs font-bold"
                    >
                      Collect
                    </button>
                  </div>
                </div>
                {openPlayerId === playerId && (
                  <div className="rounded-xl bg-slate-50 p-3 space-y-3">
                    {stripeSession?.playerId === playerId && stripePromise ? (
                      <Elements stripe={stripePromise} options={{ clientSecret: stripeSession.clientSecret, appearance: { theme: 'stripe' } }}>
                        <StripeBalanceForm
                          amountCents={stripeSession.amountCents}
                          onPaid={stripePaid}
                          onCancel={() => setStripeSession(null)}
                        />
                      </Elements>
                    ) : (
                      <>
                        <p className="text-xs font-semibold text-slate-500">How did they pay?</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => startStripe(playerId)}
                            disabled={busy || !stripePromise}
                            title={stripePromise ? undefined : 'Stripe is not configured'}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white disabled:opacity-40"
                          >
                            Charge card (Stripe)
                          </button>
                          {OFFLINE_METHODS.map((m) => (
                            <button
                              key={m}
                              onClick={() => settleOffline(playerId, m)}
                              disabled={busy}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 text-slate-700 hover:bg-white disabled:opacity-40"
                            >
                              Paid by {SETTLEMENT_LABEL[m].toLowerCase()}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-slate-400">
                          Cash, check and donation-page payments are recorded for documentation only —
                          nothing is charged.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {settled.length > 0 && (
        <details className="bg-white rounded-2xl border border-slate-200">
          <summary className="px-4 py-3 text-sm font-semibold text-slate-600 cursor-pointer">
            Collected ({settled.length})
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {[...settled].sort((a, b) => (b.settledAt ?? '').localeCompare(a.settledAt ?? '')).map((c) => (
              <li key={c.id} className="px-4 py-2 text-sm flex justify-between gap-3">
                <span className="text-slate-700">{nameOf[c.playerId] ?? 'Removed player'} · {CHARGE_LABEL[c.kind]}</span>
                <span className="text-slate-500">
                  {formatCurrency(c.amountCents / 100)} · {c.settlementMethod ? SETTLEMENT_LABEL[c.settlementMethod] : '—'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
