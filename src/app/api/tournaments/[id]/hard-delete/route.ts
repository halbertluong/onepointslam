import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Super-admin only: permanently destroy a tournament and all its data
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: appUser } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (appUser?.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Must be soft-deleted first (require intentional two-step)
  const { data: tournament } = await supabase
    .from('tournaments').select('deleted_at').eq('id', id).single();
  if (!tournament) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!tournament.deleted_at) {
    return NextResponse.json({ error: 'Tournament must be in recycle bin before permanent deletion' }, { status: 400 });
  }

  // Delete children first (matches, players), then the tournament
  await supabase.from('matches').delete().eq('tournament_id', id);
  await supabase.from('players').delete().eq('tournament_id', id);
  const { error } = await supabase.from('tournaments').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
