'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import OnePointBowlLogo from '@/components/OnePointBowlLogo';
import RefereeView from './RefereeView';

type Mode = 'director' | 'referee';

const STORAGE_KEY = 'opb-dashboard-mode';

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

export default function DashboardShell({ tenant, userEmail, isSuperAdmin, tenantIds, children }: Props) {
  const [mode, setMode] = useState<Mode>('director');
  const [mounted, setMounted] = useState(false);

  // Scroll positions for each mode
  const directorScrollRef = useRef<number>(0);
  const refereeScrollRef = useRef<number>(0);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Mode | null;
    if (stored === 'director' || stored === 'referee') setMode(stored);
    setMounted(true);
  }, []);

  function switchMode(next: Mode) {
    // Save scroll position of current mode
    if (mode === 'director') directorScrollRef.current = window.scrollY;
    else refereeScrollRef.current = window.scrollY;

    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);

    // Restore scroll position for next mode after render
    const target = next === 'director' ? directorScrollRef.current : refereeScrollRef.current;
    requestAnimationFrame(() => window.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior }));
  }

  const primary = tenant?.primary_color ?? '#1d4ed8';

  return (
    <div className="min-h-screen bg-slate-50">
      {tenant && (
        <style>{`:root { --tenant-primary: ${primary}; --tenant-secondary: ${tenant.secondary_color}; }`}</style>
      )}

      <nav
        className="bg-white border-b h-14 flex items-center px-4 sm:px-6 justify-between sticky top-0 z-40"
        style={{ borderBottomColor: primary }}
      >
        {/* Logo */}
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

        {/* Mode toggle — centered */}
        {mounted && (
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => switchMode('director')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                mode === 'director'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>🏆</span>
              <span>Director</span>
            </button>
            <button
              onClick={() => switchMode('referee')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                mode === 'referee'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>🎾</span>
              <span>Referee</span>
            </button>
          </div>
        )}

        {/* Right nav — only in director mode */}
        <div className={`flex items-center gap-3 sm:gap-4 text-sm shrink-0 transition-opacity ${mode === 'referee' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
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

      {/* Director mode — always mounted, hidden when in referee mode */}
      <div style={{ display: mode === 'director' ? 'block' : 'none' }}>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{children}</main>
      </div>

      {/* Referee mode — always mounted after first render, hidden when in director mode */}
      {mounted && (
        <div style={{ display: mode === 'referee' ? 'block' : 'none' }}>
          <RefereeView tenantIds={tenantIds} />
        </div>
      )}
    </div>
  );
}
