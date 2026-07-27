import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, status, settings')
    .eq('id', tournamentId)
    .maybeSingle();

  if (!tournament || tournament.status !== 'registration_open') {
    return NextResponse.json({ closed: false });
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
