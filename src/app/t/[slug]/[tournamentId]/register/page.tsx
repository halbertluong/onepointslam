'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useParams, useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/pricing';
import type { Tournament } from '@/types';

const CLOSE_REASON_TEXT: Record<string, string> = {
  manual_override: 'Registration has been manually closed by the organizer.',
  deadline_passed: 'The registration deadline has passed.',
  cap_reached: 'The player cap has been reached.',
};

const SKILL_TIERS = ['Beginner', 'Intermediate', 'Advanced', 'Elite'];

export default function RegisterPage() {
  const { slug, tournamentId } = useParams<{ slug: string; tournamentId: string }>();
  const router = useRouter();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [skillTier, setSkillTier] = useState('Intermediate');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [{ data: t }, { count }] = await Promise.all([
        supabase.from('tournaments').select('*').eq('id', tournamentId).single(),
        supabase.from('players').select('id', { count: 'exact', head: true }).eq('tournament_id', tournamentId),
      ]);
      setTournament(t);
      setPlayerCount(count ?? 0);
      setLoading(false);
    }
    load();
  }, [tournamentId]);

  const isOpen = tournament?.status === 'registration_open';
  const closeReason = tournament?.registrationCloseReason;

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!tournament || !isOpen) return;
    setSubmitting(true);
    setError('');

    // Check cap before submitting
    const supabase = createClient();
    const { count: currentCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);

    if (
      tournament.settings?.playerRegistrationCap &&
      (currentCount ?? 0) >= tournament.settings.playerRegistrationCap
    ) {
      setError('Sorry, the player cap has been reached.');
      setSubmitting(false);
      return;
    }

    const { error: err } = await supabase.from('players').insert({
      tournament_id: tournamentId,
      full_name: fullName,
      email,
      skill_tier: skillTier,
      status: 'registered',
      created_at: new Date().toISOString(),
    });

    if (err) {
      setError(err.message);
    } else {
      // If cap now reached, auto-close registration
      if (
        tournament.settings?.playerRegistrationCap &&
        (currentCount ?? 0) + 1 >= tournament.settings.playerRegistrationCap
      ) {
        await supabase
          .from('tournaments')
          .update({ status: 'registration_closed', registration_close_reason: 'cap_reached' })
          .eq('id', tournamentId);
      }
      setSuccess(true);
    }
    setSubmitting(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-6xl">🎾</div>
          <h1 className="text-2xl font-black text-slate-900">You&apos;re registered!</h1>
          <p className="text-slate-600">
            Welcome to <strong>{tournament?.name}</strong>, {fullName}!
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

  const totalPrice =
    (tournament?.settings?.ticketPriceForFundraiser ?? 0) +
    (tournament?.settings?.systemTechFee ?? 5);

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-md mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{tournament?.name}</h1>
          <p className="text-slate-500 mt-1 text-sm">Player Registration</p>
        </div>

        {!isOpen && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 text-center">
            <div className="text-2xl mb-2">🔒</div>
            <p className="font-bold text-amber-800">Registration Closed</p>
            <p className="text-amber-700 text-sm mt-1">
              {closeReason ? CLOSE_REASON_TEXT[closeReason] : 'Registration is not currently open.'}
            </p>
          </div>
        )}

        {isOpen && (
          <form onSubmit={handleRegister} className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
              <h2 className="font-bold text-slate-800">Your Details</h2>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Full Name
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
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  placeholder="jane@school.edu"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Skill Level
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
                      style={skillTier === tier ? { backgroundColor: 'var(--tenant-primary)', borderColor: 'var(--tenant-primary)' } : {}}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Price breakdown */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-800">Payment Breakdown</h3>
              </div>
              <div className="divide-y divide-slate-100">
                <div className="flex justify-between px-5 py-3 text-sm">
                  <span className="text-slate-600">Tournament entry</span>
                  <span className="font-semibold text-emerald-600">
                    {formatCurrency(tournament?.settings?.ticketPriceForFundraiser ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between px-5 py-3 text-sm">
                  <span className="text-slate-600">Platform fee</span>
                  <span className="font-semibold text-slate-500">
                    {formatCurrency(tournament?.settings?.systemTechFee ?? 5)}
                  </span>
                </div>
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

            <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-500 leading-relaxed">
              <strong>Mock Checkout:</strong> In production this would redirect to Stripe. Your registration will be confirmed immediately for demo purposes.
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full py-4 rounded-2xl font-black text-base disabled:opacity-60"
            >
              {submitting ? 'Registering…' : `Pay ${formatCurrency(totalPrice)} & Register`}
            </button>

            <p className="text-xs text-center text-slate-400">
              {playerCount} / {tournament?.settings?.maxPlayers ?? '?'} spots filled
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
