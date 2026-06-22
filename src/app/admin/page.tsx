'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { formatCurrency, DEFAULT_PLATFORM_FEE } from '@/lib/pricing';

interface TenantRow {
  id: string;
  display_name: string;
  slug: string;
  platform_fee: number;
  stripe_connect_account_id: string | null;
  created_at: string;
}

interface TournamentRow {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  settings: Record<string, unknown>;
}

export default function AdminPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);
  const [savingTenant, setSavingTenant] = useState<string | null>(null);
  const [savingTournament, setSavingTournament] = useState<string | null>(null);
  const [tenantFees, setTenantFees] = useState<Record<string, string>>({});
  const [tournamentFees, setTournamentFees] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: t }, { data: tm }] = await Promise.all([
      supabase.from('tenants').select('*').order('created_at', { ascending: false }),
      supabase.from('tournaments').select('id, tenant_id, name, status, settings').order('created_at', { ascending: false }),
    ]);
    setTenants(t ?? []);
    setTournaments(tm ?? []);
    // Init fee state
    const tf: Record<string, string> = {};
    (t ?? []).forEach((ten: TenantRow) => { tf[ten.id] = String(ten.platform_fee ?? DEFAULT_PLATFORM_FEE); });
    setTenantFees(tf);
    const tmf: Record<string, string> = {};
    (tm ?? []).forEach((tour: TournamentRow) => {
      tmf[tour.id] = String(tour.settings?.systemTechFee ?? '');
    });
    setTournamentFees(tmf);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveTenantFee(tenantId: string) {
    setSavingTenant(tenantId);
    const fee = parseFloat(tenantFees[tenantId]);
    if (isNaN(fee) || fee < 0) { setSavingTenant(null); return; }
    const supabase = createClient();
    await supabase.from('tenants').update({ platform_fee: fee }).eq('id', tenantId);
    setSavingTenant(null);
    load();
  }

  async function saveTournamentFee(tournamentId: string, currentSettings: Record<string, unknown>) {
    setSavingTournament(tournamentId);
    const val = tournamentFees[tournamentId];
    const supabase = createClient();
    if (val === '' || val === undefined) {
      // Remove override — fall back to tenant fee
      const { [tournamentId]: _, ...rest } = { ...currentSettings };
      void rest;
      await supabase.from('tournaments').update({
        settings: { ...currentSettings, systemTechFee: null },
      }).eq('id', tournamentId);
    } else {
      const fee = parseFloat(val);
      if (!isNaN(fee)) {
        await supabase.from('tournaments').update({
          settings: { ...currentSettings, systemTechFee: fee },
        }).eq('id', tournamentId);
      }
    }
    setSavingTournament(null);
    load();
  }

  const activeTournaments = tournaments.filter(
    (t) => t.status === 'live_play' || t.status === 'bracket_generated',
  ).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Platform Overview</h1>
        <p className="text-slate-500 mt-1 text-sm">All tenants, fees, and system health</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Tenants', value: tenants.length },
          { label: 'Active Tournaments', value: activeTournaments },
          { label: 'Total Tournaments', value: tournaments.length },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className="text-3xl font-black text-slate-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tenants with fee controls */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Tenants & Platform Fees</h2>
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
                {/* Tenant row */}
                <div className="px-6 py-4 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{t.display_name}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">/t/{t.slug}</p>
                  </div>

                  {/* Tenant-level fee control */}
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                      Tenant fee/registrant
                    </label>
                    <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
                      <span className="px-2.5 py-2 bg-slate-50 text-slate-400 text-sm border-r border-slate-200">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.50"
                        value={tenantFees[t.id] ?? DEFAULT_PLATFORM_FEE}
                        onChange={(e) => setTenantFees((prev) => ({ ...prev, [t.id]: e.target.value }))}
                        className="w-20 px-2.5 py-2 text-sm focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => saveTenantFee(t.id)}
                      disabled={savingTenant === t.id}
                      className="btn-primary px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-60 whitespace-nowrap"
                    >
                      {savingTenant === t.id ? 'Saving…' : 'Save'}
                    </button>
                  </div>

                  {/* Stripe status */}
                  <div className="shrink-0">
                    {t.stripe_connect_account_id ? (
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                        Stripe ✓
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-400 rounded-full text-xs">
                        No Stripe
                      </span>
                    )}
                  </div>

                  {/* Expand toggle for per-tournament fees */}
                  {tenantTournaments.length > 0 && (
                    <button
                      onClick={() => setExpandedTenant(isExpanded ? null : t.id)}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700 whitespace-nowrap shrink-0"
                    >
                      {isExpanded ? '▲ Hide' : `▼ ${tenantTournaments.length} tournament${tenantTournaments.length !== 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>

                {/* Per-tournament fee overrides */}
                {isExpanded && (
                  <div className="bg-slate-50 border-t border-slate-100 divide-y divide-slate-100">
                    <div className="px-8 py-2">
                      <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">
                        Per-tournament fee overrides (blank = use tenant default)
                      </p>
                    </div>
                    {tenantTournaments.map((tm) => {
                      const override = tm.settings?.systemTechFee;
                      const hasOverride = override !== null && override !== undefined;
                      return (
                        <div key={tm.id} className="px-8 py-3 flex flex-wrap items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">{tm.name}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {hasOverride
                                ? `Override: ${formatCurrency(override as number)}/registrant`
                                : `Using tenant default: ${formatCurrency(parseFloat(tenantFees[t.id]) || DEFAULT_PLATFORM_FEE)}/registrant`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white">
                              <span className="px-2.5 py-2 bg-slate-50 text-slate-400 text-sm border-r border-slate-200">$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.50"
                                value={tournamentFees[tm.id] ?? ''}
                                onChange={(e) => setTournamentFees((prev) => ({ ...prev, [tm.id]: e.target.value }))}
                                className="w-20 px-2.5 py-2 text-sm focus:outline-none"
                                placeholder={String(parseFloat(tenantFees[t.id]) || DEFAULT_PLATFORM_FEE)}
                              />
                            </div>
                            <button
                              onClick={() => saveTournamentFee(tm.id, tm.settings)}
                              disabled={savingTournament === tm.id}
                              className="btn-primary px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-60 whitespace-nowrap"
                            >
                              {savingTournament === tm.id ? 'Saving…' : 'Save'}
                            </button>
                            {hasOverride && (
                              <button
                                onClick={() => {
                                  setTournamentFees((prev) => ({ ...prev, [tm.id]: '' }));
                                  saveTournamentFee(tm.id, tm.settings);
                                }}
                                className="text-xs text-red-400 hover:text-red-600 font-semibold whitespace-nowrap"
                              >
                                Clear override
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
