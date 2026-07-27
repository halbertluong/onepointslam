import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, status, settings, tenant_id')
    .eq('id', tournamentId)
    .maybeSingle();

  if (!tournament || tournament.status !== 'registration_open') {
    return NextResponse.json({ closed: false });
  }

  // Verify caller is a director for this tournament's tenant or a super_admin
  const { data: callerUser } = await admin.from('users').select('role, assigned_tenant_ids').eq('id', user.id).single();
  const isSuperAdmin = callerUser?.role === 'super_admin';
  const isDirector = callerUser?.role === 'tenant_admin' && (callerUser.assigned_tenant_ids ?? []).includes(tournament.tenant_id);
  if (!isSuperAdmin && !isDirector) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cap = (tournament.settings as Record<string, unknown>)?.maxPlayers as number | undefined;
  if (!cap) return NextResponse.json({ closed: false });

  const { count } = await admin
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if ((count ?? 0) >= cap) {
    await admin
      .from('tournaments')
      .update({ status: 'registration_closed', registration_close_reason: 'cap_reached' })
      .eq('id', tournamentId);
    return NextResponse.json({ closed: true });
  }

  return NextResponse.json({ closed: false });
}
