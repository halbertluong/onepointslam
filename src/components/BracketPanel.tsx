'use client';

import { useState } from 'react';
import BracketView from './BracketView';
import type { Match, Player } from '@/types';

interface Props {
  matches: Match[];
  players: Player[];
  maxPlayers: number;
  tournamentId?: string;
  liveUpdates?: boolean;
  title?: string;
  emptyMessage?: string;
  /** When provided, a director can toggle edit mode and click a player to set/override the match winner. */
  onSetWinner?: (match: Match, winnerId: string) => void | Promise<void>;
}

/**
 * Shared bracket display + inline winner-editing UI. Used by both the real
 * dashboard (Bracket tab) and the /demo sandbox's Director view, so the
 * edit-toggle behavior only has to be built and maintained once.
 */
export default function BracketPanel({
  matches,
  players,
  maxPlayers,
  tournamentId,
  liveUpdates = false,
  title = 'Bracket',
  emptyMessage = 'No bracket yet.',
  onSetWinner,
}: Props) {
  const [editing, setEditing] = useState(false);

  if (matches.length === 0) {
    return <p className="text-slate-400 text-center py-8">{emptyMessage}</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
        {onSetWinner && (
          <div className="flex items-center gap-2">
            {editing && (
              <span className="text-xs text-blue-600 font-semibold hidden sm:inline">
                ✏️ Click a player to set the winner
              </span>
            )}
            <button
              onClick={() => setEditing((e) => !e)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                editing
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {editing ? '✓ Done Editing' : '✏️ Edit Bracket'}
            </button>
          </div>
        )}
      </div>
      <BracketView
        initialMatches={matches}
        players={players}
        maxPlayers={maxPlayers}
        tournamentId={tournamentId}
        liveUpdates={liveUpdates}
        editable={editing}
        onSetWinner={onSetWinner}
      />
    </div>
  );
}
