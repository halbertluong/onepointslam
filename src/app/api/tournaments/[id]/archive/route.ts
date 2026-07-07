import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: appUser } = await supabase
    .from('users').select('role, assigned_tenant_ids').eq('id', user.id).single();
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify the tournament belongs to this director's tenant
  const { data: tournament } = await supabase
    .from('tournaments').select('tenant_id, deleted_at').eq('id', id).single();
  if (!tournament) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tournament.deleted_at) return NextResponse.json({ error: 'Tournament is deleted' }, { status: 400 });

  const isSuperAdmin = appUser.role === 'super_admin';
  const isDirector = (appUser.assigned_tenant_ids ?? []).includes(tournament.tenant_id);
  if (!isSuperAdmin && !isDirector) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase
    .from('tournaments').update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
