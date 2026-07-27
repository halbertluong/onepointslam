import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await admin.from('users').select('role').eq('id', user.id).single();
  if (caller?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let parsed: { email?: string };
  try { parsed = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { email } = parsed;
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 });

  const { data: target, error } = await admin
    .from('users')
    .update({ role: 'super_admin' })
    .eq('email', email)
    .select('id')
    .single();

  if (error || !target) {
    console.error('[promote] DB error:', error?.message);
    return NextResponse.json({ error: 'User not found or could not be promoted' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
