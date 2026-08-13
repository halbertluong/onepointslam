'use client';

import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import type { Match, Player } from '@/types';
import { mapMatch } from '@/types';
import { getRoundName, getRoundsCount } from '@/lib/bracket';

// ── Layout constants ───────────────────────────────────────────────────────────
const CARD_H  = 80;  // px — height of one match card (two player rows)
const COL_W   = 200; // px — width of each column
const COL_GAP = 48;  // px — gap between columns (hosts SVG connectors)

// ── Types ─────────────────────────────────────────────────────────────────────
interface BracketViewProps {
  initialMatches: Match[];
  players: Player[];
  maxPlayers: number;
  /** Overrides the round count computed from maxPlayers — needed for a losers bracket, whose round count doesn't follow the log2(maxPlayers) formula. */
  totalRoundsOverride?: number;
  tournamentId?: string;
  liveUpdates?: boolean;
  /** Enable drag-and-drop reordering (pre-tournament seeding, demo only) */
  editable?: boolean;
  /** Called when two player slots are swapped */
  onSwap?: (aMatchId: string, aSlot: 'p1' | 'p2', bMatchId: string, bSlot: 'p1' | 'p2') => void;
  /** When true, matches with two real (non-BYE) players become clickable to set/override the winner. */
  resultEditable?: boolean;
  /** Called with the match and the chosen player id when a director sets/overrides a winner in edit mode. */
  onSetWinner?: (match: Match, winnerId: string) => void | Promise<void>;
  /** Called when a match card is clicked (e.g. to open referee view) */
  onMatchClick?: (matchId: string) => void;
  /** When provided, finalized matches show a reset button to undo the result */
  onReverseMatch?: (matchId: string) => void;
}

type DragKey = { matchId: string; slot: 'p1' | 'p2' } | null;

/**
 * Players indexed by id. A full draw renders two slots per match — 510 of them
 * at 256 players — so looking each one up by scanning the roster was quadratic
 * and cost most of a second of blocked main thread per render.
 */
type PlayerIndex = Map<string, Player>;

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPlayerName(id: string | null | undefined, players: PlayerIndex, isBye?: boolean) {
  if (isBye) return 'BYE';
  if (!id) return 'TBD';
  return players.get(id)?.fullName ?? 'TBD';
}

// ── Drag ghost (touch) ────────────────────────────────────────────────────────
const ghost = typeof document !== 'undefined'
  ? (() => {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;padding:6px 12px;background:#1d4ed8;color:#fff;border-radius:10px;font-size:13px;font-weight:600;white-space:nowrap;opacity:0;transition:opacity .1s;box-shadow:0 4px 16px rgba(0,0,0,.25)';
      document.body.appendChild(el);
      return el;
    })()
  : null;

function showGhost(x: number, y: number, label: string) {
  if (!ghost) return;
  ghost.textContent = label;
  ghost.style.left = `${x + 14}px`;
  ghost.style.top  = `${y - 20}px`;
  ghost.style.opacity = '1';
}
function moveGhost(x: number, y: number) {
  if (!ghost) return;
  ghost.style.left = `${x + 14}px`;
  ghost.style.top  = `${y - 20}px`;
}
function hideGhost() {
  if (ghost) ghost.style.opacity = '0';
}

