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

const DEMO_ACCOUNTS: { email: string; role: UserRole; label: string; description: string; landingPath: string; tenant?: string }[] = [
  {
    email: 'director.stanford@demo.onepointbowl.com',
    role: 'tenant_admin',
    label: 'Stanford Director',
    description: 'Manages Stanford tournaments: closes registration, generates brackets, manipulates draw seeding, starts live play.',
    landingPath: '/dashboard',
    tenant: 'Stanford',
  },
  {
    email: 'director.ucla@demo.onepointbowl.com',
    role: 'tenant_admin',
    label: 'UCLA Director',
    description: 'Manages UCLA Tennis Club tournaments. Isolated to UCLA tenant only — cannot see Stanford or USC data.',
    landingPath: '/dashboard',
    tenant: 'UCLA',
  },
  {
    email: 'director.usc@demo.onepointbowl.com',
    role: 'tenant_admin',
    label: 'USC Director',
    description: 'Manages USC Trojans Tennis tournaments. Isolated to USC tenant only.',
    landingPath: '/dashboard',
    tenant: 'USC',
  },
  {
    email: 'referee1@demo.onepointbowl.com',
    role: 'referee',
    label: 'Stanford Referee',
    description: 'Mobile scorekeeper for Stanford: confirms players present, triggers coin toss, declares match winner point-by-point.',
    landingPath: '/referee',
    tenant: 'Stanford',
  },
  {
    email: 'referee.ucla@demo.onepointbowl.com',
    role: 'referee',
    label: 'UCLA Referee',
    description: 'Court referee for UCLA Tennis Club. Only sees UCLA matches in the queue.',
    landingPath: '/referee',
    tenant: 'UCLA',
  },
  {
    email: 'referee.usc@demo.onepointbowl.com',
    role: 'referee',
    label: 'USC Referee',
    description: 'Court referee for USC Trojans. Only sees USC matches in the queue.',
    landingPath: '/referee',
    tenant: 'USC',
  },
  {
    email: 'player.demo@demo.onepointbowl.com',
    role: 'player',
    label: 'Player / Spectator',
    description: 'Public-facing experience: views live bracket, registers for tournaments, sees real-time match updates.',
    landingPath: '/t/stanford-club-tennis',
  },
];

