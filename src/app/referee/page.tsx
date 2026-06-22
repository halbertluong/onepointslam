import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function RefereeQueuePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: rawMatches } = await supabase
    .from('matches')
    .select('*, tournaments(name, tenant_id, settings, tenants(display_name, primary_color))')
    .in('status', ['scheduled', 'court_assigned', 'warmup', 'playing'])
    .is('winner_id', null)
    .not('player1_id', 'is', null)
    .not('player2_id', 'is', null)
    .neq('player1_id', 'BYE')
    .neq('player2_id', 'BYE')
    .order('created_at')
    .limit(50);

  const matches = rawMatches ?? [];

  // Collect all player IDs
  const playerIds = [...new Set(
    matches.flatMap((m) => [m.player1_id, m.player2_id]).filter(Boolean)
  )];

  const { data: players } = playerIds.length > 0
    ? await supabase.from('players').select('id, full_name, ntrp_rating, seed_rating').in('id', playerIds)
    : { data: [] };

  const playerMap = Object.fromEntries((players ?? []).map((p) => [p.id, p]));

  const grouped = matches.reduce<Record<string, typeof matches>>((acc, m) => {
    const t = m.tournaments as Record<string, unknown>;
    const key = t?.name as string ?? 'Unknown';
    (acc[key] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-black">Referee Console</h1>
          <p className="text-slate-400 text-sm mt-1">Select a match to start scoring</p>
        </div>

        {matches.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <p className="text-4xl mb-3">🎾</p>
            <p className="font-medium">No matches queued.</p>
            <p className="text-sm mt-1">Matches appear here once a tournament is Live.</p>
          </div>
        )}

        {Object.entries(grouped).map(([tournamentName, tMatches]) => {
          const t = tMatches[0].tournaments as Record<string, unknown>;
          const tenant = t?.tenants as Record<string, unknown> | undefined;
          const tenantName = tenant?.display_name as string | undefined;
          return (
            <div key={tournamentName} className="space-y-2">
              <div className="px-1">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{tenantName}</p>
                <p className="text-sm font-bold text-slate-300">{tournamentName}</p>
              </div>
              {tMatches.map((m) => {
                const p1 = playerMap[m.player1_id];
                const p2 = playerMap[m.player2_id];
                const isLive = m.status === 'playing';
                return (
                  <Link
                    key={m.id}
                    href={`/referee/${m.id}`}
                    className={`block rounded-2xl p-5 transition-colors ${
                      isLive
                        ? 'bg-red-900/40 border border-red-500/30 hover:bg-red-900/60'
                        : 'bg-slate-800 hover:bg-slate-700 active:bg-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-500">
                        R{m.round_index + 1} · Match {m.match_index + 1}
                        {m.court_number ? ` · Court ${m.court_number}` : ''}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        isLive ? 'bg-red-500/30 text-red-400 animate-pulse' :
                        m.status === 'warmup' ? 'bg-yellow-500/20 text-yellow-400' :
                        m.status === 'court_assigned' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {isLive ? '● LIVE' : m.status === 'warmup' ? 'Warmup' : m.status === 'court_assigned' ? 'Court Assigned' : 'Scheduled'}
                      </span>
                    </div>
                    <p className="text-white font-bold text-lg leading-snug">
                      {p1 ? (
                        <>
                          {p1.seed_rating ? <span className="text-amber-400 text-sm font-bold">[{p1.seed_rating}] </span> : null}
                          {p1.full_name}
                          {p1.ntrp_rating ? <span className="text-slate-400 text-sm font-normal"> ({p1.ntrp_rating})</span> : null}
                        </>
                      ) : 'TBD'}
                      <span className="text-slate-500 mx-2">vs</span>
                      {p2 ? (
                        <>
                          {p2.seed_rating ? <span className="text-amber-400 text-sm font-bold">[{p2.seed_rating}] </span> : null}
                          {p2.full_name}
                          {p2.ntrp_rating ? <span className="text-slate-400 text-sm font-normal"> ({p2.ntrp_rating})</span> : null}
                        </>
                      ) : 'TBD'}
                    </p>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
