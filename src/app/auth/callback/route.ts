import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const rawNext = searchParams.get('next') ?? '/';
  // Only allow relative paths — prevent open redirect to external URLs
  const next = rawNext.startsWith('/') ? rawNext : '/';

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  } else if (token_hash && type) {
    await supabase.auth.verifyOtp({ token_hash, type: type as 'magiclink' | 'email' });
  } else {
    // Implicit flow: tokens are in the URL hash, which server-side code can't read.
    // Hand off to the client-side /auth/confirm page which can read the hash.
    const confirmUrl = new URL(`${origin}/auth/confirm`);
    if (next !== '/') confirmUrl.searchParams.set('next', next);
    return NextResponse.redirect(confirmUrl.toString());
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single();
    const role = appUser?.role;
    const defaultPath =
      role === 'super_admin' ? '/admin' :
      role === 'tenant_admin' ? '/dashboard' :
      role === 'referee' ? '/referee' :
      '/';
    return NextResponse.redirect(`${origin}${next === '/' ? defaultPath : next}`);
  }

  return NextResponse.redirect(`${origin}/auth/login?error=link_expired`);
}
