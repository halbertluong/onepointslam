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

type Step = 'loading' | 'form' | 'success' | 'closed' | 'already_registered';

export default function RegisterPage() {
  const { slug, tournamentId } = useParams<{ slug: string; tournamentId: string }>();
  const router = useRouter();

  const [step, setStep] = useState<Step>('loading');
  const [tournament, setTournament] = useState<Record<string, unknown> | null>(null);
  const [platformFee, setPlatformFee] = useState(DEFAULT_PLATFORM_FEE);
  const [playerCount, setPlayerCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);
  const [registeredName, setRegisteredName] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [wasGuest, setWasGuest] = useState(false);

  // Inline "Welcome back" prompt state
  const [welcomeBackEmail, setWelcomeBackEmail] = useState('');
  const [welcomeBackVisible, setWelcomeBackVisible] = useState(false);
  const [welcomeBackLoading, setWelcomeBackLoading] = useState(false);
  const [welcomeBackError, setWelcomeBackError] = useState('');

  // Post-success account creation state (guests only)
  const [savePassword, setSavePassword] = useState('');
  const [savePasswordLoading, setSavePasswordLoading] = useState(false);
  const [savePasswordDone, setSavePasswordDone] = useState(false);
  const [savePasswordError, setSavePasswordError] = useState('');
  const [savePasswordSkipped, setSavePasswordSkipped] = useState(false);

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
      }

      setStep('form');
    }
    init();
  }, [tournamentId, slug]);

  async function handleEmailBlur(email: string) {
    if (!email || currentUser) return;
    const supabase = createClient();
    // Check if this email belongs to an existing account in our users table
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (data) {
      setWelcomeBackEmail(email);
      setWelcomeBackVisible(true);
      setWelcomeBackError('');
    }
  }

  async function handleWelcomeBackSignIn(password: string) {
    setWelcomeBackLoading(true);
    setWelcomeBackError('');
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: welcomeBackEmail,
      password,
    });
    setWelcomeBackLoading(false);
    if (error) {
      setWelcomeBackError('Incorrect password. Continue filling out the form or use another email.');
      return;
    }
    if (data.user) {
      // Check if already registered for this tournament
      const { data: existing } = await supabase
        .from('players')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('user_id', data.user.id)
        .maybeSingle();
      if (existing) {
        setStep('already_registered');
        return;
      }
      setCurrentUser({ id: data.user.id, email: data.user.email ?? '' });
      setWelcomeBackVisible(false);
    }
  }

  async function handleRegister(data: PlayerFormData): Promise<{ error?: string }> {
    const supabase = createClient();

    const { count: currentCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);
    const settings = tournament?.settings as Record<string, unknown> | null;
    const cap = settings?.playerRegistrationCap as number | undefined;
    if (cap && (currentCount ?? 0) >= cap) {
      return { error: 'Sorry, the player cap has been reached.' };
    }

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
    setRegisteredEmail(data.email);
    setWasGuest(!currentUser);
    setStep('success');
    return {};
  }

  async function handleSavePassword() {
    if (!savePassword || savePassword.length < 6) {
      setSavePasswordError('Password must be at least 6 characters.');
      return;
    }
    setSavePasswordLoading(true);
    setSavePasswordError('');
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email: registeredEmail, password: savePassword });
    if (error) {
      setSavePasswordError(error.message);
      setSavePasswordLoading(false);
      return;
    }
    if (data.user) {
      await supabase.from('users').upsert(
        { id: data.user.id, email: registeredEmail, role: 'player', assigned_tenant_ids: [] },
        { onConflict: 'id' },
      );
    }
    setSavePasswordLoading(false);
    setSavePasswordDone(true);
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
        <div className="max-w-sm w-full space-y-5">
          <div className="text-center space-y-3">
            <div className="text-6xl">🎾</div>
            <h1 className="text-2xl font-black text-slate-900">You&apos;re In!</h1>
            <p className="text-slate-600">
              Welcome to <strong>{tournament?.name as string}</strong>, {registeredName}!
              We&apos;ll be in touch with match details.
            </p>
          </div>

          {/* Optional account creation — guests only, one-click skippable */}
          {wasGuest && !savePasswordSkipped && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              {savePasswordDone ? (
                <div className="text-center space-y-1">
                  <p className="text-2xl">🔐</p>
                  <p className="font-semibold text-slate-800 text-sm">Account created!</p>
                  <p className="text-xs text-slate-500">
                    Next time you register, signing in will autofill your details.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">Save your info for next time?</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Add a password to <span className="font-medium">{registeredEmail}</span> and skip this form at future tournaments.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="Choose a password (min 6 chars)"
                      value={savePassword}
                      onChange={(e) => { setSavePassword(e.target.value); setSavePasswordError(''); }}
                      minLength={6}
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 min-w-0"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      disabled={savePasswordLoading || !savePassword}
                      onClick={handleSavePassword}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors shrink-0"
                    >
                      {savePasswordLoading ? '…' : 'Save'}
                    </button>
                  </div>
                  {savePasswordError && (
                    <p className="text-xs text-red-600">{savePasswordError}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setSavePasswordSkipped(true)}
                    className="text-xs text-slate-400 hover:text-slate-600 w-full text-center"
                  >
                    No thanks, skip
                  </button>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => router.push(`/t/${slug}/${tournamentId}`)}
            className="btn-primary w-full py-3 rounded-xl font-bold text-sm"
          >
            View Bracket
          </button>
        </div>
      </div>
    );
  }

  // step === 'form' — always shown directly, no auth gate
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-md mx-auto space-y-6">
        {currentUser && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800 flex items-center justify-between">
            <span>Signed in as <strong>{currentUser.email}</strong></span>
            <button
              type="button"
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                setCurrentUser(null);
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
          onEmailBlur={handleEmailBlur}
          welcomeBack={welcomeBackVisible ? {
            loading: welcomeBackLoading,
            error: welcomeBackError,
            onSignIn: handleWelcomeBackSignIn,
            onDismiss: () => { setWelcomeBackVisible(false); setWelcomeBackError(''); },
          } : undefined}
          onSubmit={handleRegister}
        />
      </div>
    </div>
  );
}
