'use client';

import { useState } from 'react';
import Link from 'next/link';
import BracketView from '@/components/BracketView';
import type { Match, Player } from '@/types';

interface MatchRow {
  id: string;
  tournament_id: string;
  round_index: number;
  match_index: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  status: string;
  court_number: number | null;
}

interface TournamentRow {
  id: string;
  name: string;
  tenant_id: string;
  settings: Record<string, unknown>;
  tenants: Record<string, unknown> | undefined;
}

export type { MatchRow, TournamentRow };

interface Props {
  matches: MatchRow[];
  tournaments: TournamentRow[];
  players: Record<string, Record<string, unknown>>;
  /** When provided, renders match cards as buttons instead of Links */
  onMatchClick?: (match: MatchRow) => void;
}

function toMatchType(m: MatchRow): Match {
  return {
    id: m.id,
    tournamentId: m.tournament_id,
    roundIndex: m.round_index,
    matchIndex: m.match_index,
    player1Id: m.player1_id as string | 'BYE' | null,
    player2Id: m.player2_id as string | 'BYE' | null,
    serverPlayerId: null,
    winnerId: m.winner_id,
    status: m.status as Match['status'],
    courtNumber: m.court_number ?? undefined,
  };
}

function toPlayerType(p: Record<string, unknown>): Player {
  return {
    id: p.id as string,
    tournamentId: (p.tournament_id ?? '') as string,
    fullName: (p.full_name ?? '') as string,
    email: (p.email ?? '') as string,
    seedRating: p.seed_rating as number | undefined,
    skillTier: p.skill_tier as string | undefined,
    gender: p.gender as string | undefined,
    ntrpRating: p.ntrp_rating as number | undefined,
    utrRating: p.utr_rating as number | undefined,
    age: p.age as number | undefined,
    status: (p.status ?? 'registered') as Player['status'],
  };
}

