'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

// Handles implicit-flow magic links where Supabase puts tokens in the URL hash.
// The browser Supabase client auto-detects the hash and establishes the session;
// we just wait for it then redirect to the intended landing path.
export default function ConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const supabase = createClient();

    async function handleSession() {
      // Give the client a moment to parse the hash and set the session
      await new Promise((r) => setTimeout(r, 500));
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.replace('/auth/login?error=link_expired');
        return;
      }

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

    handleSession();
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
