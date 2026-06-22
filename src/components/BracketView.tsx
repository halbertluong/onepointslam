'use client';

import { useEffect, useState } from 'react';
import type { Match, Player } from '@/types';
import { getRoundName, getRoundsCount } from '@/lib/bracket';

interface BracketViewProps {
  initialMatches: Match[];
  players: Player[];
  maxPlayers: number;
  tournamentId?: string;
  liveUpdates?: boolean;
}

function getPlayer(id: string | null | 'BYE', players: Player[]): Player | null {
  if (!id || id === 'BYE') return null;
  return players.find((p) => p.id === id) ?? null;
}

function getPlayerName(id: string | null | 'BYE', players: Player[]): string {
  if (!id) return 'TBD';
  if (id === 'BYE') return 'BYE';
  return players.find((p) => p.id === id)?.fullName ?? 'TBD';
}

function PlayerSlot({ id, players, isWinner }: { id: string | null | 'BYE'; players: Player[]; isWinner: boolean }) {
  const name = getPlayerName(id, players);
  const p = id && id !== 'BYE' ? getPlayer(id, players) : null;
  return (
    <div className={`px-3 py-2 flex items-center justify-between gap-1 border-b border-slate-100 ${isWinner ? 'bg-emerald-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-medium truncate block ${isWinner ? 'text-emerald-700 font-bold' : 'text-slate-700'}`}>
          {p?.seedRating ? <span className="text-amber-500 font-bold mr-1 text-xs">[{p.seedRating}]</span> : null}
          {name}
        </span>
        {p && (p.ntrpRating != null || p.utrRating != null) && (
          <span className="text-xs text-slate-400">
            {p.ntrpRating != null ? `NTRP ${p.ntrpRating}` : ''}
            {p.ntrpRating != null && p.utrRating != null ? ' · ' : ''}
            {p.utrRating != null ? `UTR ${p.utrRating}` : ''}
          </span>
        )}
      </div>
      {isWinner && <span className="text-emerald-500 text-xs font-bold shrink-0">WIN</span>}
    </div>
  );
}

function MatchCard({ match, players }: { match: Match; players: Player[] }) {
  const isP1Winner = match.winnerId === match.player1Id;
  const isP2Winner = match.winnerId === match.player2Id;

  const statusClass =
    match.status === 'playing'
      ? 'playing'
      : match.status === 'finalized' || match.status === 'walkover'
      ? 'finalized'
      : '';

  return (
    <div className={`bracket-match ${statusClass} min-w-[180px] overflow-hidden`}>
      {match.status === 'playing' && (
        <div className="h-1 w-full" style={{ backgroundColor: 'var(--tenant-primary)' }} />
      )}
      <PlayerSlot id={match.player1Id} players={players} isWinner={isP1Winner} />
      <PlayerSlot id={match.player2Id} players={players} isWinner={isP2Winner} />
      {match.status === 'playing' && (
        <div className="px-3 py-1 bg-slate-50">
          <span
            className="text-xs font-semibold animate-pulse"
            style={{ color: 'var(--tenant-primary)' }}
          >
            ● LIVE
          </span>
        </div>
      )}
      {match.courtNumber && (
        <div className="px-3 pb-1">
          <span className="text-xs text-slate-400">Court {match.courtNumber}</span>
        </div>
      )}
    </div>
  );
}

export default function BracketView({
  initialMatches,
  players,
  maxPlayers,
  tournamentId,
  liveUpdates = false,
}: BracketViewProps) {
  const [matches, setMatches] = useState<Match[]>(initialMatches);

  useEffect(() => {
    if (!liveUpdates || !tournamentId) return;

    let sub: ReturnType<typeof setTimeout> | undefined;
    const setup = async () => {
      const { createClient } = await import('@/lib/supabase/browser');
      const supabase = createClient();
      const channel = supabase
        .channel(`bracket-${tournamentId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` },
          (payload) => {
            setMatches((prev) => {
              const updated = payload.new as Match;
              const existing = prev.findIndex((m) => m.id === updated.id);
              if (existing >= 0) {
                const next = [...prev];
                next[existing] = updated;
                return next;
              }
              return [...prev, updated];
            });
          },
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    };

    let cleanup: (() => void) | undefined;
    setup().then((fn) => { cleanup = fn; });
    return () => { cleanup?.(); clearTimeout(sub); };
  }, [liveUpdates, tournamentId]);

  const totalRounds = getRoundsCount(maxPlayers);
  const rounds = Array.from({ length: totalRounds }, (_, r) =>
    matches.filter((m) => m.roundIndex === r).sort((a, b) => a.matchIndex - b.matchIndex),
  );

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-8 min-w-max">
        {rounds.map((roundMatches, r) => (
          <div key={r} className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3 text-center">
              {getRoundName(r, totalRounds)}
            </h3>
            <div
              className="flex flex-col"
              style={{ gap: `${Math.pow(2, r + 1) * 8}px`, justifyContent: 'space-around' }}
            >
              {roundMatches.map((match) => (
                <MatchCard key={match.id} match={match} players={players} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
