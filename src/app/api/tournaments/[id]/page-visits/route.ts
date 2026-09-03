import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { verifyDirector } from '@/lib/registrationAccess';
import { summarizeVisits, type PageVisitRow } from '@/lib/pageVisitStats';

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: tournament } = await supabase
    .from('tournaments').select('tenant_id').eq('id', tournamentId).single();
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

  const check = await verifyDirector(supabase, user?.id, tournament.tenant_id);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const { data, error } = await admin()
    .from('registration_page_visits')
    .select('created_at, referrer, ip_address, country, region, city, user_agent')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(summarizeVisits((data ?? []) as PageVisitRow[]));
}
