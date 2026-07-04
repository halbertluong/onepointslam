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
  const [step, setStep] = useState<'code' | 'details'>('code');
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
    if (!email.toLowerCase().endsWith('.edu')) {
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
        emailRedirectTo: `${window.location.origin}/auth/callback`,
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

    // Upsert the user row with tenant_admin role
    const { error: upsertErr } = await supabase.from('users').upsert({
      id: userId,
      role: 'tenant_admin',
    });

    if (upsertErr) {
      setError('Account created but role assignment failed — contact support.');
      setLoading(false);
      return;
    }

    // If email confirmation is required, send them to login; otherwise redirect
    if (signUpData.session) {
      router.push('/dashboard');
    } else {
      router.push('/auth/login?message=Check+your+email+to+confirm+your+account');
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
          {step === 'code' ? (
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
