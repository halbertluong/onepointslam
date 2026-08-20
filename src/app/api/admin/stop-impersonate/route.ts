import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { IMPERSONATOR_COOKIE, decodeImpersonatorCookie } from '@/lib/impersonation';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const stored = decodeImpersonatorCookie(cookieStore.get(IMPERSONATOR_COOKIE)?.value);
  cookieStore.delete(IMPERSONATOR_COOKIE);

  const origin = req.nextUrl.origin;

  if (!stored) {
    return NextResponse.redirect(new URL('/auth/login', origin));
  }

  const supabase = await createClient();
  await supabase.auth.signOut();

  const { error } = await supabase.auth.refreshSession({ refresh_token: stored.refresh_token });
  if (error) {
    return NextResponse.redirect(new URL('/auth/login?error=impersonation_expired', origin));
  }

  return NextResponse.redirect(new URL('/admin/users', origin));
}
