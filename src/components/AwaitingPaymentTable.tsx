'use client';

import { useState } from 'react';
import type { PendingRegistration } from '@/types';

const STATUS_LABEL: Record<string, string> = {
  payment_failed: 'Card declined',
  canceled: 'Canceled',
};

/**
 * People who started registering and haven't finished — the entry was
 * reserved the moment they submitted the form, before any card was charged.
 * A row here either turns into a paid entry in the roster below (the moment
 * Stripe confirms their card) or just sits here as a named record of someone
 * who didn't complete their registration, instead of vanishing the way it
 * used to when nothing was written until after payment succeeded.
 *
 * This doubles as an abandoned-cart list: whoever is here right now started
 * and stalled, which is exactly who a director might want to follow up with.
 */
export default function AwaitingPaymentTable({
  pendingRegistrations,
  onViewPayment,
  onDismiss,
}: {
  pendingRegistrations: PendingRegistration[];
  onViewPayment: (paymentIntentId: string) => void;
  onDismiss: (id: string) => Promise<{ error?: string }>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (pendingRegistrations.length === 0) return null;

  async function handleDismiss(p: PendingRegistration) {
    if (!window.confirm(
      `Remove ${p.fullName}'s reservation? If their payment is still open, it will be canceled so they ` +
      "can't be charged after being removed.",
    )) return;
    setBusyId(p.id);
    setError('');
    const result = await onDismiss(p.id);
    setBusyId(null);
    if (result.error) setError(result.error);
  }

  return (
    <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-amber-100 bg-amber-50">
        <h2 className="font-bold text-amber-900">Awaiting Payment ({pendingRegistrations.length})</h2>
        <p className="text-xs text-amber-700 mt-0.5">
          Started registering but haven&apos;t finished paying. A row here moves into the roster below
          the moment Stripe confirms the card — nothing to do unless one has clearly been abandoned.
        </p>
      </div>
      {error && (
        <p className="px-6 py-3 text-sm text-red-700 bg-red-50 border-b border-red-100">{error}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Started</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pendingRegistrations.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{p.fullName}</td>
                <td className="px-4 py-3 text-slate-500">{p.email}</td>
                <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(p.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${
                    p.lastStripeStatus ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {p.lastStripeStatus ? (STATUS_LABEL[p.lastStripeStatus] ?? p.lastStripeStatus) : 'Still trying'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    onClick={() => onViewPayment(p.stripePaymentIntentId)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline underline-offset-2 mr-4"
                  >
                    View payment →
                  </button>
                  <button
                    onClick={() => handleDismiss(p)}
                    disabled={busyId === p.id}
                    className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    {busyId === p.id ? 'Removing…' : 'Remove'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
