import { createClient } from '@/lib/supabase/server';

export default async function AdminPage() {
  const supabase = await createClient();

  const [{ data: tenants }, { data: tournaments }] = await Promise.all([
    supabase.from('tenants').select('*').order('created_at', { ascending: false }),
    supabase.from('tournaments').select('id, tenant_id, status'),
  ]);

  const activeTournaments = (tournaments ?? []).filter(
    (t) => t.status === 'live_play' || t.status === 'bracket_generated',
  ).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Platform Overview</h1>
        <p className="text-slate-500 mt-1 text-sm">All tenants and system health</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Tenants', value: tenants?.length ?? 0 },
          { label: 'Active Tournaments', value: activeTournaments },
          { label: 'Total Tournaments', value: tournaments?.length ?? 0 },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className="text-3xl font-black text-slate-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tenants table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">Registered Tenants</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-6 py-3 text-left">School</th>
                <th className="px-6 py-3 text-left">Slug</th>
                <th className="px-6 py-3 text-left">Tournaments</th>
                <th className="px-6 py-3 text-left">Created</th>
                <th className="px-6 py-3 text-left">Stripe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    No tenants yet
                  </td>
                </tr>
              )}
              {tenants?.map((t) => {
                const tCount = (tournaments ?? []).filter((tm) => tm.tenant_id === t.id).length;
                return (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-800">{t.display_name}</td>
                    <td className="px-6 py-4 font-mono text-slate-500 text-xs">{t.slug}</td>
                    <td className="px-6 py-4 text-slate-600">{tCount}</td>
                    <td className="px-6 py-4 text-slate-500">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {t.stripe_connect_account_id ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                          Connected
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs">
                          Not set
                        </span>
                      )}
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