// ── Player slot ───────────────────────────────────────────────────────────────
function PlayerSlot({
  id, players, isWinner, isBye, matchId, slot, isSource, onDragStart, onDrop, editable, onSetWinner,
  wonToss, isServer, reserveRightGutter,
}: {
  id: string | null | undefined;
  players: PlayerIndex;
  isWinner: boolean;
  isBye?: boolean;
  matchId: string;
  slot: 'p1' | 'p2';
  /** This slot is the one currently being dragged. */
  isSource: boolean;
  onDragStart: (k: DragKey) => void;
  onDrop: (to: { matchId: string; slot: 'p1' | 'p2' }) => void;
  editable?: boolean;
  /** Present only when this slot can be clicked to set the match winner. */
  onSetWinner?: () => void;
  /** This player won the pre-match coin toss (tennis) or coin flip (basketball). */
  wonToss?: boolean;
  /** This player served (tennis) / took the kick or the shot (soccer, basketball). */
  isServer?: boolean;
  /** Leave room on the right for the card's overlaid control (undo / edit hint). */
  reserveRightGutter?: boolean;
}) {
  const name = getPlayerName(id, players, isBye);
  const p    = id ? players.get(id) ?? null : null;
  const isDraggable = editable && !!id && id !== 'BYE' && name !== 'TBD';
  const isClickable = !!onSetWinner;
  const Tag = isClickable ? 'button' : 'div';

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    onDragStart({ matchId, slot });
    showGhost(t.clientX, t.clientY, name);
  }

  function handleTouchMove(e: React.TouchEvent) {
    const t = e.touches[0];
    moveGhost(t.clientX, t.clientY);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    hideGhost();
    const t = e.changedTouches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const target = el?.closest('[data-slot]');
    if (target) {
      const tMatchId = target.getAttribute('data-match-id')!;
      const tSlot    = target.getAttribute('data-slot') as 'p1' | 'p2';
      onDrop({ matchId: tMatchId, slot: tSlot });
    } else {
      onDrop({ matchId, slot }); // drop on self = cancel
    }
  }

  return (
    <Tag
      type={isClickable ? 'button' : undefined}
      onClick={onSetWinner}
      draggable={isDraggable}
      data-match-id={editable ? matchId : undefined}
      data-slot={editable ? slot : undefined}
      onDragStart={isDraggable ? () => onDragStart({ matchId, slot }) : undefined}
      onDragOver={editable ? (e) => e.preventDefault() : undefined}
      onDrop={editable ? () => onDrop({ matchId, slot }) : undefined}
      style={{ height: CARD_H / 2 }}
      className={[
        'w-full flex items-center justify-between gap-1 border-b border-slate-100 overflow-hidden transition-colors select-none text-left',
        reserveRightGutter ? 'pl-3 pr-8' : 'px-3',
        isWinner ? 'bg-emerald-50' : '',
        isSource  ? 'opacity-40 bg-blue-50' : '',
        isDraggable ? 'cursor-grab active:cursor-grabbing hover:bg-slate-50' : '',
        isClickable ? 'cursor-pointer hover:bg-blue-50' : '',
      ].join(' ')}
    >
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-medium truncate block ${isWinner ? 'text-emerald-700 font-bold' : 'text-slate-700'}`}>
          {p?.seedRating ? (
            <span className="text-amber-500 font-bold mr-1 text-xs">[{p.seedRating}]</span>
          ) : null}
          {name}
        </span>
        {p && (p.ntrpRating != null || p.utrRating != null) && (
          <span className="text-xs text-slate-400 truncate block">
            {p.ntrpRating != null ? `NTRP ${p.ntrpRating}` : ''}
            {p.ntrpRating != null && p.utrRating != null ? ' · ' : ''}
            {p.utrRating != null ? `UTR ${p.utrRating}` : ''}
          </span>
        )}
      </div>
      <span className="flex items-center gap-0.5 shrink-0">
        {wonToss && <span className="text-[10px] leading-none" title="Won the coin toss">🪙</span>}
        {isServer && <span className="text-[10px] leading-none" title="Served">🎾</span>}
        {isWinner && <span className="text-emerald-500 text-xs font-bold">WIN</span>}
        {/*
          Touch dragging happens from this grip alone. A finger can only either
          pan or drag, and the browser decides which at the moment it lands — so
          the only element that gives up panning is the grip itself. Suppressing
          it across the whole bracket, as this once did, left a 10,000px-tall
          draw that no finger could scroll.
        */}
        {isDraggable && (
          <span
            role="button"
            aria-label={`Move ${name}`}
            title="Drag to move this player"
            style={{ touchAction: 'none' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={(e) => e.stopPropagation()}
            className="px-1.5 -mr-1 text-slate-300 hover:text-slate-500 text-xs leading-none cursor-grab active:cursor-grabbing"
          >
            ⠿
          </span>
        )}
      </span>
    </Tag>
  );
}

// ── Match card ────────────────────────────────────────────────────────────────
interface MatchCardProps {
  match: Match;
  players: PlayerIndex;
  topPx: number;
  editable?: boolean;
  /** Which of this card's two slots is being dragged, if either. */
  draggingSlot: 'p1' | 'p2' | null;
  onDragStart: (k: DragKey) => void;
  onDrop: (to: { matchId: string; slot: 'p1' | 'p2' }) => void;
  resultEditable?: boolean;
  onSetWinner?: (match: Match, winnerId: string) => void | Promise<void>;
  onMatchClick?: (matchId: string) => void;
  onReverseMatch?: (matchId: string) => void;
}

function MatchCardInner({
  match, players, topPx, editable, draggingSlot, onDragStart, onDrop, resultEditable, onSetWinner, onMatchClick, onReverseMatch,
}: MatchCardProps) {
  // A match with no winner has none — without the first test, an undecided
  // later-round match marked both of its empty slots as the winner, because a
  // null winner "matched" a null player.
  const isP1Winner = !!match.winnerId && match.winnerId === match.player1Id;
  const isP2Winner = !!match.winnerId && match.winnerId === match.player2Id;
  const isClickable = !!onMatchClick && !match.winnerId && match.status !== 'walkover'
    && match.player1Id && match.player1Id !== 'BYE'
    && match.player2Id && match.player2Id !== 'BYE';
  const statusClass =
    match.status === 'playing'
      ? 'playing'
      : match.status === 'finalized' || match.status === 'walkover'
      ? 'finalized'
      : '';

  const bothRealPlayers =
    !!match.player1Id && !!match.player2Id && match.player1Id !== 'BYE' && match.player2Id !== 'BYE';
  const isResultEditable = resultEditable && bothRealPlayers && !!onSetWinner;

  // Who won the pre-match toss, and who put the ball in play. Tennis records a
  // toss winner and a server; soccer and basketball record the coin-flip winner
  // and the player on the ball (kicker / offense).
  const tossWinnerId = match.tossWinnerId ?? match.coinFlipWinnerId ?? null;
  const servedId = match.serverPlayerId ?? match.kickerPlayerId ?? match.offensePlayerId ?? null;

  // An overlaid control sits in the card's top-right corner; when one is shown
  // the player rows give up that space so badges don't sit underneath it.
  const showUndo = !!onReverseMatch && !!match.winnerId && match.status !== 'walkover';
  const hasOverlay = showUndo || (isResultEditable && !match.winnerId);

  return (
    <div
      className={`absolute bracket-match ${statusClass} overflow-hidden ${isResultEditable ? 'ring-1 ring-blue-200' : ''} ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 transition-shadow' : ''}`}
      // A full 256 draw stands 10,000px tall, nearly all of it offscreen. Every
      // card is a fixed size, so the browser can be told to skip laying out and
      // painting the ones out of view — which is most of the work of showing a
      // large bracket at all.
      style={{
        top: topPx,
        left: 0,
        width: COL_W,
        height: CARD_H,
        contentVisibility: 'auto',
        containIntrinsicSize: `${COL_W}px ${CARD_H}px`,
      }}
      onClick={isClickable ? () => onMatchClick!(match.id) : undefined}
      title={isClickable ? 'Click to referee this match' : undefined}
    >
      {match.status === 'playing' && (
        <div className="h-0.5 w-full" style={{ backgroundColor: 'var(--tenant-primary, #1d4ed8)' }} />
      )}
      {isResultEditable && !match.winnerId && (
        <span className="absolute top-1 right-1 text-[10px] leading-none z-10" title="Click a player to set the winner">✏️</span>
      )}
      {showUndo && (
        <button
          onClick={(e) => { e.stopPropagation(); onReverseMatch!(match.id); }}
          className="absolute top-1 right-1 z-10 text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-400 font-bold leading-none transition-colors shadow-sm"
          title="Reset result"
        >
          ↩
        </button>
      )}
      <PlayerSlot
        id={match.player1Id} players={players} isWinner={isP1Winner}
        isBye={match.status === 'walkover' && match.player1Id == null}
        matchId={match.id} slot="p1"
        editable={editable} isSource={draggingSlot === 'p1'} onDragStart={onDragStart} onDrop={onDrop}
        onSetWinner={isResultEditable ? () => onSetWinner!(match, match.player1Id as string) : undefined}
        wonToss={!!tossWinnerId && tossWinnerId === match.player1Id}
        isServer={!!servedId && servedId === match.player1Id}
        reserveRightGutter={hasOverlay}
      />
      <PlayerSlot
        id={match.player2Id} players={players} isWinner={isP2Winner}
        isBye={match.status === 'walkover' && match.player2Id == null}
        matchId={match.id} slot="p2"
        editable={editable} isSource={draggingSlot === 'p2'} onDragStart={onDragStart} onDrop={onDrop}
        onSetWinner={isResultEditable ? () => onSetWinner!(match, match.player2Id as string) : undefined}
        wonToss={!!tossWinnerId && tossWinnerId === match.player2Id}
        isServer={!!servedId && servedId === match.player2Id}
        reserveRightGutter={hasOverlay}
      />
    </div>
  );
}

