'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/browser';

type SortKey = 'tenant' | 'email' | 'role';
type SortDir = 'asc' | 'desc';
type UserRole = 'super_admin' | 'tenant_admin' | 'referee' | 'player';

interface UserRow {
  id: string;
  email: string;
  role: UserRole;
  assigned_tenant_ids: string[];
  created_at: string;
}

interface Tenant {
  id: string;
  display_name: string;
  slug: string;
}

interface EditState {
  userId: string;
  role: UserRole;
  tenantIds: string[];
}

const ROLE_STYLES: Record<UserRole, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  tenant_admin: 'bg-blue-100 text-blue-700',
  referee: 'bg-amber-100 text-amber-700',
  player: 'bg-emerald-100 text-emerald-700',
};

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  tenant_admin: 'Tournament Director',
  referee: 'Referee',
  player: 'Player / Spectator',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [resending, setResending] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('tenant');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: u }, { data: t }] = await Promise.all([
      supabase.from('users').select('*').order('created_at', { ascending: false }),
      supabase.from('tenants').select('id, display_name, slug').order('display_name'),
    ]);
    setUsers(u ?? []);
    setTenants(t ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleImpersonate(email: string, landingPath: string) {
    setImpersonating(email);
    setMsg('');
    // Open window immediately (in the click handler) so browsers don't block it as a popup
    const newTab = window.open('', '_blank');
    if (newTab) newTab.document.write('<p style="font-family:sans-serif;padding:2rem;color:#64748b">Signing in…</p>');
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail: email, origin: window.location.origin, landingPath }),
      });
      const data = await res.json();
      if (data.url && newTab) {
        newTab.location.href = data.url;
      } else {
        newTab?.close();
        setMsg(`Error: ${data.error ?? JSON.stringify(data)}`);
      }
    } catch (e) {
      newTab?.close();
      setMsg(`Failed: ${e}`);
    }
    setImpersonating(null);
  }

  async function handleResendConfirmation(email: string) {
    setResending(email);
    setMsg('');
    try {
      const res = await fetch('/api/admin/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setMsg(res.ok ? `Confirmation sent to ${email}.` : `Error: ${data.error ?? 'Failed'}`);
    } catch (e) {
      setMsg(`Failed: ${e}`);
    }
    setResending(null);
    setTimeout(() => setMsg(''), 5000);
  }

  async function handleSaveEdit() {
    if (!editing) return;
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from('users')
      .update({ role: editing.role, assigned_tenant_ids: editing.tenantIds })
      .eq('id', editing.userId);
    setSaving(false);
    setEditing(null);
    setMsg('User updated.');
    load();
    setTimeout(() => setMsg(''), 3000);
  }

  function toggleTenant(id: string) {
    if (!editing) return;
    setEditing((e) => e ? ({
      ...e,
      tenantIds: e.tenantIds.includes(id)
        ? e.tenantIds.filter((t) => t !== id)
        : [...e.tenantIds, id],
    }) : e);
  }

  function tenantNames(ids: string[]) {
    if (!ids?.length) return '';
    return ids.map((id) => tenants.find((t) => t.id === id)?.display_name ?? id.slice(0, 8)).join(', ');
  }

  function primaryTenantName(ids: string[]) {
    if (!ids?.length) return '';
    return tenants.find((t) => t.id === ids[0])?.display_name ?? '';
  }

  const ROLE_ORDER: Record<string, number> = { super_admin: 0, tenant_admin: 1, referee: 2, player: 3 };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = q
      ? users.filter((u) => {
          const tName = tenantNames(u.assigned_tenant_ids).toLowerCase();
          return (
            u.email.toLowerCase().includes(q) ||
            tName.includes(q) ||
            ROLE_LABELS[u.role]?.toLowerCase().includes(q)
          );
        })
      : [...users];

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'tenant') {
        const ta = primaryTenantName(a.assigned_tenant_ids).toLowerCase();
        const tb = primaryTenantName(b.assigned_tenant_ids).toLowerCase();
        cmp = ta.localeCompare(tb) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.email.localeCompare(b.email);
      } else if (sortKey === 'email') {
        cmp = a.email.localeCompare(b.email);
      } else if (sortKey === 'role') {
        cmp = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.email.localeCompare(b.email);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, tenants, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;

  // Build grouped card list
  const items: ({ type: 'group'; label: string } | { type: 'user'; user: UserRow })[] = [];
  let lastGroup = '';
  filteredUsers.forEach((u) => {
    const group = sortKey === 'tenant'
      ? (u.role === 'super_admin' ? 'All Tenants' : tenantNames(u.assigned_tenant_ids) || 'Unassigned')
      : sortKey === 'role'
      ? (ROLE_LABELS[u.role] ?? u.role)
      : '';

    if (sortKey !== 'email' && group !== lastGroup) {
      lastGroup = group;
      items.push({ type: 'group', label: group });
    }
    items.push({ type: 'user', user: u });
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">User Management</h1>
        <p className="text-slate-500 mt-1 text-sm">Manage roles and impersonate users</p>
      </div>

      {msg && (
        <p className="text-sm bg-emerald-50 text-emerald-700 rounded-xl p-3">{msg}</p>
      )}

      {/* Search + sort */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-4 border-b border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-800">All Platform Users ({users.length})</h2>
            {filteredUsers.length !== users.length && (
              <span className="text-xs text-slate-400">{filteredUsers.length} shown</span>
            )}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, tenant, role…"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <div className="flex gap-2 text-xs">
            <span className="text-slate-400 self-center">Sort:</span>
            {(['tenant', 'role', 'email'] as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => toggleSort(k)}
                className={`px-3 py-1.5 rounded-lg font-semibold border transition-colors ${
                  sortKey === k
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {k.charAt(0).toUpperCase() + k.slice(1)}
                {sortKey === k && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </button>
            ))}
          </div>
        </div>

        {/* Card list */}
        <div className="divide-y divide-slate-100">
          {items.length === 0 && (
            <p className="px-4 py-8 text-center text-slate-400 text-sm">No users match your search.</p>
          )}
          {items.map((item, i) => {
            if (item.type === 'group') {
              return (
                <div key={`g-${i}`} className="px-4 py-2 bg-slate-50">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{item.label}</span>
                </div>
              );
            }

            const u = item.user;
            const isEditing = editing?.userId === u.id;
            const tenantLabel = u.role === 'super_admin'
              ? 'All tenants'
              : tenantNames(u.assigned_tenant_ids) || '—';

            return (
              <div key={u.id} className={`px-4 py-4 space-y-3 ${isEditing ? 'bg-slate-50' : ''}`}>
                {/* Top row: email + role badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 break-all">{u.email}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{tenantLabel}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${ROLE_STYLES[u.role]}`}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </div>

                {/* Edit form */}
                {isEditing && editing && (
                  <div className="space-y-4 pt-1">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-2">Role</p>
                      <div className="flex flex-wrap gap-2">
                        {(['super_admin', 'tenant_admin', 'referee', 'player'] as UserRole[]).map((r) => (
                          <button
                            key={r}
                            onClick={() => setEditing((e) => e ? { ...e, role: r } : e)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-colors ${
                              editing.role === r
                                ? ROLE_STYLES[r] + ' border-current'
                                : 'border-slate-200 text-slate-500'
                            }`}
                          >
                            {ROLE_LABELS[r]}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(editing.role === 'tenant_admin' || editing.role === 'referee') && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2">Assigned Tenant(s)</p>
                        <div className="flex flex-wrap gap-2">
                          {tenants.map((t) => {
                            const selected = editing.tenantIds.includes(t.id);
                            return (
                              <button
                                key={t.id}
                                onClick={() => toggleTenant(t.id)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-colors ${
                                  selected
                                    ? 'bg-slate-800 text-white border-slate-800'
                                    : 'border-slate-200 text-slate-600'
                                }`}
                              >
                                {selected ? '✓ ' : ''}{t.display_name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving}
                        className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-60"
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => isEditing ? setEditing(null) : setEditing({ userId: u.id, role: u.role, tenantIds: u.assigned_tenant_ids ?? [] })}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    {isEditing ? 'Cancel' : 'Edit'}
                  </button>
                  <button
                    onClick={() => handleResendConfirmation(u.email)}
                    disabled={resending === u.email}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-60 transition-colors"
                  >
                    {resending === u.email ? 'Sending…' : '✉ Resend'}
                  </button>
                  <button
                    onClick={() => handleImpersonate(u.email, u.role === 'referee' ? '/referee' : u.role === 'tenant_admin' ? '/dashboard' : '/')}
                    disabled={impersonating === u.email}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-60 transition-colors text-blue-600"
                  >
                    {impersonating === u.email ? 'Opening…' : '↗ Open as user'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
