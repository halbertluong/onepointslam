'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/browser';

interface TournamentRow {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  settings: Record<string, unknown>;
  created_at: string;
  player_count?: number;
}

interface TenantRow {
  id: string;
  display_name: string;
  slug: string;
  primary_color: string;
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

const ALL_STATUSES = ['registration_open', 'registration_closed', 'bracket_generated', 'live_play', 'completed'];

export default function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [tenantFilter, setTenantFilter] = useState<string>('');

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: t }, { data: tm }] = await Promise.all([
      supabase.from('tenants').select('id, display_name, slug, primary_color').order('display_name'),
      supabase.from('tournaments').select('id, tenant_id, name, status, settings, created_at').order('created_at', { ascending: false }),
    ]);

    const rows = tm ?? [];
    if (rows.length > 0) {
      const { data: counts } = await supabase
        .from('players')
        .select('tournament_id')
        .in('tournament_id', rows.map((r) => r.id));
      const countMap: Record<string, number> = {};
      (counts ?? []).forEach((r: { tournament_id: string }) => {
        countMap[r.tournament_id] = (countMap[r.tournament_id] ?? 0) + 1;
      });
      setTournaments(rows.map((r) => ({ ...r, player_count: countMap[r.id] ?? 0 })));
    } else {
      setTournaments([]);
    }
    setTenants(t ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t]));

  const filtered = tournaments.filter((tm) => {
    if (statusFilter && tm.status !== statusFilter) return false;
    if (tenantFilter && tm.tenant_id !== tenantFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const tenant = tenantMap[tm.tenant_id];
      return tm.name.toLowerCase().includes(q) || (tenant?.display_name ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">All Tournaments</h1>
        <p className="text-slate-500 mt-1 text-sm">{tournaments.length} total across {tenants.length} schools</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by name or school…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-400 flex-1 min-w-48"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-400 bg-white"
        >
          <option value="">All Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
        <select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-slate-400 bg-white"
        >
          <option value="">All Schools</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.display_name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                <th className="px-5 py-3 text-left">Tournament</th>
                <th className="px-5 py-3 text-left">School</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Players</th>
                <th className="px-5 py-3 text-left">Created</th>
                <th className="px-5 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    {search || statusFilter || tenantFilter ? 'No tournaments match your filters.' : 'No tournaments yet.'}
                  </td>
                </tr>
              )}
              {filtered.map((tm) => {
                const tenant = tenantMap[tm.tenant_id];
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
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {new Date(tm.created_at).toLocaleDateString()}
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
    </div>
  );
}
