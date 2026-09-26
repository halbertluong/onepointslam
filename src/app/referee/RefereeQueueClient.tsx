'use client';

import { useState } from 'react';
import Link from 'next/link';
import BracketPanel from '@/components/BracketPanel';
import { CoinTossIcon } from '@/components/icons/CoinTossIcon';
import type { Match, Player } from '@/types';
import { mapMatch } from '@/types';
import { getLosersRoundsCount, getConsolationRoundsCount, getRoundsCount, actualRoundsCount, queueRoundPriority } from '@/lib/bracket';
import { MATCH_STATUS_LABEL, MATCH_STATUS_ORDER } from '@/lib/matchStatus';
import { createClient } from '@/lib/supabase/browser';

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
  bracket: string;
  server_player_id: string | null;
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
  /** All matches for the tournament (including finalized) — used for full bracket view */
  allMatches?: MatchRow[];
  tournaments: TournamentRow[];
  players: Record<string, Record<string, unknown>>;
  /** When provided, renders match cards as buttons instead of Links */
  onMatchClick?: (match: MatchRow) => void;
}

function toPlayerType(p: Record<string, unknown>): Player {
  return {
    id: p.id as string,
    tournamentId: (p.tournament_id ?? '') as string,
    fullName: (p.full_name ?? '') as string,
    email: (p.email ?? '') as string,
    seedRating: p.seed_rating as number | undefined,
    gender: p.gender as string | undefined,
    ntrpRating: p.ntrp_rating as number | undefined,
    utrRating: p.utr_rating as number | undefined,
    age: p.age as number | undefined,
    status: (p.status ?? 'registered') as Player['status'],
  };
}

