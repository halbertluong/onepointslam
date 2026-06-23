import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  // Verify caller is super_admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (appUser?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Must be super_admin' }, { status: 403 });
  }

  const body = await req.json();
  const { targetEmail, origin, landingPath } = body as { targetEmail: string; origin: string; landingPath: string };
  if (!targetEmail) return NextResponse.json({ error: 'Missing targetEmail' }, { status: 400 });

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured on server' }, { status: 500 });
  }

  // Use service role key to generate a magic link
  const admin = createServiceClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const base = origin ?? 'https://onepointslam.vercel.app';
  const redirectTo = `${base}/auth/callback?next=${encodeURIComponent(landingPath ?? '/')}`;

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
    options: { redirectTo },
  });

  if (error) {
    console.error('[impersonate] generateLink error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const link = data?.properties?.action_link;
  if (!link) {
    console.error('[impersonate] No action_link in response:', JSON.stringify(data));
    return NextResponse.json({ error: 'No magic link returned from Supabase' }, { status: 500 });
  }

  return NextResponse.json({ magicLink: link });
}
