'use client';

import Link from 'next/link';
import OnePointBowlLogo from '@/components/OnePointBowlLogo';

interface Tenant {
  display_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
}

interface Props {
  tenant: Tenant | null;
  userEmail: string;
  isSuperAdmin: boolean;
  tenantIds: string[];
  children: React.ReactNode;
}

export default function DashboardShell({ tenant, userEmail, isSuperAdmin, children }: Props) {
  const safeHex = (c: string | undefined | null) => /^#[0-9a-fA-F]{6}$/.test(c ?? '') ? c! : '#1d4ed8';
  const primary = safeHex(tenant?.primary_color);
  const secondary = safeHex(tenant?.secondary_color);

  return (
    <div className="min-h-screen bg-slate-50">
      {tenant && (
        <style>{`:root { --tenant-primary: ${primary}; --tenant-secondary: ${secondary}; }`}</style>
      )}

      <nav
        className="bg-white border-b h-14 flex items-center px-4 sm:px-6 lg:px-8 justify-between sticky top-0 z-40"
        style={{ borderBottomColor: primary }}
      >
        <div className="flex items-center gap-3 shrink-0">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.display_name} className="h-7 w-auto object-contain" />
          ) : (
            <OnePointBowlLogo size={28} color={primary} />
          )}
          <span className="font-black text-lg hidden sm:block" style={{ color: primary }}>
            {tenant?.display_name ?? 'Dashboard'}
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 text-sm shrink-0">
          <Link href="/dashboard" className="text-slate-600 hover:text-slate-900 font-medium hidden sm:block">
            Tournaments
          </Link>
          <Link href="/dashboard/settings" className="text-slate-600 hover:text-slate-900 font-medium hidden sm:block">
            Settings
          </Link>
          {isSuperAdmin && (
            <Link href="/admin" className="text-slate-600 hover:text-slate-900 font-medium hidden sm:block">
              Admin
            </Link>
          )}
          <span className="text-xs text-slate-400 border border-slate-200 rounded-full px-2.5 py-1 font-mono hidden lg:inline">
            {userEmail}
          </span>
        </div>
      </nav>

      <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
