'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

// Handles implicit-flow magic links where Supabase puts tokens in the URL hash.
// The browser Supabase client auto-detects the hash and establishes the session;
// we listen for the SIGNED_IN event then redirect to the intended landing path.
export default function ConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const supabase = createClient();
    let settled = false;

    async function redirectForSession(session: { user: { id: string } }) {
      if (settled) return;
      settled = true;

      const { data: appUser } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();

      const next = searchParams.get('next');
      const defaultPath =
        appUser?.role === 'super_admin' ? '/admin' :
        appUser?.role === 'referee' ? '/referee' :
        '/dashboard';

      router.replace(next ?? defaultPath);
    }

    // Listen for the Supabase client to parse the hash and sign in
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          await redirectForSession(session);
        }
      }
    );

    // Fallback: if the event never fires within 5s, check for an existing session
    // (covers the case where the client already parsed the hash before we subscribed)
    const fallbackTimer = setTimeout(async () => {
      if (settled) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await redirectForSession(session);
      } else {
        settled = true;
        router.replace('/auth/login?error=link_expired');
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-500">Signing you in…</p>
      </div>
    </div>
  );
}
