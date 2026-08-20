'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useRouter } from 'next/navigation';
import FundraisingCalculator from '@/components/FundraisingCalculator';
import PrizePlacesEditor from '@/components/PrizePlacesEditor';
import MatchRulesEditor from '@/components/MatchRulesEditor';
import type { TournamentSettings, MaxPlayers, Sport } from '@/types';
import { DEFAULT_PLATFORM_FEE } from '@/lib/pricing';

const DEFAULT_SETTINGS: TournamentSettings = {
  sport: 'tennis',
  maxPlayers: 32,
  bracketFormat: 'single_elimination',
  ticketPriceForFundraiser: 20,
  systemTechFee: DEFAULT_PLATFORM_FEE,
  serveRuleProfile: 'one_serve_sudden_death',
  serverDetermination: 'random_coin_toss',
  receivingSideSelection: 'server_choice',
};

const SPORT_OPTIONS: { value: Sport; label: string }[] = [
  { value: 'tennis', label: '🎾 Tennis — One Point Bowl' },
  { value: 'basketball', label: '🏀 Basketball — One Point Bowl' },
  { value: 'soccer', label: '⚽ Soccer — One Goal Bowl' },
];

export default function NewTournamentPage() {
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<TournamentSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  function updateSettings<K extends keyof TournamentSettings>(key: K, value: TournamentSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  /**
   * Enter in a text field submits the form it belongs to. That is fine for a
   * login box, but this form is six sections of tournament configuration and
   * submitting creates the tournament and leaves the page — so a director part
   * way through filling it in lost the rest of their settings. Only the Create
   * button submits now; Enter elsewhere does nothing.
   */
  function keepEnterFromSubmitting(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter') return;
    const el = e.target as HTMLElement | null;
    // A focused button or link still activates on Enter, as it should.
    if (!el || el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'TEXTAREA') return;
    e.preventDefault();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || loading) return;
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not signed in'); setLoading(false); return; }

    const { data: appUser } = await supabase
      .from('users')
      .select('assigned_tenant_ids')
      .eq('id', user.id)
      .single();

    const tenantId = appUser?.assigned_tenant_ids?.[0];
    if (!tenantId) { setError('No tenant assigned to your account'); setLoading(false); return; }

    const { data: tournament, error: err } = await supabase
      .from('tournaments')
      .insert({
        tenant_id: tenantId,
        name,
        status: 'registration_open',
        settings,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (err) { setError(err.message); setLoading(false); return; }
    router.push(`/dashboard/tournaments/${tournament.id}`);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900">New Tournament Draw</h1>
        <p className="text-slate-500 mt-1 text-sm">Configure your tournament details and pricing</p>
      </div>

      <form onSubmit={handleCreate} onKeyDown={keepEnterFromSubmitting} className="space-y-6">
        {/* Basic info */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-bold text-slate-800">Tournament Details</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Tournament Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              placeholder="Spring 2026 Charity Cup"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Sport
            </label>
            <select
              value={settings.sport ?? 'tennis'}
              onChange={(e) => updateSettings('sport', e.target.value as Sport)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
            >
              {SPORT_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Draw Size
            </label>
            <select
              value={settings.maxPlayers}
              onChange={(e) => updateSettings('maxPlayers', parseInt(e.target.value) as MaxPlayers)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
            >
              {[8, 16, 32, 48, 64, 96, 128, 192, 256].map((n) => (
                <option key={n} value={n}>{n} players</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Bracket Format
            </label>
            <select
              value={settings.bracketFormat ?? 'single_elimination'}
              onChange={(e) => updateSettings('bracketFormat', e.target.value as TournamentSettings['bracketFormat'])}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
            >
              <option value="single_elimination">Single Elimination</option>
              <option value="consolation">Consolation Bracket</option>
              <option value="double_elimination">Double Elimination</option>
            </select>
            {settings.bracketFormat && settings.bracketFormat !== 'single_elimination' && (
              <p className="text-xs text-amber-700 mt-1">
                Needs a full draw — one entrant per slot. A bye leaves no loser to send onward, so
                a player can land in the second bracket with nobody to play.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Tournament Date (optional)
              </label>
              <input
                type="datetime-local"
                value={settings.tournamentDate ?? ''}
                onChange={(e) => updateSettings('tournamentDate', e.target.value || undefined)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Registration Deadline (optional)
              </label>
              <input
                type="datetime-local"
                value={settings.registrationDeadline ?? ''}
                onChange={(e) => updateSettings('registrationDeadline', e.target.value || undefined)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Number of Courts
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={settings.numberOfCourts ?? ''}
              onChange={(e) => updateSettings('numberOfCourts', e.target.value ? parseInt(e.target.value) : undefined)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              placeholder="e.g. 4"
            />
            <p className="text-xs text-slate-400 mt-1">Courts are auto-assigned to matches when you start live play.</p>
          </div>
        </div>

        {/* Rules */}
        {settings.sport === 'soccer' ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-2">
            <h2 className="font-bold text-slate-800">Match Rules — One Goal Bowl</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Each match is a single penalty kick. Before the kick, one player chooses to be kicker or keeper and the other is auto-assigned the remaining role. Score the kick and the kicker advances; miss it or the keeper saves it and the keeper advances. No tiebreaker needed — the referee console will prompt for role selection, then the kick outcome.
            </p>
          </div>
        ) : settings.sport === 'basketball' ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-2">
            <h2 className="font-bold text-slate-800">Match Rules — One Point Bowl</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Each match is a single defended possession. A coin flip decides who chooses offense or defense — the other player is auto-assigned the remaining role. Make the shot and the offensive player advances; miss it, get stripped, or get blocked and the defensive player advances. No tiebreaker needed — the referee console will prompt for the coin flip, then role selection, then the possession outcome.
            </p>
          </div>
        ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-bold text-slate-800">Match Rules</h2>
          <MatchRulesEditor
            serveRuleProfile={settings.serveRuleProfile}
            onServeRuleProfileChange={(v) => updateSettings('serveRuleProfile', v)}
            serverDetermination={settings.serverDetermination}
            onServerDeterminationChange={(v) => updateSettings('serverDetermination', v)}
            receivingSideSelection={settings.receivingSideSelection}
            onReceivingSideSelectionChange={(v) => updateSettings('receivingSideSelection', v)}
          />
        </div>
        )}

        {/* Minimum registrants */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-bold text-slate-800">Registration Requirements</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Minimum Registrants to Run Tournament
            </label>
            <input
              type="number"
              min="2"
              max={settings.maxPlayers}
              value={settings.minimumRegistrants ?? ''}
              onChange={(e) => updateSettings('minimumRegistrants', e.target.value ? parseInt(e.target.value) : undefined)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              placeholder="No minimum"
            />
            <p className="text-xs text-slate-400 mt-1">Tournament will be flagged if registrations fall below this number.</p>
          </div>
        </div>

        {/* Fundraising Goal */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div>
            <h2 className="font-bold text-slate-800">Fundraising Goal</h2>
            <p className="text-xs text-slate-400 mt-0.5">Optional — shown as a progress bar on the public registration page</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Goal Amount (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="100"
                placeholder="e.g. 5000"
                value={settings.fundraisingGoal ?? ''}
                onChange={(e) => updateSettings('fundraisingGoal', e.target.value ? Number(e.target.value) : undefined)}
                className="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Prize money */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800">Prize Money</h2>
              <p className="text-xs text-slate-400 mt-0.5">Optional — earmark winnings by place</p>
            </div>
          </div>
          <PrizePlacesEditor
            places={settings.prizePlaces ?? []}
            ticketPrice={settings.ticketPriceForFundraiser}
            onChange={(p) => updateSettings('prizePlaces', p)}
          />
          {(settings.prizePlaces?.length ?? 0) > 0 && (
            <p className="text-xs text-slate-400">
              Mixed types allowed — e.g. 1st gets $500 fixed, 2nd gets 15% of the entry pool.
            </p>
          )}
        </div>

        {/* Pricing calculator */}
        <FundraisingCalculator
          onPriceSet={(price) => updateSettings('ticketPriceForFundraiser', price)}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="btn-primary w-full py-3 rounded-xl font-bold text-sm disabled:opacity-60"
        >
          {loading ? 'Creating…' : 'Create Tournament Draw'}
        </button>
      </form>
    </div>
  );
}
