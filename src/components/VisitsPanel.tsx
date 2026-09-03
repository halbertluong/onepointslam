'use client';

import { useState, useEffect } from 'react';
import VisitsStatsPanel from '@/components/VisitsStatsPanel';

/**
 * How many people have landed on this tournament's public registration
 * page, and where from — pulled from registration_page_visits via a
 * director-authorized API route (the table has no client-readable RLS
 * policy, same as pending_registrations).
 */
export default function VisitsPanel({ tournamentId }: { tournamentId: string }) {
  const [stats, setStats] = useState<Parameters<typeof VisitsStatsPanel>[0]['stats'] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tournaments/${tournamentId}/page-visits`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setStats(data);
      })
      .catch(() => { if (!cancelled) setError('Failed to load visit stats.'); });
    return () => { cancelled = true; };
  }, [tournamentId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-bold text-slate-800">Registration Page Visits</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          How many people have landed on this tournament&apos;s public registration page, and where from.
        </p>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}
      {!error && !stats && <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>}
      {stats && <VisitsStatsPanel stats={stats} emptyHint="No visits recorded yet." />}
    </div>
  );
}
