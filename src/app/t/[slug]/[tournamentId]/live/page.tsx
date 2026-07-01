'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useParams } from 'next/navigation';
import OnePointBowlLogo from '@/components/OnePointBowlLogo';

interface LiveMatch {
  id: string;
  round_index: number;
  match_index: number;
  court_number: number | null;
  status: string;
  player1_name: string | null;
  player2_name: string | null;
  winner_name: string | null;
}

interface TournamentInfo {
  name: string;
  status: string;
  settings: Record<string, unknown>;
  tenant: { display_name: string; primary_color: string; secondary_color: string; logo_url: string | null };
}

const STATUS_ORDER: Record<string, number> = { playing: 0, court_assigned: 1, warmup: 2, scheduled: 3, finalized: 4, walkover: 4 };

export default function LivePage() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [playerMap, setPlayerMap] = useState<Record<string, string>>({});
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
    setTournament({
      name: t.name,
      status: t.status,
      settings: t.settings as Record<string, unknown>,
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

    const { data: players } = playerIds.length > 0
      ? await supabase.from('players').select('id, full_name').in('id', playerIds)
      : { data: [] };

    const pMap: Record<string, string> = {};
    (players ?? []).forEach((p) => { pMap[p.id] = p.full_name; });
    setPlayerMap(pMap);

    const liveMapped: LiveMatch[] = allMatches.map((m) => ({
      id: m.id,
      round_index: m.round_index,
      match_index: m.match_index,
      court_number: m.court_number,
      status: m.status,
      player1_name: m.player1_id === 'BYE' ? 'BYE' : pMap[m.player1_id] ?? null,
      player2_name: m.player2_id === 'BYE' ? 'BYE' : pMap[m.player2_id] ?? null,
      winner_name: m.winner_id ? pMap[m.winner_id] ?? null : null,
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

  const primary = tournament?.tenant.primary_color ?? '#3b82f6';
  const secondary = tournament?.tenant.secondary_color ?? '#1e40af';

  const activeMatches = matches
    .filter((m) => ['playing', 'court_assigned', 'warmup'].includes(m.status))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || (a.court_number ?? 99) - (b.court_number ?? 99));

  const recentlyFinished = matches
    .filter((m) => m.status === 'finalized' || m.status === 'walkover')
    .slice(-6)
    .reverse();

  const totalMatches = matches.length;
  const finishedMatches = matches.filter((m) => m.status === 'finalized' || m.status === 'walkover').length;
  const pct = totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0;

  const isLive = tournament?.status === 'live_play';

  return (
    <div className="min-h-screen text-white flex flex-col" style={{ backgroundColor: '#0a0f1e', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`:root { --tenant-primary: ${primary}; --tenant-secondary: ${secondary}; }`}</style>

      {/* Top bar */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-white/10" style={{ background: `linear-gradient(135deg, ${primary}22, transparent)` }}>
        <div className="flex items-center gap-3">
          {tournament?.tenant.logo_url ? (
            <img src={tournament.tenant.logo_url} alt={tournament.tenant.display_name} className="h-9 w-auto object-contain" />
          ) : (
            <OnePointBowlLogo size={32} color={primary} />
          )}
          <div>
            <p className="font-black text-lg leading-tight">{tournament?.name ?? '…'}</p>
            <p className="text-white/40 text-xs">{tournament?.tenant.display_name}</p>
          </div>
        </div>
        <div className="text-right">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold animate-pulse" style={{ backgroundColor: `${primary}33`, color: primary }}>
              ● LIVE
            </span>
          ) : (
            <span className="text-white/30 text-sm">{tournament?.status?.replace(/_/g, ' ')}</span>
          )}
          <p className="text-white/20 text-xs mt-1">Updated {lastUpdate.toLocaleTimeString()}</p>
        </div>
      </div>

      {/* Progress bar */}
      {totalMatches > 0 && (
        <div className="px-6 py-3 border-b border-white/5">
          <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
            <span>{finishedMatches} of {totalMatches} matches complete</span>
            <span>{pct}%</span>
          </div>
          <div className="bg-white/10 rounded-full h-1.5">
            <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
          </div>
        </div>
      )}

      <div className="flex-1 p-6 space-y-8 max-w-5xl mx-auto w-full">

        {/* Active matches — court board */}
        {activeMatches.length > 0 && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/30 mb-4">On Court Now</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeMatches.map((m) => {
                const isPlaying = m.status === 'playing';
                return (
                  <div
                    key={m.id}
                    className="rounded-2xl border p-5"
                    style={{
                      borderColor: isPlaying ? primary : 'rgba(255,255,255,0.1)',
                      backgroundColor: isPlaying ? `${primary}15` : 'rgba(255,255,255,0.04)',
                      boxShadow: isPlaying ? `0 0 20px ${primary}30` : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      {m.court_number ? (
                        <span className="text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ backgroundColor: primary, color: '#fff' }}>
                          Court {m.court_number}
                        </span>
                      ) : (
                        <span className="text-xs text-white/20">No court</span>
                      )}
                      <span className="text-xs text-white/30">R{m.round_index + 1} · M{m.match_index + 1}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isPlaying ? primary : 'rgba(255,255,255,0.2)' }} />
                        <span className="font-bold text-base text-white truncate">{m.player1_name ?? 'TBD'}</span>
                      </div>
                      <div className="text-xs text-white/20 pl-4">vs</div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isPlaying ? primary : 'rgba(255,255,255,0.2)' }} />
                        <span className="font-bold text-base text-white truncate">{m.player2_name ?? 'TBD'}</span>
                      </div>
                    </div>
                    {isPlaying && (
                      <div className="mt-3 text-xs font-bold animate-pulse" style={{ color: primary }}>● Playing now</div>
                    )}
                    {m.status === 'court_assigned' && (
                      <div className="mt-3 text-xs text-white/30">Head to court →</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {isLive && activeMatches.length === 0 && (
          <div className="text-center py-16 text-white/20">
            <p className="text-4xl mb-3">🎾</p>
            <p className="font-semibold">No matches currently active</p>
            <p className="text-sm mt-1">Results will appear here in real time</p>
          </div>
        )}

        {!isLive && (
          <div className="text-center py-16 text-white/20">
            <p className="text-4xl mb-3">🎾</p>
            <p className="font-semibold">{tournament?.name}</p>
            <p className="text-sm mt-1">Tournament hasn&apos;t started yet — check back soon</p>
          </div>
        )}

        {/* Recent results */}
        {recentlyFinished.length > 0 && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/30 mb-4">Recent Results</h2>
            <div className="space-y-2">
              {recentlyFinished.map((m) => (
                <div key={m.id} className="flex items-center justify-between bg-white/4 rounded-xl px-4 py-3 border border-white/5">
                  <span className="text-xs text-white/20">R{m.round_index + 1} · {m.court_number ? `Court ${m.court_number}` : `M${m.match_index + 1}`}</span>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-white/40 line-through text-xs">
                      {m.player1_name === m.winner_name ? m.player2_name : m.player1_name}
                    </span>
                    <span className="text-white/20 text-xs">→</span>
                    <span className="font-bold" style={{ color: primary }}>{m.winner_name}</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/30">
                    {m.status === 'walkover' ? 'W/O' : '✓'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-white/5 text-center text-xs text-white/15">
        One Point Bowl · Live Scoreboard · Updates automatically
      </div>
    </div>
  );
}
