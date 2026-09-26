'use client';

import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import type { Match, Player } from '@/types';
import { mapMatch } from '@/types';
import { getRoundName, getRoundsCount, minorRoundSurvivorSlotIsPermanentBye } from '@/lib/bracket';
import { CoinTossIcon } from '@/components/icons/CoinTossIcon';

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
  /** Match ids to call out as "up next" — ringed in the tenant's primary color, the same treatment a live scoreboard gives its own upcoming-matches list. */
  highlightMatchIds?: string[];
  /** When set, the view scrolls to bring this match into view whenever the id changes — used to keep a live scoreboard tracking the current match as the tournament moves. */
  followMatchId?: string | null;
  /**
   * Round-0 match indexes of the MAIN bracket that are byes (a lone occupant,
   * no opponent). Only meaningful when rendering a losers/consolation bracket:
   * a round-0 slot fed by one of these indexes (see round0DropDestination in
   * lib/bracket.ts — main index 2n feeds player1, 2n+1 feeds player2) will
   * never receive an opponent, since a bye produces no loser to drop in. That
   * slot reads as "BYE" instead of "TBD" once this is passed.
   */
  mainRoundZeroByeMatchIndexes?: Set<number>;
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
  id, players, isWinner, isBye, isDropIn, matchId, slot, isSource, onDragStart, onDrop, editable, onSetWinner,
  wonToss, isServer, reserveRightGutter, reserveLeftGutter,
}: {
  id: string | null | undefined;
  players: PlayerIndex;
  isWinner: boolean;
  isBye?: boolean;
  /** A fresh arrival from the main draw this round, rather than a survivor advancing within this bracket — see BracketViewProps.mainRoundZeroByeMatchIndexes for the full explanation. Shown as a small staggered amber marker so the flow of the draw reads at a glance. */
  isDropIn?: boolean;
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
  /** Leave room on the left for the card's court badge. */
  reserveLeftGutter?: boolean;
}) {
  const name = getPlayerName(id, players, isBye);
  const p    = id ? players.get(id) ?? null : null;
  // A bye slot (id null, isBye true) is draggable too — a director can move
  // the bye itself, swapping it with a real player elsewhere in round 0,
  // same as dragging that player onto the bye the other way around.
  const isDraggable = editable && (isBye || (!!id && id !== 'BYE' && name !== 'TBD'));
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
      // A drop-in slot (a fresh arrival from the main draw) gets a bold
      // all-around amber border and fill instead of the plain hairline
      // divider — a boxed-off look that reads as "this didn't flow from a
      // previous round" at a glance, without relying on a text badge.
      className={[
        'w-full flex items-center justify-between gap-1 overflow-hidden transition-colors select-none text-left',
        isDropIn ? 'border-2 border-amber-400 rounded' : 'border-b border-slate-100',
        reserveLeftGutter ? 'pl-8' : 'pl-3',
        reserveRightGutter ? 'pr-8' : 'pr-3',
        isWinner ? 'bg-emerald-50 win-row' : isDropIn ? 'bg-amber-50' : '',
        isSource  ? 'opacity-40 bg-blue-50' : '',
        isDraggable ? 'cursor-grab active:cursor-grabbing hover:bg-slate-50' : '',
        isClickable ? 'cursor-pointer hover:bg-blue-50' : '',
      ].join(' ')}
      title={isDropIn ? 'New arrival, just eliminated from the main draw' : undefined}
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
        {wonToss && <span key="toss" className="toss-badge leading-none" title="Won the coin toss"><CoinTossIcon /></span>}
        {isServer && <span key="serve" className="serve-badge text-sm leading-none" title="Served">🎾</span>}
        {isWinner && <span key="win" className="win-badge text-emerald-500 text-xs font-black">WIN</span>}
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
  /** Called out as "up next" — see `BracketViewProps.highlightMatchIds`. */
  highlighted?: boolean;
  /** See `BracketViewProps.mainRoundZeroByeMatchIndexes`. */
  mainRoundZeroByeMatchIndexes?: Set<number>;
}

