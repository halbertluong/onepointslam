import { cookies } from 'next/headers';
import { IMPERSONATOR_COOKIE, decodeImpersonatorCookie } from '@/lib/impersonation';

export async function ImpersonationBanner() {
  const cookieStore = await cookies();
  const stored = decodeImpersonatorCookie(cookieStore.get(IMPERSONATOR_COOKIE)?.value);
  if (!stored) return null;

  return (
    <div className="sticky top-0 z-[100] flex flex-wrap items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950">
      <span>Impersonating this user — signed in as {stored.email ?? 'admin'}</span>
      <form action="/api/admin/stop-impersonate" method="POST">
        <button
          type="submit"
          className="rounded bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-900"
        >
          Stop impersonating
        </button>
      </form>
    </div>
  );
}
