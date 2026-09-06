'use client';

import { useState } from 'react';
import Link from 'next/link';
import OnePointBowlLogo from '@/components/OnePointBowlLogo';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/tournaments', label: 'Tournaments' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/admins', label: 'Admins' },
  { href: '/admin/waitlist', label: 'Waitlist' },
];

export default function AdminNav({ email }: { email: string }) {
  const [open, setOpen] = useState(false);

  return (
    <nav className="bg-slate-900 text-white sticky top-0 z-50">
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <OnePointBowlLogo size={24} color="#60a5fa" />
            <span className="font-black tracking-tight text-sm text-blue-400">One Point Bowl</span>
            <span className="text-slate-500 font-normal text-sm hidden sm:inline">Super Admin</span>
          </div>
          <div className="hidden sm:flex gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500 font-mono hidden sm:block">{email}</span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle navigation menu"
            className="sm:hidden p-2 -mr-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            {open ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {open && (
        <div className="sm:hidden border-t border-slate-800 px-4 py-2 flex flex-col">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              {item.label}
            </Link>
          ))}
          <span className="px-3 py-2 text-xs text-slate-500 font-mono">{email}</span>
        </div>
      )}
    </nav>
  );
}
