'use client';

import { useEffect, useState } from 'react';
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPlayer(id: string | null | undefined, players: Player[]) {
  if (!id) return null;
  return players.find((p) => p.id === id) ?? null;
}

function getPlayerName(id: string | null | undefined, players: Player[], isBye?: boolean) {
  if (isBye) return 'BYE';
  if (!id) return 'TBD';
  return players.find((p) => p.id === id)?.fullName ?? 'TBD';
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
  id, players, isWinner, isBye, matchId, slot, dragging, onDragStart, onDrop, editable, onSetWinner,
  wonToss, isServer, reserveRightGutter,
}: {
  id: string | null | undefined;
  players: Player[];
  isWinner: boolean;
  isBye?: boolean;
  matchId: string;
  slot: 'p1' | 'p2';
  dragging: DragKey;
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
  const p    = id ? getPlayer(id, players) : null;
  const isDraggable = editable && !!id && id !== 'BYE' && name !== 'TBD';
  const isSource    = dragging?.matchId === matchId && dragging?.slot === slot;
  const isClickable = !!onSetWinner;
  const Tag = isClickable ? 'button' : 'div';

  function handleTouchStart(e: React.TouchEvent) {
    if (!isDraggable) return;
    e.preventDefault();
    const t = e.touches[0];
    onDragStart({ matchId, slot });
    showGhost(t.clientX, t.clientY, name);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDraggable) return;
    e.preventDefault();
    const t = e.touches[0];
    moveGhost(t.clientX, t.clientY);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!isDraggable) return;
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
      onTouchStart={isDraggable ? handleTouchStart : undefined}
      onTouchMove={isDraggable ? handleTouchMove : undefined}
      onTouchEnd={isDraggable ? handleTouchEnd : undefined}
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
      </span>
    </Tag>
  );
}

// ── Match card ────────────────────────────────────────────────────────────────
function MatchCard({
  match, players, topPx, editable, dragging, onDragStart, onDrop, resultEditable, onSetWinner, onMatchClick, onReverseMatch,
}: {
  match: Match;
  players: Player[];
  topPx: number;
  editable?: boolean;
  dragging: DragKey;
  onDragStart: (k: DragKey) => void;
  onDrop: (to: { matchId: string; slot: 'p1' | 'p2' }) => void;
  resultEditable?: boolean;
  onSetWinner?: (match: Match, winnerId: string) => void | Promise<void>;
  onMatchClick?: (matchId: string) => void;
  onReverseMatch?: (matchId: string) => void;
}) {
  const isP1Winner = match.winnerId === match.player1Id;
  const isP2Winner = match.winnerId === match.player2Id;
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
      style={{ top: topPx, left: 0, width: COL_W, height: CARD_H }}
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
        editable={editable} dragging={dragging} onDragStart={onDragStart} onDrop={onDrop}
        onSetWinner={isResultEditable ? () => onSetWinner!(match, match.player1Id as string) : undefined}
        wonToss={!!tossWinnerId && tossWinnerId === match.player1Id}
        isServer={!!servedId && servedId === match.player1Id}
        reserveRightGutter={hasOverlay}
      />
      <PlayerSlot
        id={match.player2Id} players={players} isWinner={isP2Winner}
        isBye={match.status === 'walkover' && match.player2Id == null}
        matchId={match.id} slot="p2"
        editable={editable} dragging={dragging} onDragStart={onDragStart} onDrop={onDrop}
        onSetWinner={isResultEditable ? () => onSetWinner!(match, match.player2Id as string) : undefined}
        wonToss={!!tossWinnerId && tossWinnerId === match.player2Id}
        isServer={!!servedId && servedId === match.player2Id}
        reserveRightGutter={hasOverlay}
      />
    </div>
  );
}

// ── SVG connectors between two rounds ────────────────────────────────────────
function Connectors({ r, nextCount, numFirstRound }: { r: number; nextCount: number; numFirstRound: number }) {
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

// ── Main component ────────────────────────────────────────────────────────────
export default function BracketView({
  initialMatches,
  players,
  maxPlayers,
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

  function handleDrop(to: { matchId: string; slot: 'p1' | 'p2' }) {
    if (!dragging || !onSwap) { setDragging(null); return; }
    if (dragging.matchId === to.matchId && dragging.slot === to.slot) { setDragging(null); return; }
    onSwap(dragging.matchId, dragging.slot, to.matchId, to.slot);
    setDragging(null);
  }

  const totalRounds    = getRoundsCount(maxPlayers);
  const rounds         = Array.from({ length: totalRounds }, (_, r) =>
    matches.filter((m) => m.roundIndex === r).sort((a, b) => a.matchIndex - b.matchIndex),
  );
  const numFirstRound  = Math.max(rounds[0]?.length ?? 1, 1);
  const totalH         = numFirstRound * CARD_H;

  return (
    <div className="overflow-x-auto pb-4" style={editable ? { touchAction: 'none' } : undefined}>
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
          return (
            <div key={r} className="flex shrink-0 items-start">
              {/* Column of match cards */}
              <div className="relative shrink-0" style={{ width: COL_W, height: totalH }}>
                {roundMatches.map((match, mi) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    players={players}
                    topPx={mi * cellH + topInset}
                    editable={editable}
                    dragging={dragging}
                    onDragStart={setDragging}
                    onDrop={handleDrop}
                    resultEditable={resultEditable}
                    onSetWinner={onSetWinner}
                    onMatchClick={onMatchClick}
                    onReverseMatch={onReverseMatch}
                  />
                ))}
              </div>

              {/* Connectors to next round */}
              {r < totalRounds - 1 && (
                <Connectors
                  r={r}
                  nextCount={rounds[r + 1]?.length ?? 0}
                  numFirstRound={numFirstRound}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
