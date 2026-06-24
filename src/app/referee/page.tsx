import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function RefereeQueuePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: appUser } = await supabase
    .from('users')
    .select('role, assigned_tenant_ids')
    .eq('id', user.id)
    .single();

  const tenantIds: string[] = appUser?.assigned_tenant_ids ?? [];
  const isSuperAdmin = appUser?.role === 'super_admin';

  const tournamentsQuery = supabase
    .from('tournaments')
    .select('id, name, tenant_id, settings, tenants(display_name, primary_color)')
    .in('status', ['live_play', 'bracket_generated']);

  if (!isSuperAdmin && tenantIds.length > 0) {
    tournamentsQuery.in('tenant_id', tenantIds);
  } else if (!isSuperAdmin) {
    return <EmptyQueue reason="Your account is not linked to a tenant yet. Contact your tournament director." />;
  }

  const { data: tournaments } = await tournamentsQuery;
  const tournamentIds = (tournaments ?? []).map((t) => t.id);

  if (tournamentIds.length === 0) {
    return <EmptyQueue reason="No live tournaments in your organization right now." />;
  }

  const { data: rawMatches } = await supabase
    .from('matches')
    .select('*')
    .in('tournament_id', tournamentIds)
    .in('status', ['scheduled', 'court_assigned', 'warmup', 'playing'])
    .is('winner_id', null)
    .not('player1_id', 'is', null)
    .not('player2_id', 'is', null)
    .neq('player1_id', 'BYE')
    .neq('player2_id', 'BYE')
    .order('match_index');

  const matches = (rawMatches ?? []).sort((a, b) => {
    const order = { playing: 0, court_assigned: 1, warmup: 2, scheduled: 3 };
    return (order[a.status as keyof typeof order] ?? 9) - (order[b.status as keyof typeof order] ?? 9);
  });

  const playerIds = [...new Set(
    matches.flatMap((m) => [m.player1_id, m.player2_id]).filter(Boolean)
  )];

  const { data: players } = playerIds.length > 0
    ? await supabase
        .from('players')
        .select('id, full_name, ntrp_rating, utr_rating, seed_rating, gender, age, skill_tier')
        .in('id', playerIds)
    : { data: [] };

  const playerMap = Object.fromEntries((players ?? []).map((p) => [p.id, p]));
  const tournamentMap = Object.fromEntries((tournaments ?? []).map((t) => [t.id, t]));

  const grouped = matches.reduce<Record<string, typeof matches>>((acc, m) => {
    (acc[m.tournament_id] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-black">Referee Console</h1>
          <p className="text-white/40 text-sm mt-1">
            {matches.length === 0
              ? 'No active matches'
              : `${matches.filter(m => m.status === 'playing').length} live · ${matches.length} total queued`}
          </p>
        </div>

        {matches.length === 0 && (
          <div className="text-center py-16 text-white/30">
            <p className="text-4xl mb-3">🎾</p>
            <p className="font-medium text-white/50">No matches queued.</p>
            <p className="text-sm mt-1">Matches appear here once a tournament director starts live play.</p>
          </div>
        )}

        {Object.entries(grouped).map(([tournamentId, tMatches]) => {
          const t = tournamentMap[tournamentId];
          const tenant = t?.tenants as Record<string, unknown> | undefined;
          const tenantColor = (tenant?.primary_color as string | undefined) ?? 'var(--tenant-primary)';

          return (
            <div key={tournamentId} className="space-y-2">
              {/* Tournament header with tenant color accent */}
              <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tenantColor }} />
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: tenantColor }}>
                    {tenant?.display_name as string ?? ''}
                  </p>
                  <p className="text-sm font-bold text-white/70">{t?.name}</p>
                </div>
              </div>

              {tMatches.map((m) => {
                const p1 = playerMap[m.player1_id];
                const p2 = playerMap[m.player2_id];
                const isLive = m.status === 'playing';

                return (
                  <Link
                    key={m.id}
                    href={`/referee/${m.id}`}
                    className="block rounded-2xl p-4 transition-all active:scale-[0.98] bg-white/5 hover:bg-white/10 border"
                    style={{
                      borderColor: isLive ? tenantColor : 'transparent',
                      boxShadow: isLive ? `0 0 0 1px ${tenantColor}22` : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-white/30">
                        R{m.round_index + 1} · M{m.match_index + 1}
                        {m.court_number ? ` · Court ${m.court_number}` : ''}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${isLive ? 'animate-pulse' : ''}`}
                        style={isLive
                          ? { backgroundColor: `${tenantColor}30`, color: tenantColor }
                          : m.status === 'warmup'
                          ? { backgroundColor: '#f59e0b22', color: '#f59e0b' }
                          : m.status === 'court_assigned'
                          ? { backgroundColor: '#3b82f622', color: '#3b82f6' }
                          : { backgroundColor: '#ffffff10', color: '#94a3b8' }
                        }
                      >
                        {isLive ? '● LIVE' : m.status === 'warmup' ? 'Warmup' : m.status === 'court_assigned' ? 'Court Assigned' : 'Scheduled'}
                      </span>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <PlayerBadge player={p1} />
                      <span className="text-white/20 font-bold text-sm">vs</span>
                      <PlayerBadge player={p2} align="right" />
                    </div>
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

function PlayerBadge({
  player,
  align = 'left',
}: {
  player: Record<string, unknown> | undefined;
  align?: 'left' | 'right';
}) {
  if (!player) return <span className="text-white/30 text-sm">TBD</span>;

  const seed = player.seed_rating as number | null;
  const name = player.full_name as string;
  const ntrp = player.ntrp_rating as number | null;
  const utr = player.utr_rating as number | null;

  return (
    <div className={`space-y-0.5 ${align === 'right' ? 'text-right' : ''}`}>
      <p className="text-white font-bold text-sm leading-tight">
        {seed ? <span className="text-xs font-bold mr-1" style={{ color: 'var(--tenant-primary)' }}>[{seed}]</span> : null}
        {name}
      </p>
      <p className="text-xs text-white/30">
        {ntrp != null && <span className="mr-1.5">NTRP {ntrp}</span>}
        {utr != null && <span>UTR {utr}</span>}
      </p>
    </div>
  );
}

function EmptyQueue({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        <p className="text-4xl">🎾</p>
        <p className="font-bold text-white/60">No matches available</p>
        <p className="text-sm text-white/30 max-w-xs">{reason}</p>
      </div>
    </div>
  );
}
