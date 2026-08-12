'use client';

import { useState } from 'react';
import PlayerRegistrationForm, { type PlayerFormData } from '@/components/PlayerRegistrationForm';
import TournamentInfoCard from '@/components/TournamentInfoCard';
import { DEFAULT_PLATFORM_FEE, formatCurrency } from '@/lib/pricing';
import type { Tournament } from '@/types';

type Mode = 'register' | 'preview';

/**
 * The director's registration desk.
 *
 * "Add a player" registers someone directly — for walk-ups and phone sign-ups
 * where the fee is handled offline. "Preview" shows the public page as
 * registrants see it. Both are built from the same TournamentInfoCard and
 * PlayerRegistrationForm the public page uses, so neither can drift from it.
 */
export default function RegistrationPanel({
  tournament,
  tournamentId,
  tenantSlug,
  playerCount,
  donationTotal,
  onRegistered,
}: {
  tournament: Tournament;
  tournamentId: string;
  tenantSlug: string;
  playerCount: number;
  donationTotal: number;
  onRegistered: () => void;
}) {
  const [mode, setMode] = useState<Mode>('register');
  const [copied, setCopied] = useState(false);
  const [markPaid, setMarkPaid] = useState(true);
  const [added, setAdded] = useState<string[]>([]);
  const [formKey, setFormKey] = useState(0);

  const settings = tournament.settings;
  const entranceFee = settings?.ticketPriceForFundraiser ?? 0;
  const platformFee = settings?.systemTechFee ?? DEFAULT_PLATFORM_FEE;

  const registrationUrl = tenantSlug ? `/t/${tenantSlug}/${tournamentId}/register` : '';

  // Mirrors the gate on the public page: open while registration_open, or
  // whenever late registration has been switched on and play isn't finished.
  const lateAllowed = !!settings?.allowLateRegistration && tournament.status !== 'completed';
  const isOpen = tournament.status === 'registration_open' || lateAllowed;
  // A director can add players regardless, right up until the event is done.
  const canAddPlayer = tournament.status !== 'completed';

  function copyLink() {
    if (!registrationUrl) return;
    navigator.clipboard.writeText(`${window.location.origin}${registrationUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDirectorRegister(data: PlayerFormData): Promise<{ error?: string } | void> {
    const res = await fetch('/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tournamentId,
        fullName: data.fullName,
        email: data.email,
        gender: data.gender || null,
        ntrp: data.ntrp || null,
        utr: data.utr || null,
        age: data.age || null,
        skillTier: data.skillTier || null,
        directorEntry: true,
        markPaid,
      }),
    });
    const json = (await res.json()) as { playerId?: string; error?: string };
    if (!res.ok) {
      return { error: json.error ?? 'Could not register this player. Please try again.' };
    }
    setAdded((prev) => [data.fullName, ...prev]);
    setFormKey((k) => k + 1); // remount to clear the form for the next walk-up
    onRegistered();
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
                ? 'The public registration link is accepting new players.'
                : 'The public link is closed — visitors see a “Registration Closed” notice.'}
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

        {!isOpen && canAddPlayer && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            The public link is closed, but you can still add players here. To reopen it for everyone,
            turn on <strong>Allow Late Registration</strong> in the Settings tab.
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

      {/* Mode switch */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          ['register', '➕ Add a Player'],
          ['preview', '👁 Preview Public Page'],
        ] as const).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {added.length > 0 && (
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4">
          <p className="font-bold text-emerald-900">
            ✓ Registered {added.length} player{added.length === 1 ? '' : 's'}
          </p>
          <p className="text-sm text-emerald-800 mt-0.5">
            {added.join(', ')} — now in the Players tab.
            {tournament.status !== 'registration_open' && ' Add them to the draw from the Draw Editor tab.'}
          </p>
        </div>
      )}

      {mode === 'register' ? (
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 bg-slate-800 text-white">
            <p className="text-xs font-bold uppercase tracking-widest text-white/70">
              ➕ Add a player directly
            </p>
            <p className="text-xs text-white/50 mt-1">
              For walk-ups and phone sign-ups. No payment is taken here — collect the entry fee
              however you like and record it below.
            </p>
          </div>

          {!canAddPlayer ? (
            <p className="bg-slate-50 px-5 py-8 text-center text-sm text-slate-400">
              This tournament is completed — no further registrations can be added.
            </p>
          ) : (
            <div className="bg-slate-50 p-4 sm:p-6">
              <div className="max-w-2xl mx-auto space-y-4">
                {/* Fee handling */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                  <h3 className="font-bold text-slate-800 text-sm">Entry fee</h3>
                  {entranceFee > 0 ? (
                    <>
                      <p className="text-sm text-slate-500">
                        This tournament charges{' '}
                        <strong className="text-slate-700">{formatCurrency(entranceFee)}</strong>{' '}
                        per player. Since no card is charged here, tell us whether you&apos;ve
                        collected it.
                      </p>
                      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-slate-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={markPaid}
                          onChange={(e) => setMarkPaid(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-slate-700">
                            Fee collected — mark as paid
                          </span>
                          <span className="block text-xs text-slate-400 mt-0.5">
                            Leave unchecked to record the player as unpaid so you can chase it later.
                          </span>
                        </span>
                      </label>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">
                      This tournament is free to enter — nothing to collect.
                    </p>
                  )}
                </div>

                <PlayerRegistrationForm
                  key={formKey}
                  tournamentName={tournament.name}
                  hideHeader
                  entranceFee={entranceFee}
                  platformFee={platformFee}
                  playerCount={playerCount}
                  maxPlayers={settings?.maxPlayers}
                  hidePaymentBreakdown
                  submitLabel={
                    entranceFee > 0 && !markPaid ? 'Register Player (unpaid)' : 'Register Player'
                  }
                  footnote="Added by you as tournament director. The player receives a confirmation email."
                  detailsTitle="Player Details"
                  onSubmit={handleDirectorRegister}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 bg-slate-800 text-white flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-widest text-white/70">
              👁 Preview — what registrants see
            </span>
            <span className="text-xs text-white/40">
              Submitting is disabled here. Use “Add a Player” to register someone.
            </span>
          </div>

          <div className="bg-slate-50 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto space-y-5">
              <h1 className="text-2xl font-black text-slate-900">{tournament.name}</h1>

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
      )}
    </div>
  );
}
