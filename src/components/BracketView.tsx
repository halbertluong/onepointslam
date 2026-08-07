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

// ── Player slot ───────────────────────────────────────────────────────────────
function PlayerSlot({
  id, players, isWinner, isBye, matchId, slot, dragging, onDragStart, onDrop, editable, onSetWinner,
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
}) {
  const name = getPlayerName(id, players, isBye);
  const p    = id ? getPlayer(id, players) : null;
  const isDraggable = editable && !!id && id !== 'BYE' && name !== 'TBD';
  const isSource    = dragging?.matchId === matchId && dragging?.slot === slot;
  const isClickable = !!onSetWinner;
  const Tag = isClickable ? 'button' : 'div';

  return (
    <Tag
      type={isClickable ? 'button' : undefined}
      onClick={onSetWinner}
      draggable={isDraggable}
      onDragStart={isDraggable ? () => onDragStart({ matchId, slot }) : undefined}
      onDragOver={editable ? (e) => e.preventDefault() : undefined}
      onDrop={editable ? () => onDrop({ matchId, slot }) : undefined}
      style={{ height: CARD_H / 2 }}
      className={[
        'w-full px-3 flex items-center justify-between gap-1 border-b border-slate-100 overflow-hidden transition-colors select-none text-left',
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
      {isWinner && <span className="text-emerald-500 text-xs font-bold shrink-0">WIN</span>}
    </Tag>
  );
}

// ── Match card ────────────────────────────────────────────────────────────────
function MatchCard({
  match, players, topPx, editable, dragging, onDragStart, onDrop, resultEditable, onSetWinner,
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
}) {
  const isP1Winner = match.winnerId === match.player1Id;
  const isP2Winner = match.winnerId === match.player2Id;
  const statusClass =
    match.status === 'playing'
      ? 'playing'
      : match.status === 'finalized' || match.status === 'walkover'
      ? 'finalized'
      : '';

  const bothRealPlayers =
    !!match.player1Id && !!match.player2Id && match.player1Id !== 'BYE' && match.player2Id !== 'BYE';
  const isResultEditable = resultEditable && bothRealPlayers && !!onSetWinner;

  return (
    <div
      className={`absolute bracket-match ${statusClass} overflow-hidden ${isResultEditable ? 'ring-1 ring-blue-200' : ''}`}
      style={{ top: topPx, left: 0, width: COL_W, height: CARD_H }}
    >
      {match.status === 'playing' && (
        <div className="h-0.5 w-full" style={{ backgroundColor: 'var(--tenant-primary, #1d4ed8)' }} />
      )}
      {isResultEditable && (
        <span className="absolute top-1 right-1 text-[10px] leading-none z-10" title="Click a player to set the winner">✏️</span>
      )}
      <PlayerSlot
        id={match.player1Id} players={players} isWinner={isP1Winner}
        isBye={match.status === 'walkover' && match.player1Id == null}
        matchId={match.id} slot="p1"
        editable={editable} dragging={dragging} onDragStart={onDragStart} onDrop={onDrop}
        onSetWinner={isResultEditable ? () => onSetWinner!(match, match.player1Id as string) : undefined}
      />
      <PlayerSlot
        id={match.player2Id} players={players} isWinner={isP2Winner}
        isBye={match.status === 'walkover' && match.player2Id == null}
        matchId={match.id} slot="p2"
        editable={editable} dragging={dragging} onDragStart={onDragStart} onDrop={onDrop}
        onSetWinner={isResultEditable ? () => onSetWinner!(match, match.player2Id as string) : undefined}
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
    <div className="overflow-x-auto pb-4">
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
