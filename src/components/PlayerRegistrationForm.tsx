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

export interface WelcomeBackProps {
  loading: boolean;
  error: string;
  onSignIn: (password: string) => Promise<void>;
  onDismiss: () => void;
}

interface Props {
  tournamentName: string;
  tenantName?: string;
  entranceFee: number;
  platformFee: number;
  playerCount?: number;
  maxPlayers?: number;
  /** Pre-filled, read-only email from a signed-in user */
  lockedEmail?: string;
  /** Called when the email field loses focus (for account-exists check) */
  onEmailBlur?: (email: string) => void;
  /** When set, renders the inline "Welcome back" sign-in prompt below the email field */
  welcomeBack?: WelcomeBackProps;
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
  onEmailBlur,
  welcomeBack,
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

  // Welcome-back inline sign-in state (local password field)
  const [wbPassword, setWbPassword] = useState('');

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
              onBlur={(e) => {
                if (!lockedEmail && e.target.value) onEmailBlur?.(e.target.value);
              }}
              readOnly={!!lockedEmail}
              className={`w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${lockedEmail ? 'bg-slate-50 text-slate-500' : ''}`}
              placeholder="jane@school.edu"
            />
          </div>

          {/* Inline "Welcome back" prompt — shown when email belongs to an existing account */}
          {welcomeBack && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-blue-900">Welcome back!</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Enter your password to sign in and speed through the form.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={welcomeBack.onDismiss}
                  className="text-blue-400 hover:text-blue-600 text-lg leading-none shrink-0 mt-0.5"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Your password"
                  value={wbPassword}
                  onChange={(e) => setWbPassword(e.target.value)}
                  className="flex-1 border border-blue-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  disabled={welcomeBack.loading || !wbPassword}
                  onClick={async () => {
                    await welcomeBack.onSignIn(wbPassword);
                    setWbPassword('');
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {welcomeBack.loading ? '…' : 'Sign in'}
                </button>
              </div>
              {welcomeBack.error && (
                <p className="text-xs text-red-600">{welcomeBack.error}</p>
              )}
            </div>
          )}

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

        <p className="text-center text-xs text-slate-400">
          No account required. You&apos;ll receive confirmation by email.
        </p>
      </form>
    </div>
  );
}
