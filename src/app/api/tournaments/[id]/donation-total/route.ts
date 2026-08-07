import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params;

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await admin
    .from('donations')
    .select('amount')
    .eq('tournament_id', tournamentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total = (data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  return NextResponse.json({ total });
}
