'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/browser';

interface AdminUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

export default function AdminAdminsPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function fetchAdmins() {
    const supabase = createClient();
    const { data } = await supabase
      .from('users')
      .select('id, email, role, created_at')
      .eq('role', 'super_admin')
      .order('created_at');
    setAdmins(data ?? []);
  }

  useEffect(() => { fetchAdmins(); }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const supabase = createClient();

    // Check if user exists
    const { data: existing } = await supabase
      .from('users')
      .select('id, role')
      .eq('email', email)
      .single();

    if (existing) {
      const { error } = await supabase
        .from('users')
        .update({ role: 'super_admin' })
        .eq('id', existing.id);
      if (error) setMessage(error.message);
      else { setMessage(`${email} promoted to Super Admin.`); setEmail(''); fetchAdmins(); }
    } else {
      setMessage('User not found. They must sign up first, then can be promoted.');
    }
    setLoading(false);
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Platform Admins</h1>
        <p className="text-slate-500 mt-1 text-sm">Grant or revoke Super Admin access</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-bold text-slate-800">Add Super Admin</h2>
        <form onSubmit={handleInvite} className="flex gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1"
          />
          <button
            type="submit"
            disabled={loading}
            className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 whitespace-nowrap"
          >
            {loading ? 'Saving…' : 'Grant Access'}
          </button>
        </form>
        {message && <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3">{message}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">Current Super Admins ({admins.length})</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {admins.length === 0 && (
            <p className="px-6 py-8 text-center text-slate-400 text-sm">No admins found</p>
          )}
          {admins.map((a) => (
            <div key={a.id} className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800 text-sm">{a.email}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Since {new Date(a.created_at).toLocaleDateString()}
                </p>
              </div>
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                Super Admin
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
