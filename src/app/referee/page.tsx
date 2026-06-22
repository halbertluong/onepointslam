import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Match } from '@/types';

export default async function RefereeQueuePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: matches } = await supabase
    .from('matches')
    .select('*, tournaments(name, tenant_id, settings, tenants(display_name))')
    .in('status', ['scheduled', 'court_assigned', 'warmup'])
    .is('winner_id', null)
    .not('player1_id', 'is', null)
    .not('player2_id', 'is', null)
    .neq('player1_id', 'BYE')
    .neq('player2_id', 'BYE')
    .order('created_at')
    .limit(50);

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-black">Referee Console</h1>
          <p className="text-slate-400 text-sm mt-1">Select a match to start scoring</p>
        </div>

        {(matches ?? []).length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <p className="text-4xl mb-3">🎾</p>
            <p className="font-medium">No matches queued.</p>
            <p className="text-sm mt-1">Matches appear here when the bracket is live.</p>
          </div>
        )}

        <div className="space-y-3">
          {(matches ?? []).map((m: Match & { tournaments?: Record<string, unknown> }) => {
            const tournament = m.tournaments as Record<string, unknown> | undefined;
            const tenantName = (tournament?.tenants as Record<string, unknown> | undefined)?.display_name as string | undefined;
            return (
              <Link
                key={m.id}
                href={`/referee/${m.id}`}
                className="block bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-2xl p-5 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                    {tenantName ?? 'Tournament'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    m.status === 'warmup' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-700 text-slate-400'
                  }`}>
                    {m.status === 'warmup' ? 'Warmup' : m.status === 'court_assigned' ? 'Court Assigned' : 'Scheduled'}
                  </span>
                </div>
                <p className="text-white font-bold text-lg leading-snug">
                  {m.player1Id} vs {m.player2Id}
                </p>
                {m.courtNumber && (
                  <p className="text-slate-400 text-sm mt-1">Court {m.courtNumber}</p>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
