'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/browser';
import { updatePlayerInfo } from '@/lib/tournamentWrites';
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
  const [fullName, setFullName] = useState(player.fullName);
  const [gender, setGender] = useState(player.gender ?? '');
  const [age, setAge] = useState(player.age != null ? String(player.age) : '');
  const [ntrp, setNtrp] = useState(player.ntrpRating != null ? String(player.ntrpRating) : '');
  const [utr, setUtr] = useState(player.utrRating != null ? String(player.utrRating) : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const dirty =
    fullName !== player.fullName ||
    gender !== (player.gender ?? '') ||
    age !== (player.age != null ? String(player.age) : '') ||
    ntrp !== (player.ntrpRating != null ? String(player.ntrpRating) : '') ||
    utr !== (player.utrRating != null ? String(player.utrRating) : '');

  async function handleSave() {
    if (!fullName.trim()) { setErr('Name cannot be blank.'); return; }
    setSaving(true);
    const { error } = await updatePlayerInfo(createClient(), player.id, {
      fullName: fullName.trim(),
      gender: gender || null,
      age: age.trim() ? parseInt(age) : null,
      ntrpRating: ntrp.trim() ? parseFloat(ntrp) : null,
      utrRating: utr.trim() ? parseFloat(utr) : null,
    });
    setSaving(false);
    if (error) { setErr(`Could not save changes: ${error}`); return; }
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
            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                aria-label="Full name"
                className="font-bold text-lg text-slate-800 w-full border border-transparent hover:border-slate-200 focus:border-slate-400 rounded-lg px-1.5 -mx-1.5 py-0.5 focus:outline-none"
              />
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
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Gender</p>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  aria-label="Gender"
                  className="mt-0.5 w-full border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-slate-400"
                >
                  <option value="">—</option>
                  {Object.entries(GENDER_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Age</p>
                <input
                  type="number"
                  min="5"
                  max="99"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="—"
                  aria-label="Age"
                  className="mt-0.5 w-full border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-slate-400"
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">NTRP Rating</p>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="7"
                  value={ntrp}
                  onChange={(e) => setNtrp(e.target.value)}
                  placeholder="—"
                  aria-label="NTRP rating"
                  className="mt-0.5 w-full border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-slate-400"
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">UTR Rating</p>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="16"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value)}
                  placeholder="—"
                  aria-label="UTR rating"
                  className="mt-0.5 w-full border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-slate-400"
                />
              </div>
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

            <div className="border-t border-slate-100 pt-4 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="btn-primary px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-40 whitespace-nowrap"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