/**
 * Every card in the draw re-renders whenever anything about the bracket changes,
 * and a full draw is 255 of them. Comparing the match's rendered fields rather
 * than its object identity means a refetch after one swap redraws the two cards
 * that changed instead of all of them — and starting a drag redraws only the
 * card being dragged from.
 */
const MatchCard = memo(MatchCardInner, (a, b) =>
  a.topPx === b.topPx &&
  a.editable === b.editable &&
  a.draggingSlot === b.draggingSlot &&
  a.players === b.players &&
  a.resultEditable === b.resultEditable &&
  a.onDragStart === b.onDragStart &&
  a.onDrop === b.onDrop &&
  a.onSetWinner === b.onSetWinner &&
  a.onMatchClick === b.onMatchClick &&
  a.onReverseMatch === b.onReverseMatch &&
  a.match.id === b.match.id &&
  a.match.player1Id === b.match.player1Id &&
  a.match.player2Id === b.match.player2Id &&
  a.match.winnerId === b.match.winnerId &&
  a.match.status === b.match.status &&
  a.match.tossWinnerId === b.match.tossWinnerId &&
  a.match.coinFlipWinnerId === b.match.coinFlipWinnerId &&
  a.match.serverPlayerId === b.match.serverPlayerId &&
  a.match.kickerPlayerId === b.match.kickerPlayerId &&
  a.match.offensePlayerId === b.match.offensePlayerId,
);

