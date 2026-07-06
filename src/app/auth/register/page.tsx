'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import OnePointBowlLogo from '@/components/OnePointBowlLogo';

const INVITE_CODE = 'onepoint';
const TITLE_OPTIONS = ['Head Coach', 'Assistant Coach', 'Sports Administrator', 'Director of Operations', 'Other'];
const SPORT_OPTIONS = ['Tennis', 'Basketball', 'Soccer', 'Other'];
const PROGRAM_OPTIONS = ["Men's", "Women's", 'Both'];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<'code' | 'details' | 'confirm'>('code');
  const [confirmedEmail, setConfirmedEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [title, setTitle] = useState('');
  const [titleOther, setTitleOther] = useState('');
  const [sport, setSport] = useState('');
  const [sportOther, setSportOther] = useState('');
  const [program, setProgram] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().toLowerCase() !== INVITE_CODE) {
      setCodeError('Invalid invite code. Contact us to get early access.');
      return;
    }
    setStep('details');
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const emailLower = email.toLowerCase();
    if (!emailLower.endsWith('.edu') && !emailLower.endsWith('@onepointbowl.com')) {
      setError('A .edu email address is required to confirm your school affiliation. Please use your university email.');
      return;
    }
    setLoading(true);
    setError('');

    const supabase = createClient();

    // Sign up the user
    const resolvedTitle = title === 'Other' ? titleOther.trim() : title;
    const resolvedSport = sport === 'Other' ? sportOther.trim() : sport;
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, school, title: resolvedTitle, sport: resolvedSport, program },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    if (signUpErr) {
      setError(signUpErr.message);
      setLoading(false);
      return;
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      setError('Signup failed — no user returned.');
      setLoading(false);
      return;
    }

    // Assign tenant_admin role via server-side API (bypasses RLS for new users with no session yet)
    const roleRes = await fetch('/api/auth/set-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: 'tenant_admin' }),
    });

    if (!roleRes.ok) {
      setError('Account created but role assignment failed — contact support.');
      setLoading(false);
      return;
    }

    // Create a tenant for this tournament director (school + sport + program)
    const tenantRes = await fetch('/api/auth/provision-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, school, sport: resolvedSport, program }),
    });

    if (!tenantRes.ok) {
      setError('Account created but tenant setup failed — contact support.');
      setLoading(false);
      return;
    }

    // If email confirmation is required, show the confirm step with resend option
    if (signUpData.session) {
      router.push('/dashboard');
    } else {
      setConfirmedEmail(email);
      setStep('confirm');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <OnePointBowlLogo size={48} color="var(--tenant-primary)" className="mx-auto mb-2" />
          <span className="font-black text-3xl" style={{ color: 'var(--tenant-primary)' }}>
            One Point Bowl
          </span>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mt-1">
            Early Access Registration
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          {step === 'confirm' ? (
            <ConfirmPending email={confirmedEmail} />
          ) : step === 'code' ? (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-1">Enter your invite code</p>
                <p className="text-xs text-slate-400 mb-4">
                  One Point Bowl is currently invite-only for D1 tennis programs.
                </p>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setCodeError(''); }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 tracking-widest uppercase font-mono"
                  placeholder="XXXXXXXX"
                  autoFocus
                />
                {codeError && (
                  <p className="text-xs text-red-500 mt-1.5">{codeError}</p>
                )}
              </div>
              <button
                type="submit"
                className="btn-primary w-full py-3 rounded-xl font-semibold text-sm"
              >
                Continue →
              </button>
              <p className="text-center text-xs text-slate-400">
                Don&apos;t have a code?{' '}
                <Link href="/#waitlist" className="underline hover:text-slate-600">Join the waitlist</Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setStep('code')}
                  className="text-slate-400 hover:text-slate-600 text-sm"
                >
                  ←
                </button>
                <p className="text-sm font-semibold text-slate-700">Create your account</p>
              </div>
              {[
                { label: 'Full Name', value: name, set: setName, type: 'text', placeholder: 'Coach Jane Smith', hint: '' },
                { label: 'School / Program', value: school, set: setSchool, type: 'text', placeholder: 'Stanford University', hint: '' },
                { label: 'Email', value: email, set: setEmail, type: 'email', placeholder: 'coach@university.edu', hint: 'Must be a .edu address to verify school affiliation.' },
                { label: 'Password', value: password, set: setPassword, type: 'password', placeholder: '••••••••', hint: '' },
              ].map(({ label, value, set, type, placeholder, hint }) => (
                <div key={label}>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    {label}
                  </label>
                  <input
                    type={type}
                    required
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    placeholder={placeholder}
                  />
                  {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Title
                </label>
                <select
                  required
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setTitleOther(''); }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                >
                  <option value="">Select your title…</option>
                  {TITLE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {title === 'Other' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Please specify
                  </label>
                  <input
                    type="text"
                    required
                    value={titleOther}
                    onChange={(e) => setTitleOther(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    placeholder="Your title"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Sport *
                </label>
                <select
                  required
                  value={sport}
                  onChange={(e) => { setSport(e.target.value); setSportOther(''); }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                >
                  <option value="">Select your sport…</option>
                  {SPORT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {sport === 'Other' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Please specify sport
                  </label>
                  <input
                    type="text"
                    required
                    value={sportOther}
                    onChange={(e) => setSportOther(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    placeholder="Your sport"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Program *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PROGRAM_OPTIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProgram(p)}
                      className={`py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                        program === p ? 'text-white border-transparent' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
                      }`}
                      style={program === p ? { backgroundColor: '#3b82f6', borderColor: '#3b82f6' } : {}}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-60"
              >
                {loading ? 'Creating account…' : 'Create Account'}
              </button>
              <p className="text-center text-xs text-slate-400">
                Already have an account?{' '}
                <Link href="/auth/login" className="underline hover:text-slate-600">Sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmPending({ email }: { email: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function resend() {
    setStatus('sending');
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setStatus(error ? 'error' : 'sent');
    if (status === 'sent') setTimeout(() => setStatus('idle'), 5000);
  }

  return (
    <div className="text-center space-y-4 py-2">
      <div className="text-5xl">📧</div>
      <div>
        <p className="font-black text-lg text-slate-900">Check your email</p>
        <p className="text-sm text-slate-500 mt-1">
          We sent a confirmation link to <strong className="text-slate-700">{email}</strong>. Click it to activate your account.
        </p>
      </div>
      <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-400 text-left space-y-1">
        <p>• Check your spam / junk folder</p>
        <p>• The link expires after 24 hours</p>
        <p>• Make sure to click it from the same device</p>
      </div>
      {status === 'sent' ? (
        <p className="text-sm text-emerald-600 font-semibold">✓ Confirmation email resent!</p>
      ) : status === 'error' ? (
        <p className="text-sm text-red-500">Failed to resend — try again in a moment.</p>
      ) : null}
      <button
        onClick={resend}
        disabled={status === 'sending' || status === 'sent'}
        className="w-full py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
      >
        {status === 'sending' ? 'Sending…' : 'Resend confirmation email'}
      </button>
      <p className="text-xs text-slate-400">
        Wrong email?{' '}
        <Link href="/auth/register" className="underline hover:text-slate-600">Start over</Link>
      </p>
    </div>
  );
}
