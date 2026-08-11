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

  let body: { targetEmail: string; origin: string; landingPath: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { targetEmail, origin, landingPath } = body;
  if (!targetEmail) return NextResponse.json({ error: 'Missing targetEmail' }, { status: 400 });

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured on server' }, { status: 500 });
  }

  const admin = createServiceClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const base = process.env.NEXT_PUBLIC_SITE_URL || origin;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
    options: { redirectTo: `${base}/auth/set-session` },
  });

  if (linkError) {
    console.error('[impersonate] generateLink error:', linkError);
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  // Exchange token_hash server-side to get real session tokens, then hand them
  // to the client via /auth/set-session — avoids the race where the existing
  // super-admin session fires SIGNED_IN before the hash-based session is parsed.
  const actionLink = linkData?.properties?.action_link;
  if (!actionLink) {
    return NextResponse.json({ error: 'No action_link returned from Supabase' }, { status: 500 });
  }

  const tokenHash = new URL(actionLink).searchParams.get('token_hash');
  if (!tokenHash) {
    return NextResponse.json({ error: 'No token_hash in action_link' }, { status: 500 });
  }

  const { data: otpData, error: otpError } = await admin.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });

  if (otpError || !otpData.session) {
    console.error('[impersonate] verifyOtp error:', otpError);
    return NextResponse.json({ error: otpError?.message ?? 'Failed to exchange token' }, { status: 500 });
  }

  const { access_token, refresh_token } = otpData.session;
  const safeLandingPath = (landingPath && landingPath.startsWith('/')) ? landingPath : '/';
  const setSessionUrl = `${base}/auth/set-session?at=${encodeURIComponent(access_token)}&rt=${encodeURIComponent(refresh_token)}&next=${encodeURIComponent(safeLandingPath)}`;

  return NextResponse.json({ magicLink: setSessionUrl });
}
