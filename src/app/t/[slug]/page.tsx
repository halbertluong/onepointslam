import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Tenant, Tournament } from '@/types';

interface Props {
  params: Promise<{ slug: string }>;
}

const STATUS_INFO: Record<string, { label: string; style: string }> = {
  registration_open: { label: 'Open', style: 'bg-emerald-100 text-emerald-700' },
  registration_closed: { label: 'Closed', style: 'bg-amber-100 text-amber-700' },
  bracket_generated: { label: 'Bracket Ready', style: 'bg-blue-100 text-blue-700' },
  live_play: { label: '● LIVE', style: 'bg-red-100 text-red-700' },
  completed: { label: 'Completed', style: 'bg-slate-100 text-slate-600' },
};

export default async function TenantPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!tenant) notFound();

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('*')
    .eq('tenant_id', tenant.id)
    .neq('status', 'completed')
    .order('created_at', { ascending: false });

  const { data: pastTournaments } = await supabase
    .from('tournaments')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(5);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero banner */}
      <div
        className="py-16 px-6 text-white text-center"
        style={{ background: `linear-gradient(135deg, var(--tenant-primary), var(--tenant-secondary))` }}
      >
        {tenant.logo_url && (
          <img
            src={tenant.logo_url}
            alt={tenant.display_name}
            className="h-16 w-auto object-contain mx-auto mb-4 drop-shadow-lg"
          />
        )}
        <h1 className="text-4xl font-black tracking-tight">{tenant.display_name}</h1>
        <p className="mt-2 text-white/80 text-lg">SuddenSlam · Single Point Showdown</p>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* Active draws */}
        <section>
          <h2 className="text-xl font-black text-slate-900 mb-4">Active Draws</h2>
          {(tournaments ?? []).length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-white rounded-2xl border border-slate-200">
              <p className="text-3xl mb-2">🎾</p>
              <p>No active tournaments right now.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(tournaments ?? []).map((t: Tournament) => {
                const info = STATUS_INFO[t.status] ?? STATUS_INFO.registration_open;
                const isOpen = t.status === 'registration_open';
                return (
                  <div
                    key={t.id}
                    className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-bold text-slate-900 text-lg">{t.name}</h3>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${info.style}`}>
                        {info.label}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500 space-y-1 mb-4">
                      <p>Draw: {t.settings?.maxPlayers ?? '?'} players max</p>
                      {t.settings?.registrationDeadline && (
                        <p>Deadline: {new Date(t.settings.registrationDeadline).toLocaleString()}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {isOpen ? (
                        <Link
                          href={`/t/${slug}/${t.id}/register`}
                          className="btn-primary flex-1 py-3 rounded-xl font-bold text-sm text-center"
                        >
                          Register — ${(t.settings?.ticketPriceForFundraiser ?? 0) + (t.settings?.systemTechFee ?? 5)}
                        </Link>
                      ) : (
                        <div className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-400 text-sm font-semibold text-center">
                          Registration Closed
                        </div>
                      )}
                      {(t.status === 'bracket_generated' || t.status === 'live_play' || t.status === 'completed') && (
                        <Link
                          href={`/t/${slug}/${t.id}`}
                          className="btn-secondary px-4 py-3 rounded-xl font-bold text-sm text-center"
                        >
                          Bracket
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Past tournaments */}
        {(pastTournaments ?? []).length > 0 && (
          <section>
            <h2 className="text-xl font-black text-slate-900 mb-4">Past Tournaments</h2>
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {(pastTournaments ?? []).map((t: Tournament) => (
                <Link
                  key={t.id}
                  href={`/t/${slug}/${t.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
                >
                  <span className="font-medium text-slate-700">{t.name}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