export default function RefereeQueueClient({ matches, tournaments, players, onMatchClick }: Props) {
  const [view, setView] = useState<'list' | 'bracket'>('list');

  const tournamentMap = Object.fromEntries(tournaments.map((t) => [t.id, t]));

  const activeMatches = matches.sort((a, b) => {
    const order = { playing: 0, court_assigned: 1, warmup: 2, scheduled: 3 };
    return (order[a.status as keyof typeof order] ?? 9) - (order[b.status as keyof typeof order] ?? 9);
  });

  const grouped = activeMatches.reduce<Record<string, MatchRow[]>>((acc, m) => {
    (acc[m.tournament_id] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="px-4 py-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black">Referee Console</h1>
            <p className="text-white/40 text-sm mt-1">
              {matches.length === 0
                ? 'No active matches'
                : `${matches.filter((m) => m.status === 'playing').length} live · ${matches.length} total queued`}
            </p>
          </div>
          {matches.length > 0 && (
            <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1">
              <button
                onClick={() => setView('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'list' ? 'bg-white text-slate-900' : 'text-white/50 hover:text-white'}`}
              >
                List
              </button>
              <button
                onClick={() => setView('bracket')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'bracket' ? 'bg-white text-slate-900' : 'text-white/50 hover:text-white'}`}
              >
                Bracket
              </button>
            </div>
          )}
        </div>

        {matches.length === 0 && (
          <div className="text-center py-16 text-white/30">
            <p className="text-4xl mb-3">🎾</p>
            <p className="font-medium text-white/50">No matches queued.</p>
            <p className="text-sm mt-1">Matches appear here once a tournament director starts live play.</p>
          </div>
        )}

        {view === 'list' && Object.entries(grouped).map(([tournamentId, tMatches]) => {
          const t = tournamentMap[tournamentId];
          const tenant = t?.tenants;
          const tenantColor = (tenant?.primary_color as string | undefined) ?? '#3b82f6';

          return (
            <div key={tournamentId} className="space-y-2">
              <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tenantColor }} />
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: tenantColor }}>
                    {tenant?.display_name as string ?? ''}
                  </p>
                  <p className="text-sm font-bold text-white/70">{t?.name}</p>
                </div>
              </div>

              {tMatches.map((m) => {
                const p1 = players[m.player1_id ?? ''];
                const p2 = players[m.player2_id ?? ''];
                const isLive = m.status === 'playing';

                const cardInner = (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-white/30">
                        R{m.round_index + 1} · M{m.match_index + 1}
                        {m.court_number ? ` · Court ${m.court_number}` : ''}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${isLive ? 'animate-pulse' : ''}`}
                        style={isLive
                          ? { backgroundColor: `${tenantColor}30`, color: tenantColor }
                          : m.status === 'warmup'
                          ? { backgroundColor: '#f59e0b22', color: '#f59e0b' }
                          : m.status === 'court_assigned'
                          ? { backgroundColor: '#3b82f622', color: '#3b82f6' }
                          : { backgroundColor: '#ffffff10', color: '#94a3b8' }
                        }
                      >
                        {isLive ? '● LIVE' : m.status === 'warmup' ? 'Warmup' : m.status === 'court_assigned' ? 'Court Assigned' : 'Scheduled'}
                      </span>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <PlayerBadge player={p1} tenantColor={tenantColor} />
                      <span className="text-white/20 font-bold text-sm">vs</span>
                      <PlayerBadge player={p2} tenantColor={tenantColor} align="right" />
                    </div>
                  </>
                );

                const cardClass = "block w-full text-left rounded-2xl p-4 transition-all active:scale-[0.98] bg-white/5 hover:bg-white/10 border";
                const cardStyle = {
                  borderColor: isLive ? tenantColor : 'transparent',
                  boxShadow: isLive ? `0 0 0 1px ${tenantColor}22` : undefined,
                };

                return onMatchClick ? (
                  <button key={m.id} onClick={() => onMatchClick(m)} className={cardClass} style={cardStyle}>
                    {cardInner}
                  </button>
                ) : (
                  <Link key={m.id} href={`/referee/${m.id}`} className={cardClass} style={cardStyle}>
                    {cardInner}
                  </Link>
                );
              })}
            </div>
          );
        })}

        {view === 'bracket' && Object.entries(grouped).map(([tournamentId, tMatches]) => {
          const t = tournamentMap[tournamentId];
          const tenant = t?.tenants;
          const tenantColor = (tenant?.primary_color as string | undefined) ?? '#3b82f6';
          const maxPlayers = (t?.settings?.maxPlayers as number | undefined) ?? 32;

          const allTournamentMatches = tMatches.map(toMatchType);
          const allPlayers = [...new Set(
            tMatches.flatMap((m) => [m.player1_id, m.player2_id]).filter(Boolean) as string[]
          )].map((id) => players[id]).filter(Boolean).map(toPlayerType);

          return (
            <div key={tournamentId} className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tenantColor }} />
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: tenantColor }}>
                    {tenant?.display_name as string ?? ''}
                  </p>
                  <p className="text-sm font-bold text-white/70">{t?.name}</p>
                </div>
              </div>
              <div className="bg-white rounded-2xl overflow-auto">
                <BracketView
                  initialMatches={allTournamentMatches}
                  players={allPlayers}
                  maxPlayers={maxPlayers}
                  tournamentId={tournamentId}
                  liveUpdates
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerBadge({
  player,
  tenantColor,
  align = 'left',
}: {
  player: Record<string, unknown> | undefined;
  tenantColor: string;
  align?: 'left' | 'right';
}) {
  if (!player) return <span className="text-white/30 text-sm">TBD</span>;

  const seed = player.seed_rating as number | null;
  const name = player.full_name as string;
  const ntrp = player.ntrp_rating as number | null;
  const utr = player.utr_rating as number | null;

  return (
    <div className={`space-y-0.5 ${align === 'right' ? 'text-right' : ''}`}>
      <p className="text-white font-bold text-sm leading-tight">
        {seed ? <span className="text-xs font-bold mr-1" style={{ color: tenantColor }}>[{seed}]</span> : null}
        {name}
      </p>
      <p className="text-xs text-white/30">
        {ntrp != null && <span className="mr-1.5">NTRP {ntrp}</span>}
        {utr != null && <span>UTR {utr}</span>}
      </p>
    </div>
  );
}
