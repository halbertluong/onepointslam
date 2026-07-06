'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

const SPORTS = [
  { href: '/', emoji: '🎾', label: 'Tennis' },
  { href: '/basketball', emoji: '🏀', label: 'Basketball' },
  { href: '/soccer', emoji: '⚽', label: 'Soccer' },
];

export default function SportsDropdown({
  current,
  color = '#3b82f6',
}: {
  current: 'tennis' | 'basketball' | 'soccer';
  color?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const others = SPORTS.filter((s) => s.href !== (current === 'tennis' ? '/' : `/${current}`));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
      >
        Other Sports
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-2xl border border-slate-200 shadow-lg py-1.5 z-50">
          {others.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span>{s.emoji}</span>
              <span>{s.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function SportsDropdownMobile({
  current,
  onNavigate,
}: {
  current: 'tennis' | 'basketball' | 'soccer';
  onNavigate: () => void;
}) {
  const others = SPORTS.filter((s) => s.href !== (current === 'tennis' ? '/' : `/${current}`));

  return (
    <div className="border-t border-slate-100 pt-2 mt-1">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400 px-1 pb-1">Other Sports</p>
      {others.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          onClick={onNavigate}
          className="flex items-center gap-2 py-1.5 text-slate-600 hover:text-slate-900"
        >
          <span>{s.emoji}</span>
          <span>{s.label}</span>
        </Link>
      ))}
    </div>
  );
}
