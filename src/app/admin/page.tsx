'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/browser';
import { formatCurrency, DEFAULT_PLATFORM_FEE } from '@/lib/pricing';

interface TenantRow {
  id: string;
  display_name: string;
  slug: string;
  primary_color: string;
  platform_fee: number | null;
  stripe_connect_account_id: string | null;
  created_at: string;
}

interface TournamentRow {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  settings: Record<string, unknown>;
  player_count?: number;
}

const STATUS_STYLES: Record<string, string> = {
  registration_open: 'bg-emerald-100 text-emerald-700',
  registration_closed: 'bg-amber-100 text-amber-700',
  bracket_generated: 'bg-blue-100 text-blue-700',
  live_play: 'bg-red-100 text-red-700 animate-pulse',
  completed: 'bg-slate-100 text-slate-500',
};

const STATUS_LABELS: Record<string, string> = {
  registration_open: 'Open',
  registration_closed: 'Closed',
  bracket_generated: 'Bracket Ready',
  live_play: '● LIVE',
  completed: 'Completed',
};

export default function AdminOverviewPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [tenantFees, setTenantFees] = useState<Record<string, string>>({});
  const [savingTenant, setSavingTenant] = useState<string | null>(null);
  const [savedTenant, setSavedTenant] = useState<string | null>(null);
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: t }, { data: tm }, { count }] = await Promise.all([
      supabase.from('tenants').select('*').order('display_name'),
      supabase.from('tournaments').select('id, tenant_id, name, status, settings').order('created_at', { ascending: false }),
      supabase.from('players').select('id', { count: 'exact', head: true }),
    ]);

    // Fetch player counts per tournament
    const tournamentRows = tm ?? [];
    if (tournamentRows.length > 0) {
      const { data: counts } = await supabase
        .from('players')
        .select('tournament_id')
        .in('tournament_id', tournamentRows.map((r) => r.id));
      const countMap: Record<string, number> = {};
      (counts ?? []).forEach((r: { tournament_id: string }) => {
        countMap[r.tournament_id] = (countMap[r.tournament_id] ?? 0) + 1;
      });
      setTournaments(tournamentRows.map((r) => ({ ...r, player_count: countMap[r.id] ?? 0 })));
    } else {
      setTournaments([]);
    }

    setTenants(t ?? []);
    setTotalPlayers(count ?? 0);

    const tf: Record<string, string> = {};
    (t ?? []).forEach((ten: TenantRow) => {
      tf[ten.id] = String(ten.platform_fee ?? DEFAULT_PLATFORM_FEE);
    });
    setTenantFees(tf);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveTenantFee(tenantId: string) {
    setSavingTenant(tenantId);
    const fee = parseFloat(tenantFees[tenantId]);
    if (!isNaN(fee) && fee >= 0) {
      const supabase = createClient();
      await supabase.from('tenants').update({ platform_fee: fee }).eq('id', tenantId);
    }
    setSavingTenant(null);
    setSavedTenant(tenantId);
    setTimeout(() => setSavedTenant(null), 2000);
    load();
  }

  const live = tournaments.filter((t) => t.status === 'live_play');
  const active = tournaments.filter((t) => t.status !== 'completed');

  // Estimate platform revenue: sum of (platform_fee or default) * player_count per tournament
  const platformRevenue = tournaments.reduce((acc, tm) => {
    const tenant = tenants.find((t) => t.id === tm.tenant_id);
    const fee = tm.settings?.systemTechFee as number | undefined
      ?? tenant?.platform_fee
      ?? DEFAULT_PLATFORM_FEE;
    return acc + fee * (tm.player_count ?? 0);
  }, 0);

  const stats = [
    { label: 'Tenants', value: tenants.length, sub: 'schools on platform' },
    { label: 'Live Now', value: live.length, sub: 'tournaments in play', accent: live.length > 0 },
    { label: 'Active Draws', value: active.length, sub: 'not yet completed' },
    { label: 'Registered Players', value: totalPlayers, sub: 'across all tournaments' },
    { label: 'Platform Revenue', value: formatCurrency(platformRevenue), sub: 'est. from registrations' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Platform Overview</h1>
        <p className="text-slate-500 mt-1 text-sm">All tenants · {tournaments.length} tournaments across {tenants.length} schools</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map((s) => (
          <div key={s.label} className={`bg-white rounded-2xl border p-4 ${s.accent ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className={`text-2xl font-black mt-1 ${s.accent ? 'text-red-600' : 'text-slate-900'}`}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* All Tournaments */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">All Tournaments</h2>
          <span className="text-xs text-slate-400">{tournaments.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-5 py-3 text-left">Tournament</th>
                <th className="px-5 py-3 text-left">School</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Players</th>
                <th className="px-5 py-3 text-left">Platform Fee</th>
                <th className="px-5 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tournaments.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No tournaments yet.</td></tr>
              )}
              {tournaments.map((tm) => {
                const tenant = tenants.find((t) => t.id === tm.tenant_id);
                const feeOverride = tm.settings?.systemTechFee as number | undefined;
                const effectiveFee = feeOverride ?? tenant?.platform_fee ?? DEFAULT_PLATFORM_FEE;
                return (
                  <tr key={tm.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{tm.name}</p>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tenant?.primary_color ?? '#94a3b8' }} />
                        <span className="text-slate-600 text-xs">{tenant?.display_name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_STYLES[tm.status] ?? 'bg-slate-100 text-slate-500'}`}>
                        {STATUS_LABELS[tm.status] ?? tm.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600 text-xs">
                      {tm.player_count} / {(tm.settings?.maxPlayers as number | undefined) ?? '?'}
                    </td>
                    <td className="px-5 py-3 text-xs">
                      <span className={feeOverride != null ? 'text-amber-600 font-semibold' : 'text-slate-400'}>
                        {formatCurrency(effectiveFee)}
                        {feeOverride != null && <span className="ml-1 text-[10px]">override</span>}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/dashboard/tournaments/${tm.id}`}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Manage →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tenants & fees */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Schools & Platform Fees</h2>
          <span className="text-xs text-slate-400">Default: {formatCurrency(DEFAULT_PLATFORM_FEE)}/registrant</span>
        </div>
        <div className="divide-y divide-slate-100">
          {tenants.length === 0 && (
            <p className="px-6 py-8 text-center text-slate-400 text-sm">No tenants yet</p>
          )}
          {tenants.map((t) => {
            const tenantTournaments = tournaments.filter((tm) => tm.tenant_id === t.id);
            const isExpanded = expandedTenant === t.id;

            return (
              <div key={t.id}>
                <div className="px-6 py-4 flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.primary_color }} />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{t.display_name}</p>
                      <p className="text-xs text-slate-400 font-mono">/t/{t.slug}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-slate-500">Fee/player</span>
                    <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
                      <span className="px-2.5 py-2 bg-slate-50 text-slate-400 text-sm border-r border-slate-200">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.50"
                        value={tenantFees[t.id] ?? DEFAULT_PLATFORM_FEE}
                        onChange={(e) => setTenantFees((prev) => ({ ...prev, [t.id]: e.target.value }))}
                        className="w-16 px-2.5 py-2 text-sm focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => saveTenantFee(t.id)}
                      disabled={savingTenant === t.id}
                      className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50 disabled:opacity-60 transition-colors"
                    >
                      {savingTenant === t.id ? 'Saving…' : savedTenant === t.id ? '✓ Saved' : 'Save'}
                    </button>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {t.stripe_connect_account_id ? (
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">Stripe ✓</span>
                    ) : (
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-400 rounded-full text-xs">No Stripe</span>
                    )}
                    {tenantTournaments.length > 0 && (
                      <button
                        onClick={() => setExpandedTenant(isExpanded ? null : t.id)}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                      >
                        {isExpanded ? '▲' : `▼ ${tenantTournaments.length} draw${tenantTournaments.length !== 1 ? 's' : ''}`}
                      </button>
                    )}
                    <Link
                      href={`/t/${t.slug}`}
                      target="_blank"
                      className="text-xs font-semibold text-blue-500 hover:text-blue-700"
                    >
                      View →
                    </Link>
                  </div>
                </div>

                {isExpanded && (
                  <div className="bg-slate-50 border-t border-slate-100">
                    {tenantTournaments.map((tm) => (
                      <div key={tm.id} className="flex items-center gap-4 px-10 py-2.5 border-b border-slate-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-slate-700 font-medium">{tm.name}</span>
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${STATUS_STYLES[tm.status] ?? ''}`}>
                            {STATUS_LABELS[tm.status] ?? tm.status}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">{tm.player_count} players</span>
                        <Link href={`/dashboard/tournaments/${tm.id}`} className="text-xs font-semibold text-blue-500 hover:text-blue-700 shrink-0">
                          Manage →
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
