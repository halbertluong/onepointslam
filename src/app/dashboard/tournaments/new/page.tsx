'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useRouter } from 'next/navigation';
import FundraisingCalculator from '@/components/FundraisingCalculator';
import type { TournamentSettings, MaxPlayers } from '@/types';
import { DEFAULT_PLATFORM_FEE } from '@/lib/pricing';

const DEFAULT_SETTINGS: TournamentSettings = {
  maxPlayers: 32,
  ticketPriceForFundraiser: 20,
  systemTechFee: DEFAULT_PLATFORM_FEE,
  serveRuleProfile: 'one_serve_sudden_death',
  serverDetermination: 'random_coin_toss',
  receivingSideSelection: 'server_choice',
};

export default function NewTournamentPage() {
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<TournamentSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  function updateSettings<K extends keyof TournamentSettings>(key: K, value: TournamentSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
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

      <form onSubmit={handleCreate} className="space-y-6">
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

          <div className="grid grid-cols-2 gap-4">
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
                Player Cap (optional)
              </label>
              <input
                type="number"
                min="2"
                max={settings.maxPlayers}
                value={settings.playerRegistrationCap ?? ''}
                onChange={(e) => updateSettings('playerRegistrationCap', e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                placeholder="No cap"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Tournament Date (optional)
            </label>
            <input
              type="date"
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

        {/* Rules */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-bold text-slate-800">Match Rules</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Serve Rule
              </label>
              <select
                value={settings.serveRuleProfile}
                onChange={(e) => updateSettings('serveRuleProfile', e.target.value as TournamentSettings['serveRuleProfile'])}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              >
                <option value="one_serve_sudden_death">1 Serve — Sudden Death (all players)</option>
                <option value="two_serves_traditional">2 Serves — Traditional (all players)</option>
                <option value="skill_based">Skill-Based — Pros 1 serve, Amateurs 2 serves</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Server Selection
              </label>
              <select
                value={settings.serverDetermination}
                onChange={(e) => updateSettings('serverDetermination', e.target.value as TournamentSettings['serverDetermination'])}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              >
                <option value="random_coin_toss">Random Coin Toss</option>
                <option value="referee_manual_override">Referee Manual</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Receiving Side
              </label>
              <select
                value={settings.receivingSideSelection}
                onChange={(e) => updateSettings('receivingSideSelection', e.target.value as TournamentSettings['receivingSideSelection'])}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              >
                <option value="server_choice">Server&apos;s Choice</option>
                <option value="ad_court_fixed">Ad Court Fixed</option>
                <option value="deuce_court_fixed">Deuce Court Fixed</option>
              </select>
            </div>
          </div>
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
