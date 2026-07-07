'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/pricing';

const SKILL_TIERS = ['Beginner', 'Intermediate', 'Advanced', 'Elite'];
const GENDERS = [
  { value: 'male', label: '♂ Male' },
  { value: 'female', label: '♀ Female' },
  { value: 'non_binary', label: '⚧ Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export interface PlayerFormData {
  fullName: string;
  email: string;
  gender: string;
  ntrp: string;
  utr: string;
  age: string;
  skillTier: string;
}

interface Props {
  tournamentName: string;
  tenantName?: string;
  /** The school's cut of the entry fee */
  entranceFee: number;
  /** Platform fee added on top */
  platformFee: number;
  playerCount?: number;
  maxPlayers?: number;
  /** Pre-filled, read-only email from a logged-in user */
  lockedEmail?: string;
  /**
   * Called on submit. Return `{ error: string }` to surface a validation error,
   * or nothing / `{}` on success.
   */
  onSubmit: (data: PlayerFormData) => Promise<{ error?: string } | void>;
}

export default function PlayerRegistrationForm({
  tournamentName,
  tenantName,
  entranceFee,
  platformFee,
  playerCount,
  maxPlayers,
  lockedEmail,
  onSubmit,
}: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(lockedEmail ?? '');
  const [gender, setGender] = useState('');
  const [ntrp, setNtrp] = useState('');
  const [utr, setUtr] = useState('');
  const [age, setAge] = useState('');
  const [skillTier, setSkillTier] = useState('Intermediate');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalPrice = entranceFee + platformFee;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    const result = await onSubmit({ fullName, email, gender, ntrp, utr, age, skillTier });
    if (result?.error) {
      setFormError(result.error);
      setSubmitting(false);
    }
    // On success, parent controls the next step
  }

  return (
    <div className="space-y-6">
      <div>
        {tenantName && <p className="text-sm text-slate-400 mb-1">{tenantName}</p>}
        <h1 className="text-2xl font-black text-slate-900">{tournamentName}</h1>
        {playerCount != null && maxPlayers != null && (
          <p className="text-slate-500 mt-1 text-sm">
            Player Registration · {playerCount} / {maxPlayers} spots filled
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-bold text-slate-800">Your Details</h2>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              placeholder="Jane Smith"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Email *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={!!lockedEmail}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 disabled:bg-slate-50"
              placeholder="jane@school.edu"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Age</label>
              <input
                type="number"
                min="5"
                max="99"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                placeholder="—"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">NTRP</label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="7"
                value={ntrp}
                onChange={(e) => setNtrp(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                placeholder="—"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">UTR</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="16"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                placeholder="—"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Gender</label>
            <div className="grid grid-cols-2 gap-2">
              {GENDERS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGender(gender === g.value ? '' : g.value)}
                  className={`py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${
                    gender === g.value
                      ? 'text-white border-transparent'
                      : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
                  }`}
                  style={
                    gender === g.value
                      ? { backgroundColor: 'var(--tenant-primary)', borderColor: 'var(--tenant-primary)' }
                      : {}
                  }
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Skill Level *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SKILL_TIERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setSkillTier(tier)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    skillTier === tier
                      ? 'text-white border-transparent'
                      : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
                  }`}
                  style={
                    skillTier === tier
                      ? { backgroundColor: 'var(--tenant-primary)', borderColor: 'var(--tenant-primary)' }
                      : {}
                  }
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Payment breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-800">Payment Breakdown</h3>
          </div>
          <div className="divide-y divide-slate-100">
            <div className="flex justify-between px-5 py-3 text-sm">
              <span className="text-slate-600">Tournament entry</span>
              <span className="font-semibold text-emerald-600">{formatCurrency(entranceFee)}</span>
            </div>
            {platformFee > 0 && (
              <div className="flex justify-between px-5 py-3 text-sm">
                <span className="text-slate-600">Platform fee</span>
                <span className="font-semibold text-slate-500">{formatCurrency(platformFee)}</span>
              </div>
            )}
            <div
              className="flex justify-between px-5 py-4"
              style={{ backgroundColor: 'color-mix(in srgb, var(--tenant-primary) 8%, white)' }}
            >
              <span className="font-bold text-slate-800">Total</span>
              <span className="text-lg font-black" style={{ color: 'var(--tenant-primary)' }}>
                {formatCurrency(totalPrice)}
              </span>
            </div>
          </div>
        </div>

        {formError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{formError}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full py-4 rounded-2xl font-black text-base disabled:opacity-60"
        >
          {submitting
            ? 'Registering…'
            : totalPrice > 0
            ? `Pay ${formatCurrency(totalPrice)} & Register`
            : 'Register Free'}
        </button>
      </form>
    </div>
  );
}
