'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import OnePointBowlLogo from '@/components/OnePointBowlLogo';
import BracketView from '@/components/BracketView';
import { mapMatch, mapPlayer } from '@/types';
import type { Match, Player } from '@/types';

interface LiveMatch {
  id: string;
  round_index: number;
  match_index: number;
  court_number: number | null;
  status: string;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  winner_name: string | null;
  server_player_id: string | null;
  toss_winner_name: string | null;
}

interface TournamentInfo {
  name: string;
  status: string;
  maxPlayers: number;
  tenant: { display_name: string; primary_color: string; secondary_color: string; logo_url: string | null };
}

const STATUS_ORDER: Record<string, number> = { playing: 0, court_assigned: 1, warmup: 2, scheduled: 3, finalized: 4, walkover: 4 };

/**
 * The live scoreboard view — used both by the public /live page and by the
 * director dashboard's Scoreboard tab, so directors preview exactly what
 * spectators see. Pass `embedded` to drop the full-screen page chrome.
 */
export default function LiveScoreboard({
  tournamentId,
  embedded = false,
}: {
  tournamentId: string;
  embedded?: boolean;
}) {
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [bracketMatches, setBracketMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const load = useCallback(async () => {
    const supabase = createClient();

    const { data: t } = await supabase
      .from('tournaments')
      .select('name, status, settings, tenants(display_name, primary_color, secondary_color, logo_url)')
      .eq('id', tournamentId)
      .single();

    if (!t) return;
    const tenantRaw = t.tenants as unknown as Record<string, unknown> | null;
    const settings = t.settings as Record<string, unknown>;
    setTournament({
      name: t.name,
      status: t.status,
      maxPlayers: (settings?.maxPlayers as number) ?? 32,
      tenant: {
        display_name: (tenantRaw?.display_name as string) ?? 'One Point Bowl',
        primary_color: (tenantRaw?.primary_color as string) ?? '#3b82f6',
        secondary_color: (tenantRaw?.secondary_color as string) ?? '#1e40af',
        logo_url: (tenantRaw?.logo_url as string | null) ?? null,
      },
    });

    const { data: rawMatches } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('round_index')
      .order('match_index');

    const allMatches = rawMatches ?? [];
    const playerIds = [...new Set(
      allMatches.flatMap((m) => [m.player1_id, m.player2_id]).filter(Boolean).filter((id) => id !== 'BYE')
    )];

    const { data: rawPlayers } = playerIds.length > 0
      ? await supabase.from('players').select('*').in('id', playerIds)
      : { data: [] };

    const mappedPlayers = (rawPlayers ?? []).map(mapPlayer);
    setPlayers(mappedPlayers);
    setBracketMatches(allMatches.filter((m) => m.bracket === 'main').map(mapMatch));

    const pMap: Record<string, string> = {};
    mappedPlayers.forEach((p) => { pMap[p.id] = p.fullName; });

    const liveMapped: LiveMatch[] = allMatches.map((m) => ({
      id: m.id,
      round_index: m.round_index,
      match_index: m.match_index,
      court_number: m.court_number,
      status: m.status,
      player1_id: m.player1_id,
      player2_id: m.player2_id,
      player1_name: m.player1_id === 'BYE' ? 'BYE' : pMap[m.player1_id] ?? null,
      player2_name: m.player2_id === 'BYE' ? 'BYE' : pMap[m.player2_id] ?? null,
      winner_name: m.winner_id ? pMap[m.winner_id] ?? null : null,
      server_player_id: m.server_player_id ?? null,
      toss_winner_name: m.toss_winner_id ? pMap[m.toss_winner_id] ?? null : null,
    }));

    setMatches(liveMapped);
    setLastUpdate(new Date());
  }, [tournamentId]);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel(`live-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load, tournamentId]);

  const safeHex = (c: string | undefined) => /^#[0-9a-fA-F]{6}$/.test(c ?? '') ? c! : '#3b82f6';
  const primary = safeHex(tournament?.tenant.primary_color);
  const secondary = safeHex(tournament?.tenant.secondary_color);

  const activeMatches = matches
    .filter((m) => ['playing', 'court_assigned', 'warmup'].includes(m.status))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || (a.court_number ?? 99) - (b.court_number ?? 99));

  const recentlyFinished = matches
    .filter((m) => m.status === 'finalized' || m.status === 'walkover')
    .slice(-8)
    .reverse();

  const totalMatches = matches.length;
  const finishedMatches = matches.filter((m) => m.status === 'finalized' || m.status === 'walkover').length;
  const pct = totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0;

  const isLive = tournament?.status === 'live_play';

  return (
    <div
      className={`bg-white text-slate-900 flex flex-col ${embedded ? 'h-[75vh] rounded-2xl overflow-hidden border border-slate-200' : 'h-screen overflow-hidden'}`}
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      <style>{`:root { --tenant-primary: ${primary}; --tenant-secondary: ${secondary}; }`}</style>

      {/* Top bar */}
      <div className="px-6 py-3 flex items-center justify-between border-b border-slate-200 shrink-0" style={{ background: `linear-gradient(135deg, ${primary}0d, transparent)` }}>
        <div className="flex items-center gap-3">
          {tournament?.tenant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tournament.tenant.logo_url} alt={tournament.tenant.display_name} className="h-9 w-auto object-contain" />
          ) : (
            <OnePointBowlLogo size={32} color={primary} />
          )}
          <div>
            <p className="font-black text-lg leading-tight text-slate-900">{tournament?.name ?? '…'}</p>
            <p className="text-slate-500 text-xs">{tournament?.tenant.display_name}</p>
          </div>
        </div>
        <div className="text-right">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold animate-pulse" style={{ backgroundColor: `${primary}1a`, color: primary }}>
              ● LIVE
            </span>
          ) : (
            <span className="text-slate-400 text-sm">{tournament?.status?.replace(/_/g, ' ')}</span>
          )}
          <p className="text-slate-400 text-xs mt-1">Updated {lastUpdate.toLocaleTimeString()}</p>
        </div>
      </div>

      {/* Progress bar */}
      {totalMatches > 0 && (
        <div className="px-6 py-2.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>{finishedMatches} of {totalMatches} matches complete</span>
            <span>{pct}%</span>
          </div>
          <div className="bg-slate-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
          </div>
        </div>
      )}

      {!isLive && (
        <div className="flex-1 flex items-center justify-center text-center text-slate-400">
          <div>
            <p className="text-4xl mb-3">🎾</p>
            <p className="font-semibold text-slate-600">{tournament?.name}</p>
            <p className="text-sm mt-1">Tournament hasn&apos;t started yet — check back soon</p>
          </div>
        </div>
      )}

      {/* Bracket (left) + matches (right) */}
      {isLive && (
        <div className="flex-1 flex gap-4 p-4 min-h-0 overflow-hidden">
          {/* Bracket — 60% */}
          <div className="w-[60%] shrink-0 flex flex-col min-h-0 rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <h2 className="px-4 pt-3 pb-2 text-xs font-bold uppercase tracking-widest text-slate-400 shrink-0">Bracket</h2>
            <div className="flex-1 min-h-0 overflow-auto px-4 pb-4">
              {bracketMatches.length > 0 ? (
                <BracketView
                  initialMatches={bracketMatches}
                  players={players}
                  maxPlayers={tournament?.maxPlayers ?? 32}
                />
              ) : (
                <p className="text-slate-400 text-center py-8">No bracket yet.</p>
              )}
            </div>
          </div>

          {/* Matches — 40% */}
          <div className="w-[40%] flex flex-col min-h-0 gap-4 overflow-hidden">
            {/* On court now */}
            <div className="flex flex-col min-h-0 rounded-2xl border border-slate-200 bg-white" style={{ flex: activeMatches.length > 0 ? '1 1 auto' : '0 0 auto' }}>
              <h2 className="px-4 pt-3 pb-2 text-xs font-bold uppercase tracking-widest text-slate-400 shrink-0">On Court Now</h2>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-2.5">
                {activeMatches.length === 0 ? (
                  <p className="text-slate-400 text-sm py-4 text-center">No matches currently active</p>
                ) : activeMatches.map((m) => {
                  const isPlaying = m.status === 'playing';
                  return (
                    <div
                      key={m.id}
                      className="rounded-xl border p-3"
                      style={{
                        borderColor: isPlaying ? primary : '#e2e8f0',
                        backgroundColor: isPlaying ? `${primary}0d` : '#f8fafc',
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        {m.court_number ? (
                          <span className="text-[11px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg" style={{ backgroundColor: primary, color: '#fff' }}>
                            Court {m.court_number}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">No court</span>
                        )}
                        <span className="text-[11px] text-slate-400">R{m.round_index + 1} · M{m.match_index + 1}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isPlaying ? primary : '#cbd5e1' }} />
                          <span className="font-bold text-sm text-slate-900 truncate">{m.player1_name ?? 'TBD'}</span>
                          {m.server_player_id && m.server_player_id === m.player1_id && (
                            <span className="text-xs font-bold shrink-0" style={{ color: primary }}>🎾</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isPlaying ? primary : '#cbd5e1' }} />
                          <span className="font-bold text-sm text-slate-900 truncate">{m.player2_name ?? 'TBD'}</span>
                          {m.server_player_id && m.server_player_id === m.player2_id && (
                            <span className="text-xs font-bold shrink-0" style={{ color: primary }}>🎾</span>
                          )}
                        </div>
                      </div>
                      {isPlaying && (
                        <div className="mt-2 text-[11px] font-bold animate-pulse" style={{ color: primary }}>● Playing now</div>
                      )}
                      {m.status === 'court_assigned' && (
                        <div className="mt-2 text-[11px] text-slate-400">Head to court →</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent results */}
            <div className="flex flex-col min-h-0 rounded-2xl border border-slate-200 bg-white flex-1">
              <h2 className="px-4 pt-3 pb-2 text-xs font-bold uppercase tracking-widest text-slate-400 shrink-0">Recent Results</h2>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-2">
                {recentlyFinished.length === 0 ? (
                  <p className="text-slate-400 text-sm py-4 text-center">No results yet</p>
                ) : recentlyFinished.map((m) => (
                  <div key={m.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                    <span className="text-[11px] text-slate-400 shrink-0">R{m.round_index + 1} · {m.court_number ? `Court ${m.court_number}` : `M${m.match_index + 1}`}</span>
                    <div className="flex items-center gap-1.5 text-sm min-w-0 justify-end">
                      <span className="text-slate-400 line-through text-xs truncate">
                        {m.player1_name === m.winner_name ? m.player2_name : m.player1_name}
                      </span>
                      <span className="text-slate-300 text-xs shrink-0">→</span>
                      <span className="font-bold shrink-0" style={{ color: primary }}>{m.winner_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-6 py-2 border-t border-slate-100 text-center text-xs text-slate-300 shrink-0">
        One Point Bowl · Live Scoreboard · Updates automatically
      </div>
    </div>
  );
}
