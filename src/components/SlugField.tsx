'use client';

import { useSyncExternalStore } from 'react';
import { slugifyWhileTyping } from '@/lib/slugs';

/** The host never changes while the page is open, so nothing to subscribe to. */
const noSubscribe = () => () => {};

/**
 * The editable segment of a public URL, shown in place inside the whole link so
 * the admin can see exactly what they are handing out.
 *
 * Input is normalised as it is typed — uppercase becomes lowercase, spaces
 * become dashes — because the value has to survive a database constraint that
 * only accepts the canonical form. A trailing dash is left alone mid-typing so
 * "fall-" followed by "2026" doesn't fight the cursor.
 */
export default function SlugField({
  label,
  prefix,
  suffix = '',
  value,
  onChange,
  placeholder,
  error,
  hint,
  disabled,
  action,
}: {
  label: string;
  /** Path shown before the editable segment, e.g. "/t/portland-tennis/". */
  prefix: string;
  /** Path shown after it, e.g. "/register". */
  suffix?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: React.ReactNode;
  disabled?: boolean;
  /** Optional trailing control, e.g. a "Use tournament name" button. */
  action?: React.ReactNode;
}) {
  // Client-only: the server render has no window.location, and a host baked
  // into the server HTML would not match the client's first paint. The server
  // snapshot is empty, so the prefix fills in once hydrated.
  const host = useSyncExternalStore(noSubscribe, () => window.location.host, () => '');

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      <div
        className={`flex items-stretch border rounded-xl overflow-hidden ${
          error ? 'border-red-300' : 'border-slate-200'
        }`}
      >
        <span className="px-3 py-2.5 bg-slate-50 text-slate-400 text-sm border-r border-slate-200 shrink-0 font-mono truncate max-w-[45%]">
          {host}{prefix}
        </span>
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(slugifyWhileTyping(e.target.value))}
          className="flex-1 min-w-0 px-3 py-2.5 text-sm font-mono focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
        {suffix && (
          <span className="px-3 py-2.5 bg-slate-50 text-slate-400 text-sm border-l border-slate-200 shrink-0 font-mono">
            {suffix}
          </span>
        )}
        {action}
      </div>
      {error ? (
        <p className="text-xs text-red-600 mt-1.5">{error}</p>
      ) : hint ? (
        <div className="text-xs text-slate-400 mt-1.5">{hint}</div>
      ) : null}
    </div>
  );
}
