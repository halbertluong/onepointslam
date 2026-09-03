import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { verifyDirector } from '@/lib/registrationAccess';

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * pending_registrations carries the personal details of people who haven't
 * completed registration yet, so unlike `players` (public-read, for the
 * spectator bracket page) it has no read policy at all — every access is
 * director-authorized through here.
 */
async function authorize(tournamentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: tournament } = await supabase
    .from('tournaments').select('tenant_id').eq('id', tournamentId).single();
  if (!tournament) return { error: 'Tournament not found', status: 404 as const };
  const check = await verifyDirector(supabase, user?.id, tournament.tenant_id);
  if (!check.ok) return { error: check.error, status: check.status };
  return { ok: true as const };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params;
  const auth = await authorize(tournamentId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await admin()
    .from('pending_registrations')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ pendingRegistrations: data ?? [] });
}

/** Director dismisses a stale, clearly-abandoned attempt from the list. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params;
  const auth = await authorize(tournamentId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const pendingId = req.nextUrl.searchParams.get('pendingId');
  if (!pendingId) return NextResponse.json({ error: 'pendingId is required' }, { status: 400 });

  const { error } = await admin()
    .from('pending_registrations')
    .delete()
    .eq('id', pendingId)
    .eq('tournament_id', tournamentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