export default function RefereeQueueClient({ matches: initialMatches, allMatches, tournaments, players, onMatchClick }: Props) {
  const [view, setView] = useState<'list' | 'bracket'>('list');
  // Local copy so a court reassignment updates the list immediately instead
  // of waiting on a full page reload — this page is a one-time server fetch
  // with no realtime subscription.
  const [matches, setMatches] = useState(initialMatches);

  const tournamentMap = Object.fromEntries(tournaments.map((t) => [t.id, t]));

  // Status first — a match already on a court (or warming up) belongs at the
  // top of the queue regardless of round, matching the order the TV
  // scoreboard's On Court / Up Next lists already call matches in. Without
  // this, a referee could see an earlier, still-unassigned round-3 match
  // listed above the round-3 match a director already sent to Court 1.
  const activeMatches = [...matches].sort((a, b) =>
    (MATCH_STATUS_ORDER[a.status] ?? 9) - (MATCH_STATUS_ORDER[b.status] ?? 9)
    || (a.court_number ?? 99) - (b.court_number ?? 99)
    || queueRoundPriority(a.bracket as Match['bracket'], a.round_index) - queueRoundPriority(b.bracket as Match['bracket'], b.round_index)
    || a.match_index - b.match_index
  );

  // A court change is purely a physical reassignment — it never implies
  // progress the match hasn't actually made. Only a still-'scheduled' match
  // picks up 'court_assigned' when given a court (the same transition
  // releaseCourtToNextMatch makes); only a 'court_assigned' match reverts to
  // 'scheduled' when its court is cleared. A match already warming up or
  // playing keeps that status either way — moving it to a different court
  // (or briefly clearing its board) doesn't undo the coin toss or the score
  // already in progress.
  function nextStatusForCourtChange(current: string, newCourt: number | null): string {
    if (newCourt == null) return current === 'court_assigned' ? 'scheduled' : current;
    return current === 'scheduled' ? 'court_assigned' : current;
  }

  async function reassignCourt(matchId: string, newCourt: number | null) {
    const prev = matches;
    setMatches((cur) => cur.map((m) =>
      m.id === matchId ? { ...m, court_number: newCourt, status: nextStatusForCourtChange(m.status, newCourt) } : m,
    ));
    const target = prev.find((m) => m.id === matchId);
    if (!target) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('matches')
      .update({ court_number: newCourt, status: nextStatusForCourtChange(target.status, newCourt) })
      .eq('id', matchId);
    // Best-effort like the auto hand-off in releaseCourtToNextMatch — revert
    // the optimistic update rather than leave the UI showing a court that
    // was never actually saved.
    if (error) {
      console.error('reassignCourt: failed to save', error);
      setMatches(prev);
    }
  }

  const grouped = activeMatches.reduce<Record<string, MatchRow[]>>((acc, m) => {
    (acc[m.tournament_id] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="px-4 py-6 space-y-6" style={{ maxWidth: view === 'bracket' ? 'none' : '64rem', margin: '0 auto' }}>
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
          const logoUrl = tenant?.logo_url as string | undefined;
          // The configured court count is the normal ceiling, but a match
          // already sitting on a higher-numbered court (assigned before the
          // setting was lowered, say) still needs to appear as an option —
          // otherwise reassigning it away and back would be the only way to
          // see its own current court in the list.
          const configuredCourts = (t?.settings?.numberOfCourts as number | undefined) ?? 0;
          const maxCourts = Math.max(configuredCourts, ...tMatches.map((m) => m.court_number ?? 0), 4);

          return (
            <div key={tournamentId} className="space-y-2">
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                {logoUrl && (
                  <img src={logoUrl} alt="logo" className="h-8 w-8 object-contain rounded-lg bg-white/10 p-0.5 shrink-0" />
                )}
                {!logoUrl && (
                  <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center" style={{ backgroundColor: `${tenantColor}30` }}>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tenantColor }} />
                  </div>
                )}
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

                const matchupLink = (
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <PlayerBadge player={p1} tenantColor={tenantColor} />
                    <span className="text-white/20 font-bold text-sm">vs</span>
                    <PlayerBadge player={p2} tenantColor={tenantColor} align="right" />
                  </div>
                );

                const cardClass = "block w-full text-left transition-all active:scale-[0.98] hover:opacity-90";

                return (
                  <div
                    key={m.id}
                    className="rounded-2xl p-4 transition-all bg-white/5 hover:bg-white/10 border"
                    style={{
                      borderColor: isLive ? tenantColor : 'transparent',
                      boxShadow: isLive ? `0 0 0 1px ${tenantColor}22` : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/30">R{m.round_index + 1} · M{m.match_index + 1}</span>
                        {/* Not wrapped in the matchup link/button below — it's its
                            own control, not a navigation target, and a <select>
                            nested inside a <Link>/<button> would be invalid HTML. */}
                        <select
                          value={m.court_number ?? ''}
                          onChange={(e) => reassignCourt(m.id, e.target.value ? Number(e.target.value) : null)}
                          onClick={(e) => e.stopPropagation()}
                          title="Reassign this match's court"
                          className={`rounded text-xs font-bold border-0 focus:outline-none focus:ring-1 focus:ring-white/40 cursor-pointer ${
                            m.court_number ? 'bg-white/10 text-white/60' : 'bg-white/5 text-white/25 italic'
                          }`}
                        >
                          <option value="">Unassigned</option>
                          {Array.from({ length: maxCourts }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>Court {n}</option>
                          ))}
                        </select>
                        {m.server_player_id && m.status !== 'playing' && (
                          <span
                            className="px-1.5 py-0.5 rounded text-xs font-bold inline-flex items-center gap-1"
                            style={{ backgroundColor: `${tenantColor}22`, color: tenantColor }}
                            title="Coin toss done — ready to score"
                          >
                            <CoinTossIcon /> Ready to score
                          </span>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${isLive ? 'animate-pulse' : ''}`}
                        style={isLive
                          ? { backgroundColor: `${tenantColor}30`, color: tenantColor }
                          : m.status === 'warmup'
                          ? { backgroundColor: '#f59e0b22', color: '#f59e0b' }
                          : m.status === 'court_assigned'
                          ? { backgroundColor: '#3b82f622', color: '#3b82f6' }
                          : m.status === 'finalized' || m.status === 'walkover'
                          ? { backgroundColor: '#10b98122', color: '#10b981' }
                          : { backgroundColor: '#ffffff10', color: '#94a3b8' }
                        }
                      >
                        {MATCH_STATUS_LABEL[m.status] ?? m.status}
                      </span>
                    </div>

                    {onMatchClick ? (
                      <button onClick={() => onMatchClick(m)} className={cardClass}>
                        {matchupLink}
                      </button>
                    ) : (
                      <Link href={`/referee/${m.id}`} className={cardClass}>
                        {matchupLink}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {view === 'bracket' && Object.entries(grouped).map(([tournamentId, tMatches]) => {
          const t = tournamentMap[tournamentId];
          const tenant = t?.tenants;
          const tenantColor = (tenant?.primary_color as string | undefined) ?? '#3b82f6';
          const logoUrl = tenant?.logo_url as string | undefined;
          const maxPlayers = (t?.settings?.maxPlayers as number | undefined) ?? 32;
          const format = (t?.settings?.bracketFormat as string | undefined) ?? 'single_elimination';

          const bracketSource = (allMatches ?? matches).filter((m) => m.tournament_id === tournamentId);
          const allTournamentMatches = bracketSource.map((m) => mapMatch(m as unknown as Record<string, unknown>));
          const allPlayers = [...new Set(
            bracketSource.flatMap((m) => [m.player1_id, m.player2_id]).filter(Boolean) as string[]
          )].map((id) => players[id]).filter(Boolean).map(toPlayerType);
          const sharedProps = { players: allPlayers, tournamentId, liveUpdates: true as const };

          return (
            <div key={tournamentId} className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                {logoUrl ? (
                  <img src={logoUrl} alt="logo" className="h-8 w-8 object-contain rounded-lg bg-white/10 p-0.5 shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center" style={{ backgroundColor: `${tenantColor}30` }}>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tenantColor }} />
                  </div>
                )}
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: tenantColor }}>
                    {tenant?.display_name as string ?? ''}
                  </p>
                  <p className="text-sm font-bold text-white/70">{t?.name}</p>
                </div>
              </div>
              <div className="bg-white rounded-2xl overflow-x-auto px-4 py-4">
                <BracketPanel
                  {...sharedProps}
                  matches={allTournamentMatches.filter((m) => m.bracket === 'main')}
                  maxPlayers={maxPlayers}
                  // Double elimination sizes its draw to the actual field, not the
                  // configured maxPlayers floor (see generateBracket) — read the
                  // round count that was actually built instead of a possibly-larger
                  // one from settings, or this panel shows empty phantom rounds.
                  totalRoundsOverride={actualRoundsCount(allTournamentMatches, 'main', getRoundsCount(maxPlayers))}
                  title={format === 'single_elimination' ? 'Bracket' : 'Main Draw'}
                />
              </div>

              {format === 'consolation' && (
                <div className="bg-white rounded-2xl overflow-x-auto px-4 py-4">
                  <BracketPanel
                    {...sharedProps}
                    matches={allTournamentMatches.filter((m) => m.bracket === 'consolation')}
                    maxPlayers={maxPlayers}
                    totalRoundsOverride={getConsolationRoundsCount(maxPlayers)}
                    title="Consolation Bracket"
                    emptyMessage="No consolation bracket yet."
                  />
                </div>
              )}

              {format === 'double_elimination' && (
                <>
                  <div className="bg-white rounded-2xl overflow-x-auto px-4 py-4">
                    <BracketPanel
                      {...sharedProps}
                      matches={allTournamentMatches.filter((m) => m.bracket === 'losers')}
                      maxPlayers={maxPlayers}
                      totalRoundsOverride={actualRoundsCount(allTournamentMatches, 'losers', getLosersRoundsCount(maxPlayers))}
                      title="Consolations Bracket"
                      emptyMessage="No consolations bracket yet."
                    />
                  </div>
                  <div className="bg-white rounded-2xl overflow-x-auto px-4 py-4">
                    <BracketPanel
                      {...sharedProps}
                      matches={allTournamentMatches.filter((m) => m.bracket === 'grand_final' && (m.player1Id || m.matchIndex === 0))}
                      maxPlayers={2}
                      totalRoundsOverride={1}
                      title="Grand Final"
                      emptyMessage="Grand final not reached yet."
                    />
                  </div>
                </>
              )}
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
