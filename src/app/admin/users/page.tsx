'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useRouter } from 'next/navigation';

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
    email: 'director.stanford@demo.onepointslam.com',
    role: 'tenant_admin',
    label: 'Stanford Director',
    description: 'Manages Stanford tournaments: closes registration, generates brackets, manipulates draw seeding, starts live play.',
    landingPath: '/dashboard',
    tenant: 'Stanford',
  },
  {
    email: 'director.ucla@demo.onepointslam.com',
    role: 'tenant_admin',
    label: 'UCLA Director',
    description: 'Manages UCLA Tennis Club tournaments. Isolated to UCLA tenant only — cannot see Stanford or USC data.',
    landingPath: '/dashboard',
    tenant: 'UCLA',
  },
  {
    email: 'director.usc@demo.onepointslam.com',
    role: 'tenant_admin',
    label: 'USC Director',
    description: 'Manages USC Trojans Tennis tournaments. Isolated to USC tenant only.',
    landingPath: '/dashboard',
    tenant: 'USC',
  },
  {
    email: 'referee1@demo.onepointslam.com',
    role: 'referee',
    label: 'Stanford Referee',
    description: 'Mobile scorekeeper for Stanford: confirms players present, triggers coin toss, declares match winner point-by-point.',
    landingPath: '/referee',
    tenant: 'Stanford',
  },
  {
    email: 'referee.ucla@demo.onepointslam.com',
    role: 'referee',
    label: 'UCLA Referee',
    description: 'Court referee for UCLA Tennis Club. Only sees UCLA matches in the queue.',
    landingPath: '/referee',
    tenant: 'UCLA',
  },
  {
    email: 'referee.usc@demo.onepointslam.com',
    role: 'referee',
    label: 'USC Referee',
    description: 'Court referee for USC Trojans. Only sees USC matches in the queue.',
    landingPath: '/referee',
    tenant: 'USC',
  },
  {
    email: 'player.demo@demo.onepointslam.com',
    role: 'player',
    label: 'Player / Spectator',
    description: 'Public-facing experience: views live bracket, registers for tournaments, sees real-time match updates.',
    landingPath: '/t/stanford-club-tennis',
  },
];

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: u }, { data: t }] = await Promise.all([
      supabase.from('users').select('*').order('created_at', { ascending: false }),
      supabase.from('tenants').select('id, display_name, slug'),
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
        body: JSON.stringify({
          targetEmail: email,
          origin: window.location.origin,
          landingPath,
        }),
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

  async function handleRoleChange(userId: string, newRole: UserRole) {
    setSavingRole(userId);
    const supabase = createClient();
    await supabase.from('users').update({ role: newRole }).eq('id', userId);
    setSavingRole(null);
    setEditingRole(null);
    setMsg('Role updated.');
    load();
    setTimeout(() => setMsg(''), 2000);
  }

  function tenantNames(ids: string[]) {
    if (!ids?.length) return '—';
    return ids.map((id) => tenants.find((t) => t.id === id)?.display_name ?? id.slice(0, 8)).join(', ');
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900">User Management</h1>
        <p className="text-slate-500 mt-1 text-sm">Manage roles and impersonate users to test their experience</p>
      </div>

      {msg && <p className="text-sm bg-emerald-50 text-emerald-700 rounded-xl p-3">{msg}</p>}

      {/* Demo Accounts Quick Panel */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white space-y-4">
        <div>
          <h2 className="font-black text-lg">🎭 Impersonate Demo Accounts</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Click to open a new tab logged in as that user. Password: <code className="text-amber-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">Demo1234!</code>
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
                  {impersonating === account.email ? 'Opening…' : '→ Login as this user'}
                </button>
                <p className="text-xs text-slate-600 text-center">Opens new tab · lands on {account.landingPath}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-700 pt-4">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">How to test in separate windows</p>
          <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
            <li>You are already logged in as <strong className="text-white">Super Admin</strong> in this window</li>
            <li>Click any button above → a new tab opens, already authenticated as that role</li>
            <li>Explore that role's UI, then close the tab to return here as Super Admin</li>
            <li>Or open an <strong className="text-white">Incognito window</strong> and log in with the email + password above for a fully isolated session</li>
          </ol>
        </div>
      </div>

      {/* All Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">All Platform Users ({users.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-6 py-3 text-left">Email</th>
                <th className="px-6 py-3 text-left">Role</th>
                <th className="px-6 py-3 text-left">Tenant(s)</th>
                <th className="px-6 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-medium text-slate-800">
                    {u.email}
                    {DEMO_ACCOUNTS.some((d) => d.email === u.email) && (
                      <span className="ml-2 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-normal">demo</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {editingRole === u.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          defaultValue={u.role}
                          className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none"
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                          disabled={savingRole === u.id}
                        >
                          {(['super_admin', 'tenant_admin', 'referee', 'player'] as UserRole[]).map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                        <button onClick={() => setEditingRole(null)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setEditingRole(u.id)} className="group flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ROLE_STYLES[u.role]}`}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                        <span className="text-xs text-slate-400 hidden group-hover:inline">edit</span>
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-3 text-slate-500 text-xs">{tenantNames(u.assigned_tenant_ids)}</td>
                  <td className="px-6 py-3">
                    {DEMO_ACCOUNTS.find((d) => d.email === u.email) ? (
                      <button
                        onClick={() => {
                          const account = DEMO_ACCOUNTS.find((d) => d.email === u.email)!;
                          handleImpersonate(u.email, account.landingPath);
                        }}
                        disabled={impersonating === u.email}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-60 transition-colors"
                        style={{ color: 'var(--tenant-primary)' }}
                      >
                        {impersonating === u.email ? 'Opening…' : '→ Impersonate'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
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
