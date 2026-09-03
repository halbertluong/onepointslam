import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { IMPERSONATOR_COOKIE } from '@/lib/impersonation';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (appUser?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Must be super_admin' }, { status: 403 });
  }

  // Capture the admin's own refresh token *before* the target user's session
  // overwrites the shared auth cookies, so "stop impersonating" has a session
  // to restore. verifyOtp() on /auth/set-session signs the admin out first,
  // which otherwise leaves no way back.
  const { data: { session: adminSession } } = await supabase.auth.getSession();
  if (!adminSession?.refresh_token) {
    return NextResponse.json({ error: 'No active session to preserve' }, { status: 500 });
  }

  let body: { targetEmail: string; origin: string; landingPath: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { targetEmail, origin, landingPath } = body;
  if (!targetEmail) return NextResponse.json({ error: 'Missing targetEmail' }, { status: 400 });

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });
  }

  const admin = createServiceClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const base = process.env.NEXT_PUBLIC_SITE_URL || origin;

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
    options: { redirectTo: `${base}/auth/set-session` },
  });

  if (error) {
    console.error('[impersonate] generateLink error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const actionLink = data?.properties?.action_link;
  if (!actionLink) {
    return NextResponse.json({ error: 'No action_link returned' }, { status: 500 });
  }

  // Use hashed_token from the response properties — the browser's anon-key
  // client uses it via verifyOtp(), which is a public endpoint.
  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) {
    return NextResponse.json({ error: 'No hashed_token in generateLink response' }, { status: 500 });
  }

  const safeLandingPath = landingPath?.startsWith('/') ? landingPath : '/';
  const setSessionUrl = `${base}/auth/set-session?th=${encodeURIComponent(tokenHash)}&next=${encodeURIComponent(safeLandingPath)}`;

  const cookieStore = await cookies();
  const payload = Buffer.from(
    JSON.stringify({ refresh_token: adminSession.refresh_token, email: user.email }),
  ).toString('base64url');
  cookieStore.set(IMPERSONATOR_COOKIE, payload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12, // 12 hours
  });

  return NextResponse.json({ url: setSessionUrl });
}