// ── SVG connectors between two rounds ────────────────────────────────────────
function Connectors({ r, nextCount, numFirstRound, band }: {
  r: number;
  nextCount: number;
  numFirstRound: number;
  /** Vertical range worth drawing, when the draw is large enough to window. */
  band?: { top: number; bottom: number };
}) {
  const totalH   = numFirstRound * CARD_H;
  const srcCellH = CARD_H * Math.pow(2, r);
  const midX     = COL_GAP / 2;

  return (
    <svg
      width={COL_GAP}
      height={totalH}
      className="shrink-0"
      style={{ overflow: 'visible', display: 'block' }}
    >
      {Array.from({ length: nextCount }, (_, mi) => {
        // vertical centre of each source match card
        const src0Y = mi * 2       * srcCellH + srcCellH / 2;
        const src1Y = (mi * 2 + 1) * srcCellH + srcCellH / 2;
        const tgtY  = (src0Y + src1Y) / 2;
        if (band && (src1Y < band.top || src0Y > band.bottom)) return null;
        return (
          <g key={mi} stroke="#cbd5e1" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* source 0: right → midpoint then down */}
            <polyline points={`0,${src0Y} ${midX},${src0Y} ${midX},${tgtY}`} />
            {/* source 1: right → midpoint then up */}
            <polyline points={`0,${src1Y} ${midX},${src1Y} ${midX},${tgtY}`} />
            {/* midpoint → next column */}
            <line x1={midX} y1={tgtY} x2={COL_GAP} y2={tgtY} />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * How far beyond the visible area cards are still built, so scrolling and
 * dragging reveal finished cards rather than blank space being filled in.
 */
const WINDOW_MARGIN = 800;
/** Rebuild the window only once the view has moved this far, to avoid churn. */
const WINDOW_STEP = 300;
/** Small draws are cheap — build them whole so nothing depends on scrolling. */
const WINDOW_ABOVE_SLOTS = 32;

type Viewport = { top: number; bottom: number; left: number; right: number };

/** First render, before any measuring — must match on server and client. */
const INITIAL_VIEWPORT: Viewport = { top: 0, bottom: 1400, left: 0, right: 1800 };

// ── Main component ────────────────────────────────────────────────────────────
export default function BracketView({
  initialMatches,
  players,
  maxPlayers,
  totalRoundsOverride,
  tournamentId,
  liveUpdates = false,
  editable,
  onSwap,
  resultEditable,
  onSetWinner,
  onMatchClick,
  onReverseMatch,
}: BracketViewProps) {
  const [matches,  setMatches]  = useState<Match[]>(initialMatches);
  const [dragging, setDragging] = useState<DragKey>(null);

  const playerIndex = useMemo(
    () => new Map(players.map((p) => [p.id, p])) as PlayerIndex,
    [players],
  );

  // Callers define these inline, so they are a different function on every one
  // of the parent's renders. Held in refs and re-exposed as stable wrappers,
  // because a changed handler identity invalidates all 255 memoized cards and
  // costs a full redraw of the draw.
  const latest = useRef({ onSwap, onSetWinner, onMatchClick, onReverseMatch });
  useEffect(() => {
    latest.current = { onSwap, onSetWinner, onMatchClick, onReverseMatch };
  });

  // The slot a drag started from, tracked outside React state as well as in it.
  // The state drives the "being dragged" styling; the ref is what the drop reads,
  // so a quick flick that starts and ends before React commits still swaps.
  const dragSource = useRef<DragKey>(null);
  const startDrag = useCallback((k: DragKey) => {
    dragSource.current = k;
    setDragging(k);
  }, []);

  // Which part of the draw is worth building. A 256-player bracket is 10,000px
  // tall and 1,700px wide, of which a screen shows a few percent; building all
  // 255 cards took seconds of frozen page on a tablet. Cards sit at fixed
  // positions inside fixed-size columns, so leaving the far ones out costs
  // nothing in layout — the bracket keeps its full size and shape.
  const scrollBox = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT);

  useEffect(() => {
    let queued = false;
    let measured = false;
    const measure = () => {
      queued = false;
      const box = scrollBox.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      const next: Viewport = {
        // Vertical scrolling belongs to the page; horizontal to this box.
        top: -rect.top,
        bottom: -rect.top + window.innerHeight,
        left: box.scrollLeft,
        right: box.scrollLeft + box.clientWidth,
      };
      const first = !measured;
      measured = true;
      setViewport((prev) =>
        first ||
        Math.abs(prev.top - next.top) > WINDOW_STEP ||
        Math.abs(prev.left - next.left) > WINDOW_STEP
          ? next
          : prev,
      );
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(measure);
    };

    // Measure once mounted, then follow the page and the bracket's own scroll.
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    scrollBox.current?.addEventListener('scroll', onScroll, { passive: true });
    const box = scrollBox.current;
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      box?.removeEventListener('scroll', onScroll);
    };
  }, []);

  const setWinner = useCallback(
    (match: Match, winnerId: string) => latest.current.onSetWinner?.(match, winnerId),
    [],
  );
  const matchClick = useCallback((matchId: string) => latest.current.onMatchClick?.(matchId), []);
  const reverseMatch = useCallback((matchId: string) => latest.current.onReverseMatch?.(matchId), []);

  // Sync when parent updates matches (swap / speed-through)
  useEffect(() => {
    if (!liveUpdates) setMatches(initialMatches);
  }, [initialMatches, liveUpdates]);

  // Realtime subscription (production)
  useEffect(() => {
    if (!liveUpdates || !tournamentId) return;

    let cleanup: (() => void) | undefined;
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
              const updated = mapMatch(payload.new as Record<string, unknown>);
              const idx = prev.findIndex((m) => m.id === updated.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = updated;
                return next;
              }
              return [...prev, updated];
            });
          },
        )
        .subscribe();
      return () => supabase.removeChannel(channel);
    };

    setup().then((fn) => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [liveUpdates, tournamentId]);

  const handleDrop = useCallback((to: { matchId: string; slot: 'p1' | 'p2' }) => {
    const from = dragSource.current;
    dragSource.current = null;
    setDragging(null);
    if (!from || !latest.current.onSwap) return;
    if (from.matchId === to.matchId && from.slot === to.slot) return;
    latest.current.onSwap(from.matchId, from.slot, to.matchId, to.slot);
  }, []);

  const totalRounds = totalRoundsOverride ?? getRoundsCount(maxPlayers);
  // One pass over the draw instead of one filter+sort per round, which was
  // eight scans of 255 matches on every render of a full bracket.
  const rounds = useMemo(() => {
    const byRound: Match[][] = Array.from({ length: totalRounds }, () => []);
    for (const m of matches) byRound[m.roundIndex]?.push(m);
    for (const list of byRound) list.sort((a, b) => a.matchIndex - b.matchIndex);
    return byRound;
  }, [matches, totalRounds]);
  const numFirstRound  = Math.max(rounds[0]?.length ?? 1, 1);
  const totalH         = numFirstRound * CARD_H;

  // Draws small enough to be cheap are built whole, so they never depend on
  // scroll measurement at all.
  const windowed = numFirstRound * 2 > WINDOW_ABOVE_SLOTS;
  const inView = (colLeft: number, topPx: number) =>
    !windowed ||
    (colLeft + COL_W >= viewport.left - WINDOW_MARGIN &&
      colLeft <= viewport.right + WINDOW_MARGIN &&
      topPx + CARD_H >= viewport.top - WINDOW_MARGIN &&
      topPx <= viewport.bottom + WINDOW_MARGIN);

  return (
    <div className="overflow-x-auto pb-4" ref={scrollBox}>
      {/* Heading row */}
      <div className="flex mb-4">
        {rounds.map((_, r) => (
          <div key={r} className="flex shrink-0 items-center">
            <div style={{ width: COL_W }} className="text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                {getRoundName(r, totalRounds)}
              </span>
            </div>
            {r < totalRounds - 1 && <div style={{ width: COL_GAP }} />}
          </div>
        ))}
      </div>

      {/* Cards + connectors row */}
      <div className="flex items-start min-w-max">
        {rounds.map((roundMatches, r) => {
          const cellH    = CARD_H * Math.pow(2, r);
          const topInset = (cellH - CARD_H) / 2; // centres card within slot
          const colLeft  = r * (COL_W + COL_GAP);
          return (
            <div key={r} className="flex shrink-0 items-start">
              {/* Column of match cards */}
              <div className="relative shrink-0" style={{ width: COL_W, height: totalH }}>
                {roundMatches.map((match, mi) => {
                  const topPx = mi * cellH + topInset;
                  if (!inView(colLeft, topPx)) return null;
                  return (
                  <MatchCard
                    key={match.id}
                    match={match}
                    players={playerIndex}
                    topPx={topPx}
                    editable={editable}
                    draggingSlot={dragging?.matchId === match.id ? dragging.slot : null}
                    onDragStart={startDrag}
                    onDrop={handleDrop}
                    resultEditable={resultEditable}
                    onSetWinner={onSetWinner ? setWinner : undefined}
                    onMatchClick={onMatchClick ? matchClick : undefined}
                    onReverseMatch={onReverseMatch ? reverseMatch : undefined}
                  />
                  );
                })}
              </div>

              {/* Connectors to next round */}
              {r < totalRounds - 1 && (
                <Connectors
                  r={r}
                  nextCount={rounds[r + 1]?.length ?? 0}
                  numFirstRound={numFirstRound}
                  band={windowed ? { top: viewport.top - WINDOW_MARGIN, bottom: viewport.bottom + WINDOW_MARGIN } : undefined}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
