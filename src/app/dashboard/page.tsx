import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import type { Tournament } from '@/types';

const STATUS_STYLES: Record<string, string> = {
  registration_open: 'bg-emerald-100 text-emerald-700',
  registration_closed: 'bg-amber-100 text-amber-700',
  bracket_generated: 'bg-blue-100 text-blue-700',
  live_play: 'bg-red-100 text-red-700',
  completed: 'bg-slate-100 text-slate-600',
};

const STATUS_LABELS: Record<string, string> = {
  registration_open: 'Registration Open',
  registration_closed: 'Registration Closed',
  bracket_generated: 'Bracket Ready',
  live_play: 'Live',
  completed: 'Completed',
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from('users')
    .select('assigned_tenant_ids')
    .eq('id', user!.id)
    .single();

  const tenantId = appUser?.assigned_tenant_ids?.[0];

  const { data: tournaments } = tenantId
    ? await supabase
        .from('tournaments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
    : { data: [] };

  const live = (tournaments ?? []).filter((t) => t.status === 'live_play');
  const open = (tournaments ?? []).filter((t) => t.status === 'registration_open');

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Tournament Hub</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {live.length > 0 ? `${live.length} live · ` : ''}
            {open.length} open for registration
          </p>
        </div>
        {tenantId && (
          <Link
            href="/dashboard/tournaments/new"
            className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold"
          >
            + New Tournament
          </Link>
        )}
      </div>

      {!tenantId && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <p className="text-amber-800 font-medium">
            Your account is not linked to a school tenant yet.
            Contact a Super Admin to get set up.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(tournaments ?? []).map((t: Tournament) => (
          <Link
            key={t.id}
            href={`/dashboard/tournaments/${t.id}`}
            className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 hover:shadow-sm transition-all group"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="font-bold text-slate-800 group-hover:text-slate-900 leading-snug">
                {t.name}
              </h3>
              <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLES[t.status]}`}>
                {STATUS_LABELS[t.status]}
              </span>
            </div>
            <div className="text-xs text-slate-400 space-y-1">
              <p>Max {t.settings?.maxPlayers ?? '—'} players</p>
              <p>Created {new Date(t.createdAt).toLocaleDateString()}</p>
            </div>
          </Link>
        ))}

        {(tournaments ?? []).length === 0 && tenantId && (
          <div className="col-span-full text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">🎾</p>
            <p className="font-medium">No tournaments yet.</p>
            <p className="text-sm mt-1">Create your first draw to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