interface EditState {
  userId: string;
  role: UserRole;
  tenantIds: string[];
}

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
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail: email, origin: window.location.origin, landingPath }),
      });
      const data = await res.json();
      if (data.magicLink) {
        window.open(data.magicLink, '_blank');
      } else {
        setMsg(`Error: ${data.error ?? 'Unknown error — check server logs'}`);
      }
    } catch (e) {
      setMsg(`Failed to contact impersonate API: ${e}`);
    }
    setImpersonating(null);
  }

  function startEdit(u: UserRow) {
    setEditing({ userId: u.id, role: u.role, tenantIds: u.assigned_tenant_ids ?? [] });
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
      if (res.ok) {
        setMsg(`Confirmation email resent to ${email}.`);
      } else {
        setMsg(`Error: ${data.error ?? 'Failed to resend'}`);
      }
    } catch (e) {
      setMsg(`Failed to contact resend API: ${e}`);
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

  function tenantDisplay(u: UserRow) {
    if (u.role === 'super_admin') return <span className="text-xs text-purple-600 font-semibold">All</span>;
    if (!u.assigned_tenant_ids?.length) return <span className="text-slate-400 text-xs">—</span>;
    const names = u.assigned_tenant_ids.map((id) => tenants.find((t) => t.id === id)?.display_name ?? id.slice(0, 8));
    return <span className="text-slate-500 text-xs">{names.join(', ')}</span>;
  }

  function primaryTenantName(ids: string[]) {
    if (!ids?.length) return '';
    return tenants.find((t) => t.id === ids[0])?.display_name ?? '';
  }

  function tenantNames(ids: string[]) {
    if (!ids?.length) return '';
    return ids.map((id) => tenants.find((t) => t.id === id)?.display_name ?? id.slice(0, 8)).join(', ');
  }

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = q
      ? users.filter((u) => {
          const tName = tenantNames(u.assigned_tenant_ids).toLowerCase();
          const [emailLocal] = u.email.split('@');
          const parts = emailLocal.replace(/[._-]/g, ' ').split(' ');
          return (
            u.email.toLowerCase().includes(q) ||
            tName.includes(q) ||
            ROLE_LABELS[u.role]?.toLowerCase().includes(q) ||
            parts.some((p) => p.startsWith(q))
          );
        })
      : [...users];

    const ROLE_ORDER: Record<string, number> = { super_admin: 0, tenant_admin: 1, referee: 2, player: 3 };

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
  }, [users, tenants, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="text-slate-300 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900">User Management</h1>
        <p className="text-slate-500 mt-1 text-sm">Manage roles and impersonate users to test their experience</p>
      </div>

      {msg && <p className="text-sm bg-emerald-50 text-emerald-700 rounded-xl p-3">{msg}</p>}

      {/* Demo Accounts Quick Panel — hidden in production */}
      {(process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_SHOW_DEMO_PANEL === 'true') && (
      <div className="bg-slate-900 rounded-2xl p-6 text-white space-y-4">
        <div>
          <h2 className="font-black text-lg">🎭 Impersonate Demo Accounts</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Click any button to open a new tab and land instantly as that user — no copy/paste required.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {DEMO_ACCOUNTS.map((account) => (
            <div key={account.email} className="bg-slate-800 rounded-xl p-4 space-y-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ROLE_STYLES[account.role]}`}>
                    {ROLE_LABELS[account.role]}
                  </span>
                  {account.tenant && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-700 text-slate-300">{account.tenant}</span>
                  )}
                </div>
                <p className="font-bold text-white mt-2">{account.label}</p>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">{account.description}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500 font-mono truncate">{account.email}</p>
                <button
                  onClick={() => handleImpersonate(account.email, account.landingPath)}
                  disabled={impersonating === account.email}
                  className="w-full py-2 rounded-lg bg-white text-slate-900 text-xs font-bold hover:bg-slate-100 transition-colors disabled:opacity-60"
                >
                  {impersonating === account.email ? 'Opening…' : '↗ Open as this user'}
                </button>
                <p className="text-xs text-slate-600 text-center">Opens a new tab · lands on {account.landingPath}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-700 pt-4">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">How it works</p>
          <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
            <li>You stay logged in as <strong className="text-white">Super Admin</strong> in this tab</li>
            <li>Click any button above → a new tab opens and you&apos;re instantly logged in as that user</li>
            <li>The new tab lands directly on that role&apos;s page — no passwords, no copy/paste</li>
            <li>Close the tab when done — your Super Admin session here is unaffected</li>
          </ol>
        </div>
      </div>
      )}

      {/* All Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h2 className="font-bold text-slate-800">All Platform Users ({users.length})</h2>
            {filteredUsers.length !== users.length && (
              <p className="text-xs text-slate-400 mt-0.5">{filteredUsers.length} matching</p>
            )}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email, name, tenant, or role…"
            className="w-full sm:w-72 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-6 py-3 text-left">
                  <button onClick={() => toggleSort('email')} className="flex items-center hover:text-slate-700">
                    Email <SortIcon col="email" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left">
                  <button onClick={() => toggleSort('role')} className="flex items-center hover:text-slate-700">
                    Role <SortIcon col="role" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left">
                  <button onClick={() => toggleSort('tenant')} className="flex items-center hover:text-slate-700">
                    Tenant <SortIcon col="tenant" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 text-sm">No users match your search.</td></tr>
              )}
              {(() => {
                const rows: React.ReactNode[] = [];
                let lastGroup = '';
                filteredUsers.forEach((u) => {
                  const group = sortKey === 'tenant'
                    ? (u.role === 'super_admin' ? 'All Tenants' : tenantNames(u.assigned_tenant_ids) || 'Unassigned')
                    : sortKey === 'role'
                    ? (ROLE_LABELS[u.role] ?? u.role)
                    : '';

                  if (sortKey !== 'email' && group !== lastGroup) {
                    lastGroup = group;
                    rows.push(
                      <tr key={`group-${group}`} className="bg-slate-50">
                        <td colSpan={4} className="px-6 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest">
                          {group}
                        </td>
                      </tr>
                    );
                  }

                  const isEditing = editing?.userId === u.id;
                  rows.push(
                    <tr key={u.id} className={isEditing ? 'bg-slate-50' : 'hover:bg-slate-50'}>
                      <td className="px-6 py-3 font-medium text-slate-800">
                        {u.email}
                        {DEMO_ACCOUNTS.some((d) => d.email === u.email) && (
                          <span className="ml-2 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-normal">demo</span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ROLE_STYLES[u.role]}`}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-6 py-3">{tenantDisplay(u)}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => isEditing ? setEditing(null) : startEdit(u)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                          >
                            {isEditing ? 'Cancel' : 'Edit'}
                          </button>
                          <button
                            onClick={() => handleResendConfirmation(u.email)}
                            disabled={resending === u.email}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-60 transition-colors"
                            title="Resend confirmation email"
                          >
                            {resending === u.email ? 'Sending…' : '✉ Resend'}
                          </button>
                          {DEMO_ACCOUNTS.find((d) => d.email === u.email) && (
                            <button
                              onClick={() => {
                                const account = DEMO_ACCOUNTS.find((d) => d.email === u.email)!;
                                handleImpersonate(u.email, account.landingPath);
                              }}
                              disabled={impersonating === u.email}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-60 transition-colors"
                              style={{ color: 'var(--tenant-primary)' }}
                            >
                              {impersonating === u.email ? 'Opening…' : '↗ Open as user'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                  if (isEditing && editing) {
                    rows.push(
                      <tr key={`edit-${u.id}`} className="bg-slate-50 border-t border-slate-200">
                        <td colSpan={4} className="px-6 py-4">
                          <div className="space-y-4 max-w-lg">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Editing: {u.email}</p>
                            <div>
                              <p className="text-xs font-semibold text-slate-500 mb-2">Role</p>
                              <div className="flex flex-wrap gap-2">
                                {(['super_admin', 'tenant_admin', 'referee', 'player'] as UserRole[]).map((r) => (
                                  <button
                                    key={r}
                                    type="button"
                                    onClick={() => setEditing((e) => e ? { ...e, role: r } : e)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-colors ${
                                      editing.role === r
                                        ? ROLE_STYLES[r] + ' border-current'
                                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                                    }`}
                                  >
                                    {ROLE_LABELS[r]}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {(editing.role === 'tenant_admin' || editing.role === 'referee') && (
                              <div>
                                <p className="text-xs font-semibold text-slate-500 mb-2">
                                  Assigned Tenant(s)
                                  <span className="text-slate-400 font-normal ml-1">— select one or more</span>
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {tenants.map((t) => {
                                    const selected = editing.tenantIds.includes(t.id);
                                    return (
                                      <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => toggleTenant(t.id)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-colors ${
                                          selected
                                            ? 'bg-slate-800 text-white border-slate-800'
                                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                                        }`}
                                      >
                                        {selected ? '✓ ' : ''}{t.display_name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={handleSaveEdit}
                                disabled={saving}
                                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 disabled:opacity-60 transition-colors"
                              >
                                {saving ? 'Saving…' : 'Save Changes'}
                              </button>
                              <button
                                onClick={() => setEditing(null)}
                                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                });
                return rows;
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual testing guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 space-y-3">
        <h3 className="font-bold text-blue-900">Manual Testing Guide</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-blue-800">
          <div>
            <p className="font-bold mb-1">🎾 Tournament Director</p>
            <ul className="text-xs space-y-1 text-blue-700">
              <li>• Login: <code className="bg-blue-100 px-1 rounded">director.stanford@demo...</code></li>
              <li>• Go to <strong>/dashboard</strong></li>
              <li>• Click Stanford tournaments</li>
              <li>• Try Draw Editor tab to swap seeds</li>
              <li>• Click "Start Live Play" on a bracket_generated tournament</li>
            </ul>
          </div>
          <div>
            <p className="font-bold mb-1">🟡 Referee</p>
            <ul className="text-xs space-y-1 text-blue-700">
              <li>• Login: <code className="bg-blue-100 px-1 rounded">referee1@demo...</code></li>
              <li>• Go to <strong>/referee</strong></li>
              <li>• See live match queue</li>
              <li>• Click a match → coin toss → declare winner</li>
              <li>• Watch bracket update in real time</li>
            </ul>
          </div>
          <div>
            <p className="font-bold mb-1">👀 Player / Spectator</p>
            <ul className="text-xs space-y-1 text-blue-700">
              <li>• No login needed</li>
              <li>• Visit <strong>/t/stanford-club-tennis</strong></li>
              <li>• Click a tournament → live bracket</li>
              <li>• Click Register on an open tournament</li>
              <li>• Watch bracket update as referee scores</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
