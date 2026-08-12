'use client';

import { useState } from 'react';
import PlayerRegistrationForm from '@/components/PlayerRegistrationForm';
import TournamentInfoCard from '@/components/TournamentInfoCard';
import { DEFAULT_PLATFORM_FEE } from '@/lib/pricing';
import type { Tournament } from '@/types';

/**
 * The director's view of the public registration page.
 *
 * Built from the same TournamentInfoCard and PlayerRegistrationForm that
 * registrants actually see, so this preview can't drift away from the real
 * page. Submitting is deliberately inert here — a director opening this tab is
 * checking how the page reads, not signing someone up, and letting the form
 * post would create a real player row (and a real charge) by accident.
 */
export default function RegistrationPanel({
  tournament,
  tournamentId,
  tenantSlug,
  playerCount,
  donationTotal,
}: {
  tournament: Tournament;
  tournamentId: string;
  tenantSlug: string;
  playerCount: number;
  donationTotal: number;
}) {
  const [copied, setCopied] = useState(false);

  const settings = tournament.settings;
  const entranceFee = settings?.ticketPriceForFundraiser ?? 0;
  const platformFee = settings?.systemTechFee ?? DEFAULT_PLATFORM_FEE;

  const registrationUrl = tenantSlug
    ? `/t/${tenantSlug}/${tournamentId}/register`
    : '';

  // Mirrors the gate on the public page: open while registration_open, or
  // whenever late registration has been switched on and play isn't finished.
  const lateAllowed = !!settings?.allowLateRegistration && tournament.status !== 'completed';
  const isOpen = tournament.status === 'registration_open' || lateAllowed;

  function copyLink() {
    if (!registrationUrl) return;
    navigator.clipboard.writeText(`${window.location.origin}${registrationUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Status + link toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-slate-800">Registration</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {isOpen
                ? 'The registration link is accepting new players.'
                : 'The registration link is closed — visitors see a “Registration Closed” notice.'}
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
              isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {isOpen ? '● Open' : 'Closed'}
          </span>
        </div>

        {!isOpen && tournament.status !== 'completed' && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            To keep taking sign-ups after the bracket exists, turn on{' '}
            <strong>Allow Late Registration</strong> in the Settings tab.
          </p>
        )}

        {registrationUrl ? (
          <div className="flex items-center gap-2 flex-wrap">
            <code className="flex-1 min-w-0 truncate text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-600">
              {registrationUrl}
            </code>
            <button
              onClick={copyLink}
              className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors shrink-0"
            >
              {copied ? '✓ Copied!' : '🔗 Copy Link'}
            </button>
            <a
              href={registrationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2.5 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors shrink-0"
            >
              Open ↗
            </a>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            Registration link unavailable — this tournament has no tenant slug.
          </p>
        )}
      </div>

      {/* Preview of the public page */}
      <div className="rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 bg-slate-800 text-white flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-widest text-white/70">
            👁 Preview — what registrants see
          </span>
          <span className="text-xs text-white/40">
            Submitting is disabled here. Use the link above to register for real.
          </span>
        </div>

        <div className="bg-slate-50 p-4 sm:p-6">
          <div className="max-w-4xl mx-auto space-y-5">
            <div>
              <h1 className="text-2xl font-black text-slate-900">{tournament.name}</h1>
            </div>

            <TournamentInfoCard
              tournamentDate={settings?.tournamentDate}
              registrationDeadline={settings?.registrationDeadline}
              fundraisingGoal={settings?.fundraisingGoal}
              ticketPrice={entranceFee}
              playerCount={playerCount}
              donationTotal={donationTotal}
              maxPlayers={settings?.maxPlayers}
              prizePlaces={settings?.prizePlaces}
              matchRules={{
                serveRuleProfile: settings?.serveRuleProfile,
                serverDetermination: settings?.serverDetermination,
                receivingSideSelection: settings?.receivingSideSelection,
              }}
            />

            {/* inert takes the preview out of pointer, keyboard and a11y reach,
                so a director can't tab into it and submit a phantom signup */}
            <div inert className="pointer-events-none select-none opacity-95">
              <PlayerRegistrationForm
                tournamentName={tournament.name}
                hideHeader
                entranceFee={entranceFee}
                platformFee={platformFee}
                playerCount={playerCount}
                maxPlayers={settings?.maxPlayers}
                onSubmit={async () => ({})}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
