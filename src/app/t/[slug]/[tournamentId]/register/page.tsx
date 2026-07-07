'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useParams, useRouter } from 'next/navigation';
import { DEFAULT_PLATFORM_FEE } from '@/lib/pricing';
import PlayerRegistrationForm, { type PlayerFormData } from '@/components/PlayerRegistrationForm';

const CLOSE_REASON_TEXT: Record<string, string> = {
  manual_override: 'Registration has been manually closed by the organizer.',
  deadline_passed: 'The registration deadline has passed.',
  cap_reached: 'The player cap has been reached.',
};

type Step = 'loading' | 'auth' | 'form' | 'success' | 'closed' | 'already_registered';

export default function RegisterPage() {
  const { slug, tournamentId } = useParams<{ slug: string; tournamentId: string }>();
  const router = useRouter();

  const [step, setStep] = useState<Step>('loading');
  const [tournament, setTournament] = useState<Record<string, unknown> | null>(null);
  const [platformFee, setPlatformFee] = useState(DEFAULT_PLATFORM_FEE);
  const [playerCount, setPlayerCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);
  const [registeredName, setRegisteredName] = useState('');

  // Auth form
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const [
        { data: { user } },
        { data: t },
        { count },
        { data: tenant },
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('tournaments').select('*, tenants(display_name, primary_color)').eq('id', tournamentId).single(),
        supabase.from('players').select('id', { count: 'exact', head: true }).eq('tournament_id', tournamentId),
        supabase.from('tenants').select('platform_fee').eq('slug', slug).single(),
      ]);

      setTournament(t);
      setPlayerCount(count ?? 0);
      const settings = t?.settings as Record<string, unknown> | null;
      setPlatformFee((settings?.systemTechFee as number) ?? (tenant?.platform_fee as number) ?? DEFAULT_PLATFORM_FEE);

      if (t?.status !== 'registration_open') {
        setStep('closed');
        return;
      }

      if (user) {
        const { data: existing } = await supabase
          .from('players')
          .select('id')
          .eq('tournament_id', tournamentId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (existing) { setStep('already_registered'); return; }

        setCurrentUser({ id: user.id, email: user.email ?? '' });
        setStep('form');
      } else {
        setStep('auth');
      }
    }
    init();
  }, [tournamentId, slug]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    const supabase = createClient();

    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
      if (error) { setAuthError(error.message); setAuthLoading(false); return; }
      if (data.user) {
        await supabase.from('users').upsert(
          { id: data.user.id, email: authEmail, role: 'player', assigned_tenant_ids: [] },
          { onConflict: 'id' },
        );
        setCurrentUser({ id: data.user.id, email: authEmail });
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (error) { setAuthError(error.message); setAuthLoading(false); return; }
      if (data.user) {
        const { data: existing } = await supabase
          .from('players')
          .select('id')
          .eq('tournament_id', tournamentId)
          .eq('user_id', data.user.id)
          .maybeSingle();
        if (existing) { setStep('already_registered'); return; }
        setCurrentUser({ id: data.user.id, email: data.user.email ?? '' });
      }
    }
    setAuthLoading(false);
    setStep('form');
  }

  async function handleRegister(data: PlayerFormData): Promise<{ error?: string }> {
    const supabase = createClient();

    // Re-check cap
    const { count: currentCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);
    const settings = tournament?.settings as Record<string, unknown> | null;
    const cap = settings?.playerRegistrationCap as number | undefined;
    if (cap && (currentCount ?? 0) >= cap) {
      return { error: 'Sorry, the player cap has been reached.' };
    }

    // Duplicate check for guests
    if (!currentUser) {
      const { data: byEmail } = await supabase
        .from('players')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('email', data.email)
        .maybeSingle();
      if (byEmail) return { error: 'This email is already registered for this tournament.' };
    }

    const { error: err } = await supabase.from('players').insert({
      tournament_id: tournamentId,
      full_name: data.fullName,
      email: data.email,
      skill_tier: data.skillTier,
      gender: data.gender || null,
      ntrp_rating: data.ntrp ? parseFloat(data.ntrp) : null,
      utr_rating: data.utr ? parseFloat(data.utr) : null,
      age: data.age ? parseInt(data.age) : null,
      status: 'registered',
      user_id: currentUser?.id ?? null,
    });

    if (err) return { error: err.message };

    if (cap && (currentCount ?? 0) + 1 >= cap) {
      await supabase
        .from('tournaments')
        .update({ status: 'registration_closed', registration_close_reason: 'cap_reached' })
        .eq('id', tournamentId);
    }

    setRegisteredName(data.fullName);
    setStep('success');
    return {};
  }

  const settings = tournament?.settings as Record<string, unknown> | null;
  const entranceFee = (settings?.ticketPriceForFundraiser as number) ?? 0;
  const tenantName = (tournament?.tenants as Record<string, unknown> | null)?.display_name as string ?? '';

  if (step === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }

  if (step === 'closed') {
    const reason = tournament?.registration_close_reason as string | undefined;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">🔒</div>
          <h1 className="text-2xl font-black text-slate-900">Registration Closed</h1>
          <p className="text-slate-600">
            {reason ? CLOSE_REASON_TEXT[reason] : 'Registration is not currently open for this tournament.'}
          </p>
          <button
            onClick={() => router.push(`/t/${slug}/${tournamentId}`)}
            className="btn-secondary px-6 py-3 rounded-xl font-bold text-sm"
          >
            View Bracket
          </button>
        </div>
      </div>
    );
  }

  if (step === 'already_registered') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h1 className="text-2xl font-black text-slate-900">Already Registered</h1>
          <p className="text-slate-600">
            You&apos;re already signed up for <strong>{tournament?.name as string}</strong>.
          </p>
          <button
            onClick={() => router.push(`/t/${slug}/${tournamentId}`)}
            className="btn-primary px-6 py-3 rounded-xl font-bold text-sm"
          >
            View Bracket
          </button>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-6xl">🎾</div>
          <h1 className="text-2xl font-black text-slate-900">You&apos;re In!</h1>
          <p className="text-slate-600">
            Welcome to <strong>{tournament?.name as string}</strong>, {registeredName}!
            We&apos;ll be in touch with match details.
          </p>
          <button
            onClick={() => router.push(`/t/${slug}/${tournamentId}`)}
            className="btn-primary w-full py-3 rounded-xl font-bold text-sm mt-4"
          >
            View Bracket
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Auth step */}
        {step === 'auth' && (
          <div className="space-y-6">
            <div>
              {tenantName && <p className="text-sm text-slate-400 mb-1">{tenantName}</p>}
              <h1 className="text-2xl font-black text-slate-900">{tournament?.name as string}</h1>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
              <div>
                <h2 className="font-bold text-slate-800">Sign in to register</h2>
                <p className="text-xs text-slate-400 mt-0.5">Create a free account or sign in to secure your spot.</p>
              </div>

              <div className="flex rounded-xl overflow-hidden border border-slate-200">
                {(['signin', 'signup'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => { setAuthMode(mode); setAuthError(''); }}
                    className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                      authMode === mode ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {mode === 'signin' ? 'Sign In' : 'Create Account'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleAuth} className="space-y-3">
                <input
                  type="email"
                  required
                  placeholder="Email address"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                />
                <input
                  type="password"
                  required
                  placeholder={authMode === 'signup' ? 'Create a password (min 6 chars)' : 'Password'}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  minLength={authMode === 'signup' ? 6 : undefined}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                />
                {authError && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{authError}</p>}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="btn-primary w-full py-3 rounded-xl font-bold text-sm disabled:opacity-60"
                >
                  {authLoading
                    ? 'Please wait…'
                    : authMode === 'signin'
                    ? 'Sign In & Continue'
                    : 'Create Account & Continue'}
                </button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative text-center">
                  <span className="bg-white px-3 text-xs text-slate-400">or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep('form')}
                className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-700 font-medium"
              >
                Continue as guest (no account needed)
              </button>
            </div>
          </div>
        )}

        {/* Registration form */}
        {step === 'form' && (
          <>
            {currentUser && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 flex items-center justify-between">
                <span>Signed in as <strong>{currentUser.email}</strong></span>
                <button
                  type="button"
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.auth.signOut();
                    setCurrentUser(null);
                    setStep('auth');
                  }}
                  className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold ml-3"
                >
                  Sign out
                </button>
              </div>
            )}
            <PlayerRegistrationForm
              tournamentName={tournament?.name as string}
              tenantName={tenantName}
              entranceFee={entranceFee}
              platformFee={platformFee}
              playerCount={playerCount}
              maxPlayers={settings?.maxPlayers as number | undefined}
              lockedEmail={currentUser?.email}
              onSubmit={handleRegister}
            />
          </>
        )}
      </div>
    </div>
  );
}
