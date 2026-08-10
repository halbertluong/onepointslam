'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/browser';

interface DeletedTournament {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  settings: Record<string, unknown>;
  created_at: string;
  deleted_at: string;
  player_count?: number;
}

interface TenantRow {
  id: string;
  display_name: string;
  slug: string;
  primary_color: string;
}

const STATUS_LABELS: Record<string, string> = {
  registration_open: 'Open',
  registration_closed: 'Closed',
  bracket_generated: 'Bracket Ready',
  live_play: 'Live',
  completed: 'Completed',
};

export default function RecycleBinPage() {
  const [tournaments, setTournaments] = useState<DeletedTournament[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: t }, { data: tm }] = await Promise.all([
      supabase.from('tenants').select('id, display_name, slug, primary_color').order('display_name'),
      supabase
        .from('tournaments')
        .select('id, tenant_id, name, status, settings, created_at, deleted_at')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
    ]);

    const rows = (tm ?? []) as DeletedTournament[];
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

  async function handleRestore(id: string) {
    setActionId(id);
    await fetch(`/api/tournaments/${id}/restore`, { method: 'POST' });
    setActionId(null);
    load();
  }

  async function handleHardDelete(id: string, name: string) {
    if (!confirm(`Permanently delete "${name}"?\n\nThis will remove all players and matches. This CANNOT be undone.`)) return;
    setActionId(id);
    await fetch(`/api/tournaments/${id}/hard-delete`, { method: 'DELETE' });
    setActionId(null);
    load();
  }

  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/admin/tournaments" className="text-slate-400 hover:text-slate-600 text-sm font-medium">
              ← All Tournaments
            </Link>
          </div>
          <h1 className="text-2xl font-black text-slate-900">🗑 Recycle Bin</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {tournaments.length === 0
              ? 'No deleted tournaments.'
              : `${tournaments.length} deleted tournament${tournaments.length !== 1 ? 's' : ''} — restore or permanently delete`}
          </p>
        </div>
      </div>

      {tournaments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-4xl mb-3">✨</p>
          <p className="font-medium text-slate-600">Recycle bin is empty.</p>
          <p className="text-sm text-slate-400 mt-1">Deleted tournaments will appear here.</p>
        </div>
      ) : (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 text-sm text-amber-800">
            <strong>Warning:</strong> Permanently deleted tournaments cannot be recovered. All players and match data will be erased.
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                    <th className="px-5 py-3 text-left">Tournament</th>
                    <th className="px-5 py-3 text-left">School</th>
                    <th className="px-5 py-3 text-left">Status at deletion</th>
                    <th className="px-5 py-3 text-left">Players</th>
                    <th className="px-5 py-3 text-left">Deleted</th>
                    <th className="px-5 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tournaments.map((tm) => {
                    const tenant = tenantMap[tm.tenant_id];
                    const busy = actionId === tm.id;
                    const deletedDate = new Date(tm.deleted_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    });

                    return (
                      <tr key={tm.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-700">{tm.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Created {new Date(tm.created_at).toLocaleDateString()}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tenant?.primary_color ?? '#94a3b8' }} />
                            <span className="text-slate-600 text-xs">{tenant?.display_name ?? '—'}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                            {STATUS_LABELS[tm.status] ?? tm.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-500 text-xs">
                          {tm.player_count ?? 0} / {(tm.settings?.maxPlayers as number | undefined) ?? '?'}
                        </td>
                        <td className="px-5 py-4 text-slate-400 text-xs">{deletedDate}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleRestore(tm.id)}
                              disabled={busy}
                              className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 transition-colors disabled:opacity-40"
                            >
                              {busy ? '…' : '↩ Restore'}
                            </button>
                            <button
                              onClick={() => handleHardDelete(tm.id, tm.name)}
                              disabled={busy}
                              className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
                            >
                              {busy ? '…' : 'Delete forever'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
