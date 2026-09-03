'use client';

interface VisitStats {
  total: number;
  last7Days: number;
  last30Days: number;
  byDay: { date: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
  topLocations: { location: string; count: number }[];
  recent: {
    created_at: string;
    referrer: string | null;
    ip_address: string | null;
    country: string | null;
    region: string | null;
    city: string | null;
    user_agent: string | null;
  }[];
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Renders the visit stats an API route hands back — shared between the
 * per-tournament dashboard tab and the super-admin account-signup view so
 * the two don't drift into different layouts for the same data shape.
 */
export default function VisitsStatsPanel({ stats, emptyHint }: { stats: VisitStats; emptyHint: string }) {
  if (stats.total === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">{emptyHint}</p>;
  }

  const maxDay = Math.max(1, ...stats.byDay.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Visits', value: stats.total },
          { label: 'Last 7 Days', value: stats.last7Days },
          { label: 'Last 30 Days', value: stats.last30Days },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {stats.byDay.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Visits per day (last 30 days)</p>
          <div className="flex items-end gap-1 h-24">
            {stats.byDay.map((d) => (
              <div
                key={d.date}
                className="flex-1 rounded-t bg-blue-200 hover:bg-blue-400 transition-colors"
                style={{ height: `${Math.max(4, (d.count / maxDay) * 100)}%` }}
                title={`${d.date}: ${d.count} visit${d.count === 1 ? '' : 's'}`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Where visitors came from</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {stats.topReferrers.map((r) => (
              <div key={r.referrer} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-slate-600 truncate">{r.referrer}</span>
                <span className="font-semibold text-slate-800 shrink-0 ml-3">{r.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Where visitors are located</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {stats.topLocations.map((l) => (
              <div key={l.location} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-slate-600 truncate">{l.location}</span>
                <span className="font-semibold text-slate-800 shrink-0 ml-3">{l.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Recent visits</h3>
          <span className="text-xs text-slate-400">Most recent {stats.recent.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2 text-left">When</th>
                <th className="px-4 py-2 text-left">Location</th>
                <th className="px-4 py-2 text-left">IP</th>
                <th className="px-4 py-2 text-left">Referrer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.recent.map((v, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{formatWhen(v.created_at)}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {[v.city, v.region, v.country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-2 text-slate-400 font-mono text-xs">{v.ip_address ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-500 truncate max-w-[220px]">{v.referrer ?? 'Direct'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
