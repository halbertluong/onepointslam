'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/browser';
import { updatePlayerTier } from '@/lib/tournamentWrites';
import { SKILL_TIERS } from '@/components/PlayerRegistrationForm';
import type { Player } from '@/types';

const GENDER_LABEL: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  non_binary: 'Non-binary',
  prefer_not_to_say: 'Prefer not to say',
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

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5">{value}</p>
    </div>
  );
}

export default function PlayerDetailModal({
  player,
  showPayments,
  onClose,
  onViewPayment,
  onSaved,
}: {
  player: Player;
  showPayments: boolean;
  onClose: () => void;
  onViewPayment?: (paymentIntentId: string) => void;
  onSaved: () => void;
}) {
  const [tier, setTier] = useState(player.skillTier ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const dirty = tier !== (player.skillTier ?? '');

  async function handleSaveTier() {
    setSaving(true);
    const { error } = await updatePlayerTier(createClient(), player.id, tier || null);
    setSaving(false);
    if (error) { setErr(`Could not save tier: ${error}`); return; }
    setErr('');
    onSaved();
  }

  const registeredOn = player.createdAt
    ? new Date(player.createdAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-lg text-slate-800">{player.fullName}</h2>
              <a href={`mailto:${player.email}`} className="text-sm text-blue-600 hover:underline">
                {player.email}
              </a>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-slate-400 hover:text-slate-600 text-xl leading-none px-1"
            >
              ×
            </button>
          </div>

          <div className="p-6 space-y-5">
            {err && <p className="text-sm bg-red-50 text-red-700 rounded-xl p-3">{err}</p>}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Status" value={player.status.replace(/_/g, ' ')} />
              <Field
                label="Registered"
                value={registeredOn ?? '—'}
              />
              <Field label="Gender" value={player.gender ? (GENDER_LABEL[player.gender] ?? player.gender) : '—'} />
              <Field label="Age" value={player.age ?? '—'} />
              <Field label="NTRP Rating" value={player.ntrpRating ?? '—'} />
              <Field label="UTR Rating" value={player.utrRating ?? '—'} />
              <Field label="Seed" value={player.seedRating ?? '—'} />
              {showPayments && (
                <Field
                  label="Payment"
                  value={
                    <span className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${PAYMENT_STATUS_STYLE[player.paymentStatus ?? 'pending']}`}>
                        {PAYMENT_STATUS_LABEL[player.paymentStatus ?? 'pending']}
                      </span>
                      {player.stripePaymentIntentId && onViewPayment && (
                        <button
                          onClick={() => onViewPayment(player.stripePaymentIntentId!)}
                          className="text-xs font-semibold text-slate-400 hover:text-slate-600 underline underline-offset-2"
                        >
                          View →
                        </button>
                      )}
                    </span>
                  }
                />
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Skill Tier</p>
              <div className="flex items-center gap-2">
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-400"
                >
                  <option value="">— None —</option>
                  {SKILL_TIERS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  onClick={handleSaveTier}
                  disabled={saving || !dirty}
                  className="btn-primary px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40 whitespace-nowrap"
                >
                  {saving ? 'Saving…' : 'Save Tier'}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
