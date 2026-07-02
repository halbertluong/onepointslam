import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RefereeQueueClient from './RefereeQueueClient';

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

  const matches = rawMatches ?? [];

  const playerIds = [...new Set(
    matches.flatMap((m) => [m.player1_id, m.player2_id]).filter(Boolean)
  )];

  const { data: players } = playerIds.length > 0
    ? await supabase
        .from('players')
        .select('id, full_name, ntrp_rating, utr_rating, seed_rating, gender, age, skill_tier, tournament_id, email, status')
        .in('id', playerIds)
    : { data: [] };

  const playerMap = Object.fromEntries((players ?? []).map((p) => [p.id, p as Record<string, unknown>]));
  const tournamentRows = (tournaments ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    tenant_id: t.tenant_id,
    settings: t.settings as Record<string, unknown>,
    tenants: t.tenants as unknown as Record<string, unknown> | undefined,
  }));

  return (
    <RefereeQueueClient
      matches={matches}
      tournaments={tournamentRows}
      players={playerMap}
    />
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
