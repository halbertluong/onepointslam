'use client';

import { useState } from 'react';
import PlayerRegistrationForm, { type PlayerFormData } from '@/components/PlayerRegistrationForm';
import RegistrationFlow from '@/components/RegistrationFlow';
import { DEFAULT_PLATFORM_FEE, formatCurrency } from '@/lib/pricing';
import { donationsAllowed } from '@/lib/donations';
import { tournamentPath } from '@/lib/slugs';
import type { Tournament } from '@/types';

type Mode = 'flow' | 'offline';

/**
 * The director's registration desk.
 *
 * "Take Registration" runs the real public registration flow — the same form,
 * the same Stripe card payment, the same donation path — so a director working
 * the desk can take a card there and then, and nothing about it can drift from
 * what registrants get. "Record Offline Entry" is the shortcut for cash or comped
 * players, which skips payment and just notes whether the fee was collected.
 */
export default function RegistrationPanel({
  tournament,
  tournamentId,
  tenantSlug,
  playerCount,
  onRegistered,
  onSaveSettings,
}: {
  tournament: Tournament;
  tournamentId: string;
  tenantSlug: string;
  playerCount: number;
  onRegistered: () => void;
  /** Persists a settings patch — used by the donate-link switch below, so a
   *  director can turn the donate ask off from the page it appears on rather
   *  than hunting for it in the Settings tab. */
  onSaveSettings: (patch: Partial<Tournament['settings']>) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>('flow');
  const [copied, setCopied] = useState(false);
  const [markPaid, setMarkPaid] = useState(true);
  const [added, setAdded] = useState<string[]>([]);
  const [formKey, setFormKey] = useState(0);
  // Held locally so the switch flips immediately; the saved tournament arrives
  // back a moment later and agrees.
  const [donateOn, setDonateOn] = useState(donationsAllowed(tournament.settings));
  const [donateSaving, setDonateSaving] = useState(false);

  const settings = tournament.settings;
  const entranceFee = settings?.ticketPriceForFundraiser ?? 0;
  const platformFee = settings?.systemTechFee ?? DEFAULT_PLATFORM_FEE;

  const registrationUrl = tenantSlug ? tournamentPath(tenantSlug, tournament.slug, 'register') : '';

  // Mirrors the gate on the public page: open while registration_open, or
  // whenever late registration has been switched on and play isn't finished.
  const lateAllowed = !!settings?.allowLateRegistration && tournament.status !== 'completed';
  const isOpen = tournament.status === 'registration_open' || lateAllowed;
  // A director can register right up until the event is done.
  const canRegister = tournament.status !== 'completed';

  async function toggleDonateLink(next: boolean) {
    setDonateOn(next);
    setDonateSaving(true);
    try {
      await onSaveSettings({ allowDonations: next });
    } catch {
      setDonateOn(!next); // save failed — don't leave the switch claiming otherwise
    }
    setDonateSaving(false);
  }

  function copyLink() {
    if (!registrationUrl) return;
    navigator.clipboard.writeText(`${window.location.origin}${registrationUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleOfflineRegister(data: PlayerFormData): Promise<{ error?: string } | void> {
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
      {/* Public link status */}
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

        {!isOpen && canRegister && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            The public link is closed, but you can still register players here. To reopen it for
            everyone, turn on <strong>Allow Late Registration</strong> in the Settings tab.
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

        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3.5 cursor-pointer hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            checked={donateOn}
            disabled={donateSaving}
            onChange={(e) => toggleDonateLink(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-700">
              Show the donate link on this page
              {donateSaving && <span className="text-xs font-normal text-slate-400 ml-2">Saving…</span>}
            </span>
            <span className="block text-xs text-slate-400 mt-0.5">
              {donateOn
                ? 'Visitors who don’t want to play can donate instead. Turn this off to ask for sign-ups only.'
                : 'The registration page asks for sign-ups only — no donation option is offered. Donations already received still count toward the fundraising total.'}
            </span>
          </span>
        </label>
      </div>

      {/* Mode switch */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          ['flow', '💳 Take Registration'],
          ['offline', '💵 Record Offline Entry'],
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

      {!canRegister ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
          <p className="text-sm text-slate-400">
            This tournament is completed — no further registrations can be taken.
          </p>
        </div>
      ) : mode === 'flow' ? (
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 bg-slate-800 text-white">
            <p className="text-xs font-bold uppercase tracking-widest text-white/70">
              💳 Take a registration
            </p>
            <p className="text-xs text-white/50 mt-1">
              The real registration page, running here. Card payments
              {entranceFee > 0 ? ` (${formatCurrency(entranceFee + platformFee)} total)` : ''} and
              donations are charged through Stripe exactly as they are for players signing up
              themselves.
            </p>
          </div>
          <div className="bg-slate-50">
            <RegistrationFlow
              // Remount when the donate link is switched, so this preview shows
              // what a registrant now sees rather than its first-load copy.
              key={`donate-${donateOn}`}
              slug={tenantSlug}
              tournamentId={tournamentId}
              tournamentSlug={tournament.slug}
              embedded
              directorEntry
              onRegistered={onRegistered}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 bg-slate-800 text-white">
            <p className="text-xs font-bold uppercase tracking-widest text-white/70">
              💵 Record an offline entry
            </p>
            <p className="text-xs text-white/50 mt-1">
              For cash, cheque or comped players. No card is charged here — note below whether you
              collected the fee.
            </p>
          </div>

          <div className="bg-slate-50 p-4 sm:p-6">
            <div className="max-w-2xl mx-auto space-y-4">
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
                tournamentId={tournamentId}
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
                onSubmit={handleOfflineRegister}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
