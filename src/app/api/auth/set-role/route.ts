import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  let body: { userId?: string; role?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { userId, role } = body;

  if (!userId || !role) {
    return NextResponse.json({ error: 'userId and role are required' }, { status: 400 });
  }

  // Only 'player' is self-service; 'referee' and above require super_admin assignment
  const selfServiceRoles = ['player'];
  const adminOnlyRoles = ['referee', 'tenant_admin', 'super_admin'];
  if (![...selfServiceRoles, ...adminOnlyRoles].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Verify the caller is authenticated and is setting their own role
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch caller's current role once — used for multiple checks below
  const { data: callerRecord } = await adminClient.from('users').select('role').eq('id', user.id).single();
  const callerRole = callerRecord?.role;

  // Admin-only roles require super_admin
  if (adminOnlyRoles.includes(role)) {
    if (callerRole !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden — only super_admin can assign this role' }, { status: 403 });
    }
  } else if (user.id !== userId) {
    // Setting someone else's role also requires super_admin
    if (callerRole !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else {
    // Self-service path: block demotion from privileged roles
    if (callerRole && !selfServiceRoles.includes(callerRole)) {
      return NextResponse.json({ error: 'Cannot self-demote from a privileged role' }, { status: 403 });
    }
  }

  const { error } = await adminClient.from('users').upsert({ id: userId, role }, { onConflict: 'id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
