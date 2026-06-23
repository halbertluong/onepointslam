'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import SuddenSlamLogo from '@/components/SuddenSlamLogo';
import { useRouter } from 'next/navigation';

interface NavBarProps {
  role?: string;
  tenantSlug?: string;
  displayName?: string;
  logoUrl?: string;
}

export default function NavBar({ role, tenantSlug, displayName, logoUrl }: NavBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  }

  return (
    <nav
      className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur"
      style={{ borderBottomColor: 'var(--tenant-primary)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <Link href={tenantSlug ? `/t/${tenantSlug}` : '/'} className="flex items-center gap-2 shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt={displayName} className="h-7 w-auto object-contain" />
          ) : (
            <div className="flex items-center gap-2">
              <SuddenSlamLogo size={26} color="var(--tenant-primary)" />
              <span className="font-black text-lg tracking-tight" style={{ color: 'var(--tenant-primary)' }}>
                {displayName ?? 'SuddenSlam'}
              </span>
            </div>
          )}
        </Link>

        <div className="flex items-center gap-3">
          {role === 'super_admin' && (
            <Link href="/admin" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Super Admin
            </Link>
          )}
          {(role === 'tenant_admin' || role === 'super_admin') && (
            <Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Dashboard
            </Link>
          )}
          {(role === 'referee' || role === 'tenant_admin' || role === 'super_admin') && (
            <Link href="/referee" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Referee
            </Link>
          )}
          {role ? (
            <button
              onClick={handleSignOut}
              className="text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Sign out
            </button>
          ) : (
            <Link
              href="/auth/login"
              className="text-sm font-medium px-3 py-1.5 rounded-lg btn-primary"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