function MatchCardInner({
  match, players, topPx, editable, draggingSlot, onDragStart, onDrop, resultEditable, onSetWinner, onMatchClick, onReverseMatch, highlighted,
  mainRoundZeroByeMatchIndexes,
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

  // Shown as "BYE" the moment the draw has a lone occupant in round 0 — even
  // before the tournament goes live and the match is actually settled into a
  // walkover (see settleByeAdvancement) — so a director editing the draw
  // still sees which slots are byes, without that lone occupant being
  // declared a winner or advanced into round 1 yet.
  const isRoundZeroBye =
    match.bracket === 'main' && match.roundIndex === 0 && (match.player1Id == null) !== (match.player2Id == null);

  // A losers/consolation round-0 slot fed by a main-bracket bye (see
  // round0DropDestination in lib/bracket.ts) will never get an opponent — the
  // bye produced no loser to drop in. Read that from the main bracket's own
  // byes rather than waiting for the drop to land, so it shows "BYE" instead
  // of "TBD" immediately.
  const isSecondaryRoundZero = match.bracket !== 'main' && match.bracket !== 'grand_final' && match.roundIndex === 0;
  const isMinorLosersRound = match.bracket === 'losers' && match.roundIndex > 0 && match.roundIndex % 2 === 1;

  // A minor round's player1 (the survivor carried forward from the previous
  // major round, all the way back to round 0) can be permanently empty too:
  // if the whole block of main-bracket round-0 matches that ever could have
  // fed that lineage were all byes, no one ever produced a round-0 loser to
  // start it, so nothing will ever arrive there — see
  // minorRoundSurvivorSlotIsPermanentBye in lib/bracket.ts, the read-side
  // twin of the same check resolveAdvancement makes server-side.
  const minorRoundWbIndex = isMinorLosersRound ? (match.roundIndex + 1) / 2 : null;
  const p1MinorForcedBye = isMinorLosersRound && match.player1Id == null && minorRoundWbIndex != null
    && !!mainRoundZeroByeMatchIndexes
    && minorRoundSurvivorSlotIsPermanentBye(mainRoundZeroByeMatchIndexes, minorRoundWbIndex, match.matchIndex);

  const p1ForcedBye = (isSecondaryRoundZero && match.player1Id == null
    && !!mainRoundZeroByeMatchIndexes?.has(match.matchIndex * 2)) || p1MinorForcedBye;
  const p2ForcedBye = isSecondaryRoundZero && match.player2Id == null
    && !!mainRoundZeroByeMatchIndexes?.has(match.matchIndex * 2 + 1);

  // A losers-bracket round-0 match that's a forced bye always advances its
  // lone survivor into player1 (the top slot) of round 1 — round0→round1 is
  // a 1-to-1 carry-over, not a merge (see Connectors' isCarryOver case), so
  // the connector between them is drawn as a flat line at a fixed row. But
  // which physical row (top or bottom) holds that survivor in THIS card
  // depends on whether the bye landed in player1 or player2 — round0DropDestination
  // sends an even main-bracket match index to player1 and an odd one to
  // player2, so which slot is real is basically a coin flip per match. Left
  // alone, a survivor sitting in the bottom row here while landing in the
  // top row next round makes the flat carry-over line look like it's jumping
  // between rows. Rendering the real occupant on top whenever the bye
  // landed in player1 keeps every survivor in a consistent row so the line
  // reads flat. Only meaningful for the losers bracket: a consolation
  // bracket's round0→round1 is an ordinary 2-to-1 merge, not a carry-over.
  const swapRoundZeroByeOrder = match.bracket === 'losers' && match.roundIndex === 0
    && match.player1Id == null && match.player2Id != null;

  // A losers-bracket slot is either a fresh drop-in (a loser just eliminated
  // from the main draw) or a survivor advancing within the losers bracket
  // itself — distinguished visually so the flow of the draw reads at a
  // glance. Round 0 is fed entirely by main-bracket round-0 losers (both
  // slots are drop-ins); a consolation bracket only ever takes drop-ins in
  // round 0, everything after is pure internal advancement (see
  // resolveAdvancement). A true losers bracket keeps taking drop-ins every
  // other round after that: odd round indexes are "minor" rounds where
  // player1 carries the previous round's survivor forward and player2 is the
  // new arrival from that round's main-bracket loser (see resolveAdvancement's
  // 'losers' branch); even round indexes are pure consolidation, no drop-ins.
  const p1IsDropIn = isSecondaryRoundZero;
  const p2IsDropIn = isSecondaryRoundZero || isMinorLosersRound;

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

  // The court badge is only meaningful while the match hasn't been played yet
  // — a finished match keeps its old court_number (nothing clears it once the
  // court moves on to the next match), so showing it here as well as on
  // whichever match now actually holds that court reads as the court being
  // stuck in two places at once.
  const showCourtBadge = typeof match.courtNumber === 'number'
    && match.status !== 'finalized' && match.status !== 'walkover';

  return (
    <div
      id={`bracket-match-${match.id}`}
      data-match-id={match.id}
      className={`absolute bracket-match ${statusClass} ${highlighted ? 'bracket-match-highlight' : ''} overflow-hidden ${isResultEditable ? 'ring-1 ring-blue-200' : ''} ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 transition-shadow' : ''}`}
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
      {showCourtBadge && (
        <span
          className="court-badge absolute top-1 left-1 z-10 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white leading-none"
          title={`Court ${match.courtNumber}`}
        >
          {match.courtNumber}
        </span>
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
      {(() => {
        const p1Slot = (
          <PlayerSlot
            key="p1"
            id={match.player1Id} players={players} isWinner={isP1Winner}
            isBye={(isRoundZeroBye && match.player1Id == null) || p1ForcedBye}
            isDropIn={p1IsDropIn && !p1ForcedBye}
            matchId={match.id} slot="p1"
            editable={editable} isSource={draggingSlot === 'p1'} onDragStart={onDragStart} onDrop={onDrop}
            onSetWinner={isResultEditable ? () => onSetWinner!(match, match.player1Id as string) : undefined}
            wonToss={!!tossWinnerId && tossWinnerId === match.player1Id}
            isServer={!!servedId && servedId === match.player1Id}
            reserveRightGutter={hasOverlay}
            reserveLeftGutter={showCourtBadge && !swapRoundZeroByeOrder}
          />
        );
        const p2Slot = (
          <PlayerSlot
            key="p2"
            id={match.player2Id} players={players} isWinner={isP2Winner}
            isBye={(isRoundZeroBye && match.player2Id == null) || p2ForcedBye}
            isDropIn={p2IsDropIn && !p2ForcedBye}
            matchId={match.id} slot="p2"
            editable={editable} isSource={draggingSlot === 'p2'} onDragStart={onDragStart} onDrop={onDrop}
            onSetWinner={isResultEditable ? () => onSetWinner!(match, match.player2Id as string) : undefined}
            wonToss={!!tossWinnerId && tossWinnerId === match.player2Id}
            isServer={!!servedId && servedId === match.player2Id}
            reserveRightGutter={hasOverlay}
            reserveLeftGutter={showCourtBadge && swapRoundZeroByeOrder}
          />
        );
        return swapRoundZeroByeOrder ? <>{p2Slot}{p1Slot}</> : <>{p1Slot}{p2Slot}</>;
      })()}
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
  a.highlighted === b.highlighted &&
  a.mainRoundZeroByeMatchIndexes === b.mainRoundZeroByeMatchIndexes &&
  a.match.id === b.match.id &&
  a.match.player1Id === b.match.player1Id &&
  a.match.player2Id === b.match.player2Id &&
  a.match.winnerId === b.match.winnerId &&
  a.match.status === b.match.status &&
  a.match.courtNumber === b.match.courtNumber &&
  a.match.tossWinnerId === b.match.tossWinnerId &&
  a.match.coinFlipWinnerId === b.match.coinFlipWinnerId &&
  a.match.serverPlayerId === b.match.serverPlayerId &&
  a.match.kickerPlayerId === b.match.kickerPlayerId &&
  a.match.offensePlayerId === b.match.offensePlayerId,
);

// ── SVG connectors between two rounds ────────────────────────────────────────
/**
 * `currentCount`/`nextCount` are read straight from the actual matches in
 * each round rather than assumed from `r` — a standard single-elimination
 * bracket (main draw, consolation) always halves (`nextCount ===
 * currentCount / 2`), but a losers-bracket "major" round carries its count
 * unchanged into the very next ("minor") round instead, one-to-one rather
 * than merging pairs. Both cases are drawn here: a 2-to-1 merge (the
 * standard case) or a 1-to-1 carry-over (major → minor) when the count
 * doesn't change. `currentCellH`/`nextCellH` size to how much vertical space
 * that round actually needs — `totalH / matchCountInThatRound` — rather than
 * to a fixed doubling-per-round formula that assumes a merge happened.
 */
function Connectors({ currentCount, nextCount, numFirstRound, band }: {
  currentCount: number;
  nextCount: number;
  numFirstRound: number;
  /** Vertical range worth drawing, when the draw is large enough to window. */
  band?: { top: number; bottom: number };
}) {
  const totalH      = numFirstRound * CARD_H;
  const currentCellH = totalH / currentCount;
  const nextCellH    = totalH / nextCount;
  const midX        = COL_GAP / 2;
  const isCarryOver  = nextCount === currentCount;

  return (
    <svg
      width={COL_GAP}
      height={totalH}
      className="shrink-0"
      style={{ overflow: 'visible', display: 'block' }}
    >
      {isCarryOver ? Array.from({ length: nextCount }, (_, mi) => {
        // One-to-one carry-over: this round's survivor waits at the same
        // vertical slot in the next round (no merge), a plain straight line.
        const y = mi * currentCellH + currentCellH / 2;
        if (band && (y < band.top || y > band.bottom)) return null;
        return (
          <line key={mi} x1={0} y1={y} x2={COL_GAP} y2={y} stroke="#cbd5e1" strokeWidth={1.5} strokeLinecap="round" />
        );
      }) : Array.from({ length: nextCount }, (_, mi) => {
        // vertical centre of each source match card
        const src0Y = mi * 2       * currentCellH + currentCellH / 2;
        const src1Y = (mi * 2 + 1) * currentCellH + currentCellH / 2;
        const tgtY  = mi * nextCellH + nextCellH / 2;
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
  highlightMatchIds,
  followMatchId,
  mainRoundZeroByeMatchIndexes,
}: BracketViewProps) {
  const [matches,  setMatches]  = useState<Match[]>(initialMatches);
  const [dragging, setDragging] = useState<DragKey>(null);

  const playerIndex = useMemo(
    () => new Map(players.map((p) => [p.id, p])) as PlayerIndex,
    [players],
  );

  const highlightSet = useMemo(() => new Set(highlightMatchIds ?? []), [highlightMatchIds]);

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

  // Keeps the view tracking the tournament: whenever the match to follow
  // changes (the current one finishes, the next one starts), scroll it into
  // view — both this box's own horizontal scroll and any scrollable ancestor
  // (e.g. the live scoreboard's vertical panel) via the browser's native
  // multi-container scrollIntoView walk.
  useEffect(() => {
    if (!followMatchId) return;
    const el = scrollBox.current?.querySelector<HTMLElement>(`[data-match-id="${CSS.escape(followMatchId)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [followMatchId]);

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

  // A losers bracket's "major" round carries its match count unchanged into
  // the very next ("minor") round rather than halving (see getRoundName), so
  // two consecutive rounds legitimately share the same name — e.g. a 64-draw
  // reads Round of 32, Round of 32, Round of 16, Round of 16, ... Left as-is
  // that reads as a mistake, so the second round of a same-named pair gets a
  // "(2)" suffix to show they're genuinely two different rounds.
  const roundNames = rounds.map((roundMatches, r) => getRoundName(r, totalRounds, roundMatches.length));
  const roundLabels = roundNames.map((name, r) => (r > 0 && roundNames[r - 1] === name ? `${name} (2)` : r < roundNames.length - 1 && roundNames[r + 1] === name ? `${name} (1)` : name));

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
                {roundLabels[r]}
              </span>
            </div>
            {r < totalRounds - 1 && <div style={{ width: COL_GAP }} />}
          </div>
        ))}
      </div>

      {/* Cards + connectors row */}
      <div className="flex items-start min-w-max">
        {rounds.map((roundMatches, r) => {
          // Sized to how many matches this round actually has, not assumed
          // from `r` — a losers-bracket "major" round carries its match count
          // unchanged into the next ("minor") round rather than halving, so a
          // fixed doubling-per-round formula misplaces every round after the
          // first one that doesn't (see `Connectors` for the matching case).
          const cellH    = totalH / Math.max(roundMatches.length, 1);
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
                    highlighted={highlightSet.has(match.id)}
                    mainRoundZeroByeMatchIndexes={mainRoundZeroByeMatchIndexes}
                  />
                  );
                })}
              </div>

              {/* Connectors to next round */}
              {r < totalRounds - 1 && (
                <Connectors
                  currentCount={Math.max(roundMatches.length, 1)}
                  nextCount={Math.max(rounds[r + 1]?.length ?? 1, 1)}
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
