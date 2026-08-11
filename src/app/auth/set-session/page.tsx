'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

function SetSessionInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const tokenHash = params.get('th');
    const rawNext = params.get('next') ?? '/';
    const next = rawNext.startsWith('/') ? rawNext : '/';

    if (!tokenHash) {
      router.replace('/auth/login?error=invalid_link');
      return;
    }

    const supabase = createClient();
    // Sign out any existing session first so there's no race with the new one
    supabase.auth.signOut().then(() =>
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
    ).then(({ error }) => {
      if (error) router.replace('/auth/login?error=link_expired');
      else router.replace(next);
    });
  }, [router, params]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-500">Signing you in…</p>
      </div>
    </div>
  );
}

export default function SetSessionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto" />
      </div>
    }>
      <SetSessionInner />
    </Suspense>
  );
}
