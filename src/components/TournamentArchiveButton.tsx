'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  tournamentId: string;
  isArchived: boolean;
  /** Compact icon-only variant for table rows */
  compact?: boolean;
  /** Called after a successful toggle, for callers that manage their own data (e.g. client-fetched tables) instead of relying on router.refresh() */
  onToggled?: () => void;
}

export default function TournamentArchiveButton({ tournamentId, isArchived, compact = false, onToggled }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const endpoint = isArchived ? 'unarchive' : 'archive';
    await fetch(`/api/tournaments/${tournamentId}/${endpoint}`, { method: 'POST' });
    if (onToggled) onToggled(); else router.refresh();
    setLoading(false);
  }

  if (compact) {
    return (
      <button
        onClick={toggle}
        disabled={loading}
        title={isArchived ? 'Unarchive' : 'Archive'}
        className="text-slate-400 hover:text-slate-700 disabled:opacity-40 transition-colors text-sm"
      >
        {loading ? '…' : isArchived ? '↩' : '📦'}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors disabled:opacity-50 ${
        isArchived
          ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
      }`}
    >
      {loading ? '…' : isArchived ? '↩ Unarchive' : '📦 Archive'}
    </button>
  );
}
