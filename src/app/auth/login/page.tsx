'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useRouter } from 'next/navigation';
import OnePointBowlLogo from '@/components/OnePointBowlLogo';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'magic'>('signin');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const supabase = createClient();

    if (mode === 'magic') {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      });
      if (error) setMessage(error.message || 'Something went wrong — please try again.');
      else setMessage('Check your email for a login link.');
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
      } else {
        const userId = data.user?.id;
        let dest = '/dashboard';
        if (userId) {
          const { data: appUser } = await supabase.from('users').select('role').eq('id', userId).single();
          const role = appUser?.role;
          if (role === 'super_admin') dest = '/admin';
          else if (role === 'referee') dest = '/referee';
          else if (role !== 'tenant_admin') dest = '/';
        }
        router.push(dest);
        router.refresh();
      }
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
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mt-1">Tennis Tournament Platform</p>
          <p className="text-slate-500 mt-2 text-sm">Sign in to your account</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          {/* Toggle */}
          <div className="flex rounded-xl border border-slate-200 overflow-hidden mb-5">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                mode === 'signin' ? 'text-white' : 'text-slate-600 bg-white'
              }`}
              style={mode === 'signin' ? { backgroundColor: 'var(--tenant-primary)' } : {}}
            >
              Password
            </button>
            <button
              onClick={() => setMode('magic')}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                mode === 'magic' ? 'text-white' : 'text-slate-600 bg-white'
              }`}
              style={mode === 'magic' ? { backgroundColor: 'var(--tenant-primary)' } : {}}
            >
              Magic Link
            </button>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1"
                placeholder="you@school.edu"
              />
            </div>

            {mode === 'signin' && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1"
                />
              </div>
            )}

            {message && (
              <p className="text-sm text-center text-slate-600 bg-slate-50 rounded-xl p-3">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-60"
            >
              {loading ? 'Loading…' : mode === 'magic' ? 'Send Magic Link' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
