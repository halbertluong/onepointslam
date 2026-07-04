import { createClient } from '@/lib/supabase/server';

export default async function WaitlistPage() {
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from('waitlist')
    .select('*')
    .order('created_at', { ascending: false });

  const rows = entries ?? [];

  const sportCounts = rows.reduce<Record<string, number>>((acc, r) => {
    const s = r.sport ?? 'Unknown';
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Waitlist</h1>
        <p className="text-slate-500 mt-1 text-sm">{rows.length} total {rows.length === 1 ? 'entry' : 'entries'}</p>
      </div>

      {/* Sport breakdown */}
      {Object.keys(sportCounts).length > 0 && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(sportCounts).sort((a, b) => b[1] - a[1]).map(([sport, count]) => (
            <div key={sport} className="bg-white rounded-xl border border-slate-200 px-4 py-2 flex items-center gap-2">
              <span className="font-bold text-slate-800">{count}</span>
              <span className="text-slate-500 text-sm">{sport}</span>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-semibold">No waitlist entries yet</p>
          <p className="text-sm mt-1">Entries will appear here once coaches fill out the form.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">School</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Title</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Sport</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Program</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Notes</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wide">Signed up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{r.name ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <a href={`mailto:${r.email}`} className="hover:underline">{r.email}</a>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.school ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-slate-600">{r.title ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3">
                      {r.sport ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700">{r.sport}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.program ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{r.notes ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
