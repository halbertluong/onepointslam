'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import OnePointBowlLogo from '@/components/OnePointBowlLogo';
import BracketView from '@/components/BracketView';
import { mapMatch, mapPlayer } from '@/types';
import type { Match, Player } from '@/types';
import { getConsolationRoundsCount, getLosersRoundsCount, getRoundsCount, actualRoundsCount } from '@/lib/bracket';

/** Safari (incl. older iPadOS) only exposes the webkit-prefixed fullscreen API. */
type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

function FullscreenIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {active ? (
        <path d="M9 3v4a2 2 0 0 1-2 2H3M21 8h-4a2 2 0 0 1-2-2V3M3 16h4a2 2 0 0 1 2 2v4M16 21v-4a2 2 0 0 1 2-2h4" />
      ) : (
        <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
      )}
    </svg>
  );
}

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
  bracketFormat: string;
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
  const [consolationMatches, setConsolationMatches] = useState<Match[]>([]);
  const [losersMatches, setLosersMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  // The id of whichever match a realtime event most recently touched — lets
  // the bracket panels scroll to and highlight the exact spot that just
  // changed, so spectators watching the TV can see what a referee just
  // entered instead of having to spot it themselves in a large draw.
  const [lastChangedMatchId, setLastChangedMatchId] = useState<string | null>(null);

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
      bracketFormat: (settings?.bracketFormat as string) ?? 'single_elimination',
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
    setConsolationMatches(allMatches.filter((m) => m.bracket === 'consolation').map(mapMatch));
    setLosersMatches(allMatches.filter((m) => m.bracket === 'losers').map(mapMatch));

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${tournamentId}` }, (payload) => {
        const changedId = (payload.new as { id?: string } | null)?.id ?? (payload.old as { id?: string } | null)?.id ?? null;
        if (changedId) setLastChangedMatchId(changedId);
        load();
      })
      .subscribe();
    // Belt-and-suspenders poll: this page sits unattended on a TV for the
    // length of the tournament, and a realtime websocket that silently drops
    // after hours of being idle would otherwise leave it showing stale
    // scores/bracket state with nothing to prompt a reconnect.
    const poll = setInterval(load, 30_000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [load, tournamentId]);

  // Fullscreen — a TV kiosk browser is usually launched fullscreen already,
  // but this covers the common case of opening the link in an ordinary
  // browser tab and wanting the chrome out of the way.
  useEffect(() => {
    if (embedded) return;
    const doc = document as FullscreenDoc;
    const onChange = () => setIsFullscreen(!!(document.fullscreenElement ?? doc.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [embedded]);

  const toggleFullscreen = useCallback(() => {
    const doc = document as FullscreenDoc;
    if (document.fullscreenElement ?? doc.webkitFullscreenElement) {
      const exit = document.exitFullscreen ?? doc.webkitExitFullscreen;
      exit?.call(document)?.catch(() => {});
      return;
    }
    // Fullscreening the whole page (rather than just this component's own
    // container) is the more broadly-supported target — some browsers are
    // picky about which elements are allowed to become the fullscreen
    // element.
    const el = document.documentElement as FullscreenEl;
    const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
    request?.call(el)?.catch(() => {});
  }, []);

  // Wake lock — this page is meant to sit unattended on a TV for the length
  // of the tournament, so the display shouldn't dim or sleep. The lock is
  // released automatically whenever the tab goes out of view (screen off,
  // tab switch), so it's re-acquired on every return to visibility.
  useEffect(() => {
    if (embedded || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelled) { s.release().catch(() => {}); return; }
        sentinel = s;
      } catch {
        // Denied, unsupported, or the document isn't visible yet — nothing to do.
      }
    };
    acquire();
    const onVisibility = () => { if (document.visibilityState === 'visible' && !sentinel) acquire(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      sentinel?.release().catch(() => {});
    };
  }, [embedded]);

  const safeHex = (c: string | undefined) => /^#[0-9a-fA-F]{6}$/.test(c ?? '') ? c! : '#3b82f6';
  const primary = safeHex(tournament?.tenant.primary_color);
  const secondary = safeHex(tournament?.tenant.secondary_color);
  // A tenant's brand color can legitimately be white or another pale shade
  // (a school's secondary color is often white) — unreadable as text, an
  // icon fill, or a solid badge behind white digits on this page's white
  // chrome. Darken anything too light to a legible shade, preserving hue
  // where there is one and falling back to a neutral slate where there
  // isn't (e.g. white/gray), so every accent stays visible and distinct.
  const legibleAccent = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const toLinear = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    if (luminance < 0.6) return hex;
    const max = Math.max(r, g, b);
    if (max - Math.min(r, g, b) < 12) return '#475569';
    const scale = 140 / max;
    const toHex = (c: number) => Math.round(c * scale).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };
  const primaryAccent = legibleAccent(primary);
  const secondaryAccent = legibleAccent(secondary);

  // The current match(es) plus everything still queued behind them, in the
  // order they'll be called — replaces a court-only view so spectators can
  // see what's coming even before it's assigned a court.
  const upcomingMatches = matches
    .filter((m) =>
      m.status !== 'finalized' && m.status !== 'walkover' &&
      m.player1_id && m.player2_id &&
      m.player1_id !== 'BYE' && m.player2_id !== 'BYE'
    )
    .sort((a, b) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
      (a.court_number ?? 99) - (b.court_number ?? 99) ||
      a.round_index - b.round_index ||
      a.match_index - b.match_index
    );
  // Split into two visually distinct groups: matches already out on a court
  // (primary-colored, urgent) versus matches still waiting their turn
  // (secondary-colored, numbered by queue position).
  const onCourtMatches = upcomingMatches.filter((m) => m.status !== 'scheduled');
  const queuedMatches = upcomingMatches.filter((m) => m.status === 'scheduled');

  const recentlyFinished = matches
    .filter((m) => m.status === 'finalized' || m.status === 'walkover')
    .slice(-8)
    .reverse();

  // Each bracket panel can only scroll to and highlight a match that
  // actually has a card in it, so the "follow" target is narrowed per panel.
  // Whatever a realtime event most recently touched wins (that's the spot a
  // referee just updated); with nothing to follow yet — first load, or the
  // most recent change was in a bracket with no panel here (e.g. a losers
  // bracket) — fall back to the next match up, so the screen still opens on
  // something relevant instead of the top of an untouched draw.
  // Every bracket format beyond plain single elimination gets a second panel
  // next to the main draw: 'consolation' shows the consolation bracket,
  // 'double_elimination' shows the losers bracket (where a winners-bracket
  // loss actually goes) — without this, a double-elimination tournament's
  // second bracket would only ever appear as loose cards in the queue/results
  // list, with no picture of who's playing whom or how far they've come back.
  const isDoubleElim = tournament?.bracketFormat === 'double_elimination';
  const secondaryMatches = isDoubleElim ? losersMatches : consolationMatches;
  // Matches the label the Bracket tab and Referee Console already use for
  // this bracket in a double-elimination tournament.
  const secondaryTitle = isDoubleElim ? 'Consolations Bracket' : 'Consolation Bracket';
  // Double elimination sizes its draw to the actual field, not the configured
  // maxPlayers floor (see generateBracket) — read the round count that was
  // actually built instead of a possibly-larger one from settings.
  const secondaryRoundsCount = isDoubleElim
    ? actualRoundsCount(losersMatches, 'losers', getLosersRoundsCount(tournament?.maxPlayers ?? 32))
    : getConsolationRoundsCount(tournament?.maxPlayers ?? 32);

  const mainMatchIds = new Set(bracketMatches.map((m) => m.id));
  const secondaryMatchIds = new Set(secondaryMatches.map((m) => m.id));
  const upcomingInMainBracket = upcomingMatches.filter((m) => mainMatchIds.has(m.id));
  const upcomingInSecondaryBracket = upcomingMatches.filter((m) => secondaryMatchIds.has(m.id));

  const lastChangedInMain = lastChangedMatchId && mainMatchIds.has(lastChangedMatchId) ? lastChangedMatchId : null;
  const lastChangedInSecondary = lastChangedMatchId && secondaryMatchIds.has(lastChangedMatchId) ? lastChangedMatchId : null;

  const followMatchId = lastChangedInMain ?? upcomingInMainBracket[0]?.id ?? null;
  const highlightMatchIds = Array.from(new Set(
    [lastChangedInMain, ...upcomingInMainBracket.slice(0, 2).map((m) => m.id)].filter((id): id is string => !!id),
  ));

  const followSecondaryMatchId = lastChangedInSecondary ?? upcomingInSecondaryBracket[0]?.id ?? null;
  const highlightSecondaryMatchIds = Array.from(new Set(
    [lastChangedInSecondary, ...upcomingInSecondaryBracket.slice(0, 2).map((m) => m.id)].filter((id): id is string => !!id),
  ));

  const hasSecondaryBracket = (tournament?.bracketFormat === 'consolation' || isDoubleElim) && secondaryMatches.length > 0;

  const totalMatches = matches.length;
  const finishedMatches = matches.filter((m) => m.status === 'finalized' || m.status === 'walkover').length;
  const pct = totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0;

  // Whether there's a bracket to show at all — independent of `status`, since
  // a director can record results (via the referee console or the dashboard)
  // before ever flipping the tournament to 'live_play'. Gating the whole
  // layout on that status left this page blank while matches were already
  // being played; it now only affects the "LIVE" badge.
  const hasMatches = totalMatches > 0;
  const isLive = tournament?.status === 'live_play';

  return (
    <div
      className={`bg-white text-slate-900 flex flex-col ${embedded ? 'h-[75vh] rounded-2xl overflow-hidden border border-slate-200' : 'h-screen overflow-hidden'}`}
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      <style>{`:root { --tenant-primary: ${primaryAccent}; --tenant-secondary: ${secondaryAccent}; }`}</style>

      {/* Top bar */}
      <div className="px-6 py-3 flex items-center justify-between border-b-2 shrink-0" style={{ background: `linear-gradient(135deg, ${primaryAccent}33, ${secondaryAccent}1a, transparent)`, borderBottomColor: `${primaryAccent}59` }}>
        <div className="flex items-center gap-3">
          {tournament?.tenant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tournament.tenant.logo_url} alt={tournament.tenant.display_name} className="h-9 w-auto object-contain" />
          ) : (
            <OnePointBowlLogo size={32} color={primaryAccent} />
          )}
          <div>
            <p className="font-black text-lg leading-tight text-slate-900">{tournament?.name ?? '…'}</p>
            <p className="text-sm font-semibold" style={{ color: secondaryAccent }}>{tournament?.tenant.display_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold animate-pulse" style={{ backgroundColor: primaryAccent, color: '#fff' }}>
                ● LIVE
              </span>
            ) : (
              <span className="text-slate-500 text-sm font-medium">{tournament?.status?.replace(/_/g, ' ')}</span>
            )}
            <p className="text-slate-500 text-xs mt-1">Updated {lastUpdate.toLocaleTimeString()}</p>
          </div>
          {!embedded && (
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
              aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
              className="shrink-0 p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
            >
              <FullscreenIcon active={isFullscreen} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {totalMatches > 0 && (
        <div className="px-6 py-2.5 border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
            <span>{finishedMatches} of {totalMatches} matches complete</span>
            <span>{pct}%</span>
          </div>
          <div className="bg-slate-200 rounded-full h-2">
            <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${primaryAccent}, ${secondaryAccent})` }} />
          </div>
        </div>
      )}

      {!hasMatches && (
        <div className="flex-1 flex items-center justify-center text-center text-slate-400">
          <div>
            <p className="text-4xl mb-3">🎾</p>
            <p className="font-semibold text-slate-600">{tournament?.name}</p>
            <p className="text-sm mt-1">Tournament hasn&apos;t started yet — check back soon</p>
          </div>
        </div>
      )}

      {/* Bracket(s) (left) + matches (right) — 40/40/20 when a consolation
          bracket joins the main one, 60/40 for a single-bracket tournament */}
      {hasMatches && (
        <div className="flex-1 flex gap-4 p-4 min-h-0 overflow-hidden">
          <div className={`${hasSecondaryBracket ? 'w-[40%]' : 'w-[60%]'} shrink-0 flex flex-col min-h-0 rounded-2xl border border-slate-300 bg-white overflow-hidden shadow-sm`}>
            <div className="px-4 pt-3 pb-2 shrink-0">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-600">
                {hasSecondaryBracket ? 'Main Bracket' : 'Bracket'}
              </h2>
              <div className="h-1 w-10 rounded-full mt-1.5" style={{ background: `linear-gradient(90deg, ${primaryAccent}, ${secondaryAccent})` }} />
            </div>
            <div className="flex-1 min-h-0 overflow-auto px-4 pb-4">
              {bracketMatches.length > 0 ? (
                <BracketView
                  initialMatches={bracketMatches}
                  players={players}
                  maxPlayers={tournament?.maxPlayers ?? 32}
                  // Double elimination sizes its draw to the actual field, not the
                  // configured maxPlayers floor (see generateBracket) — read the
                  // round count that was actually built instead of a possibly-larger
                  // one from settings, or this panel shows empty phantom rounds.
                  totalRoundsOverride={actualRoundsCount(bracketMatches, 'main', getRoundsCount(tournament?.maxPlayers ?? 32))}
                  highlightMatchIds={highlightMatchIds}
                  followMatchId={followMatchId}
                />
              ) : (
                <p className="text-slate-400 text-center py-8">No bracket yet.</p>
              )}
            </div>
          </div>

          {hasSecondaryBracket && (
            <div className="w-[40%] shrink-0 flex flex-col min-h-0 rounded-2xl border border-slate-300 bg-white overflow-hidden shadow-sm">
              <div className="px-4 pt-3 pb-2 shrink-0">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-600">{secondaryTitle}</h2>
                <div className="h-1 w-10 rounded-full mt-1.5" style={{ background: `linear-gradient(90deg, ${primaryAccent}, ${secondaryAccent})` }} />
              </div>
              <div className="flex-1 min-h-0 overflow-auto px-4 pb-4">
                {secondaryMatches.length > 0 ? (
                  <BracketView
                    initialMatches={secondaryMatches}
                    players={players}
                    maxPlayers={tournament?.maxPlayers ?? 32}
                    totalRoundsOverride={secondaryRoundsCount}
                    highlightMatchIds={highlightSecondaryMatchIds}
                    followMatchId={followSecondaryMatchId}
                  />
                ) : (
                  <p className="text-slate-400 text-center py-8">No {secondaryTitle.toLowerCase()} yet.</p>
                )}
              </div>
            </div>
          )}

          {/* Matches — 20% alongside two brackets, 40% alongside one */}
          <div className={`${hasSecondaryBracket ? 'w-[20%]' : 'w-[40%]'} flex flex-col min-h-0 gap-4 overflow-hidden`}>
            {/* On court + up next, grouped and color-coded so it's obvious at a glance */}
            <div className="flex flex-col min-h-0 rounded-2xl border border-slate-300 bg-white shadow-sm" style={{ flex: upcomingMatches.length > 0 ? '1 1 auto' : '0 0 auto' }}>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-3 space-y-4">
                {upcomingMatches.length === 0 ? (
                  <p className="text-slate-400 text-sm py-4 text-center">All matches complete 🎉</p>
                ) : (
                  <>
                    {onCourtMatches.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: primaryAccent }} />
                          <h2 className="text-xs font-black uppercase tracking-widest" style={{ color: primaryAccent }}>On Court</h2>
                        </div>
                        {onCourtMatches.map((m) => {
                          const isPlaying = m.status === 'playing';
                          return (
                            <div
                              key={m.id}
                              className="rounded-xl border-2 p-3 flex gap-3"
                              style={{
                                borderColor: primaryAccent,
                                backgroundColor: isPlaying ? `${primaryAccent}17` : `${primaryAccent}0a`,
                              }}
                            >
                              <div
                                className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-black text-base text-white shadow"
                                style={{ backgroundColor: primaryAccent }}
                                title={m.court_number ? `Court ${m.court_number}` : 'No court assigned'}
                              >
                                {m.court_number ?? '–'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-slate-900 truncate">{m.player1_name ?? 'TBD'}</span>
                                    {m.server_player_id && m.server_player_id === m.player1_id && (
                                      <span className="text-sm shrink-0">🎾</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-slate-900 truncate">{m.player2_name ?? 'TBD'}</span>
                                    {m.server_player_id && m.server_player_id === m.player2_id && (
                                      <span className="text-sm shrink-0">🎾</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                  <span className="text-[11px] font-bold" style={{ color: primaryAccent }}>
                                    {isPlaying ? '● Playing now' : m.status === 'court_assigned' ? 'Head to court →' : 'Warming up'}
                                  </span>
                                  <span className="text-[11px] text-slate-500 shrink-0">R{m.round_index + 1} · M{m.match_index + 1}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {queuedMatches.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: secondaryAccent }} />
                          <h2 className="text-xs font-black uppercase tracking-widest" style={{ color: secondaryAccent }}>Up Next</h2>
                        </div>
                        {queuedMatches.map((m, i) => (
                          <div
                            key={m.id}
                            className="rounded-xl border p-3 flex gap-3"
                            style={{ borderColor: `${secondaryAccent}66`, backgroundColor: `${secondaryAccent}0d` }}
                          >
                            <div
                              className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-black text-sm text-white"
                              style={{ backgroundColor: secondaryAccent }}
                              title={`#${i + 1} in the queue`}
                            >
                              #{i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm text-slate-800 truncate">{m.player1_name ?? 'TBD'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm text-slate-800 truncate">{m.player2_name ?? 'TBD'}</span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-[11px] font-bold" style={{ color: secondaryAccent }}>Up next</span>
                                <span className="text-[11px] text-slate-500 shrink-0">R{m.round_index + 1} · M{m.match_index + 1}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Recent results */}
            <div className="flex flex-col min-h-0 rounded-2xl border border-slate-300 bg-white flex-1 shadow-sm">
              <div className="px-4 pt-3 pb-2 shrink-0">
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-600">Recent Results</h2>
                <div className="h-1 w-10 rounded-full mt-1.5" style={{ background: `linear-gradient(90deg, ${primaryAccent}, ${secondaryAccent})` }} />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-2">
                {recentlyFinished.length === 0 ? (
                  <p className="text-slate-400 text-sm py-4 text-center">No results yet</p>
                ) : recentlyFinished.map((m) => (
                  <div key={m.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
                    <span className="text-[11px] text-slate-500 shrink-0">R{m.round_index + 1} · {m.court_number ? `Court ${m.court_number}` : `M${m.match_index + 1}`}</span>
                    <div className="flex items-center gap-1.5 text-sm min-w-0 justify-end">
                      <span className="text-slate-400 line-through text-xs truncate">
                        {m.player1_name === m.winner_name ? m.player2_name : m.player1_name}
                      </span>
                      <span className="text-slate-400 text-xs shrink-0">→</span>
                      <span className="font-bold shrink-0" style={{ color: primaryAccent }}>{m.winner_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-6 py-2 border-t border-slate-200 text-center text-xs text-slate-400 shrink-0">
        One Point Bowl · Live Scoreboard · Updates automatically
      </div>
    </div>
  );
}
