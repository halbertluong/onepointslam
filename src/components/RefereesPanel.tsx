'use client';

import { useState, useEffect, useCallback } from 'react';

interface Referee {
  id: string;
  email: string;
  created_at: string;
}

export default function RefereesPanel() {
  const [referees, setReferees] = useState<Referee[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/tenant/referees');
    const data = await res.json();
    if (res.ok) setReferees(data.referees ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setInviting(true);
    setMessage('');
    setIsError(false);
    try {
      const res = await fetch('/api/tenant/referees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? 'Failed to add referee.');
        setIsError(true);
      } else {
        setMessage(data.created ? `Invite sent to ${trimmed}.` : `${trimmed} is now a referee for this program.`);
        setEmail('');
        await load();
      }
    } catch (err) {
      setMessage(`Failed: ${err}`);
      setIsError(true);
    }
    setInviting(false);
  }

  async function handleRemove(id: string, refereeEmail: string) {
    if (!confirm(`Remove ${refereeEmail} as a referee for this program?`)) return;
    setRemovingId(id);
    setMessage('');
    setIsError(false);
    const res = await fetch(`/api/tenant/referees?userId=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? 'Failed to remove referee.');
      setIsError(true);
    }
    setRemovingId(null);
    await load();
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
      <div>
        <h2 className="font-bold text-slate-800">Referees</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Add referees for this program by email. New referees get an invite link to set up their account.
        </p>
      </div>

      <form onSubmit={handleInvite} className="flex gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="referee@example.edu"
          className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1"
        />
        <button
          type="submit"
          disabled={inviting}
          className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 whitespace-nowrap"
        >
          {inviting ? 'Adding…' : '+ Add Referee'}
        </button>
      </form>

      {message && (
        <p className={`text-sm rounded-xl p-3 ${isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{message}</p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading referees…</p>
      ) : referees.length === 0 ? (
        <p className="text-sm text-slate-400">No referees added yet.</p>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
          {referees.map((r) => (
            <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-700 break-all">{r.email}</span>
              <button
                type="button"
                onClick={() => handleRemove(r.id, r.email)}
                disabled={removingId === r.id}
                className="text-xs font-semibold text-slate-300 hover:text-red-600 transition-colors disabled:opacity-50 shrink-0"
              >
                {removingId === r.id ? '…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
