import type { Player, Match, TournamentSettings } from '@/types';

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Places seeded players at standard bracket positions so seeds 1 & 2
 * can only meet in the final. Returns slot indices for a bracket of size P.
 */
function seededSlots(P: number): number[] {
  // Standard seeding positions for single-elimination brackets
  const positions: Record<number, number[]> = {
    2: [0, 1],
    4: [0, 3, 1, 2],
    8: [0, 7, 3, 4, 1, 6, 2, 5],
    16: [0, 15, 7, 8, 3, 12, 4, 11, 1, 14, 6, 9, 2, 13, 5, 10],
    32: [
      0, 31, 15, 16, 7, 24, 8, 23, 3, 28, 12, 19, 4, 27, 11, 20,
      1, 30, 14, 17, 6, 25, 9, 22, 2, 29, 13, 18, 5, 26, 10, 21,
    ],
    64: Array.from({ length: 64 }, (_, i) => i), // simplified for 64+
    128: Array.from({ length: 128 }, (_, i) => i),
  };
  return positions[P] ?? Array.from({ length: P }, (_, i) => i);
}

export function generateBracket(
  players: Player[],
  _settings: TournamentSettings,
  tournamentId: string,
): Match[] {
  const N = players.length;
  const P = nextPowerOf2(N);
  const byeCount = P - N;

  // Sort seeds first, then randomize unseeded
  const seeded = players.filter((p) => p.seedRating != null).sort((a, b) => (a.seedRating ?? 99) - (b.seedRating ?? 99));
  const unseeded = shuffle(players.filter((p) => p.seedRating == null));
  const ordered = [...seeded, ...unseeded];

  // Build slot assignment: slot -> playerId or 'BYE'
  const slots: (string | 'BYE')[] = new Array(P).fill('BYE');
  const slotOrder = seededSlots(P);

  // Fill seeded players into their proper slots
  seeded.forEach((p, i) => {
    if (i < slotOrder.length) slots[slotOrder[i]] = p.id;
  });

  // Fill unseeded into remaining slots (non-bye slots)
  let unseededIdx = 0;
  for (let s = 0; s < P; s++) {
    if (slots[s] === 'BYE' && unseededIdx < unseeded.length) {
      slots[s] = unseeded[unseededIdx++].id;
    }
  }

  const matches: Match[] = [];
  const matchesPerRound = P / 2;

  // Round 0 (first round)
  for (let i = 0; i < matchesPerRound; i++) {
    const raw1 = slots[i * 2];
    const raw2 = slots[i * 2 + 1];
    const isByeMatch = raw1 === 'BYE' || raw2 === 'BYE';
    // Store null for BYE slots — 'BYE' is an internal sentinel only, never written to the DB
    const p1: string | null = raw1 === 'BYE' ? null : raw1;
    const p2: string | null = raw2 === 'BYE' ? null : raw2;

    matches.push({
      id: `match-r0-${i}`,
      tournamentId,
      roundIndex: 0,
      matchIndex: i,
      player1Id: p1,
      player2Id: p2,
      serverPlayerId: null,
      winnerId: isByeMatch ? (p1 ?? p2) : null,
      status: isByeMatch ? 'walkover' : 'scheduled',
      courtNumber: undefined,
    });
  }

  // Generate placeholder matches for subsequent rounds
  const totalRounds = Math.log2(P);
  for (let r = 1; r < totalRounds; r++) {
    const count = P / Math.pow(2, r + 1);
    for (let i = 0; i < count; i++) {
      matches.push({
        id: `match-r${r}-${i}`,
        tournamentId,
        roundIndex: r,
        matchIndex: i,
        player1Id: null,
        player2Id: null,
        serverPlayerId: null,
        winnerId: null,
        status: 'scheduled',
        courtNumber: undefined,
      });
    }
  }

  // Propagate bye winners into round 1
  return propagateWalkovers(matches);
}

export function propagateWalkovers(matches: Match[]): Match[] {
  const updated = [...matches];
  const walkovers = updated.filter((m) => m.status === 'walkover' && m.winnerId);

  for (const m of walkovers) {
    const nextRound = m.roundIndex + 1;
    const nextMatchIndex = Math.floor(m.matchIndex / 2);
    const slot = m.matchIndex % 2 === 0 ? 'player1Id' : 'player2Id';
    const nextMatch = updated.find(
      (nm) => nm.roundIndex === nextRound && nm.matchIndex === nextMatchIndex,
    );
    if (nextMatch) {
      if (slot === 'player1Id') nextMatch.player1Id = m.winnerId;
      else nextMatch.player2Id = m.winnerId;
    }
  }

  return updated;
}

export function advanceWinner(
  matches: Match[],
  matchId: string,
  winnerId: string,
): Match[] {
  const updated = matches.map((m) => {
    if (m.id !== matchId) return m;
    return { ...m, winnerId, status: 'finalized' as const };
  });

  const finalized = updated.find((m) => m.id === matchId)!;
  const nextRound = finalized.roundIndex + 1;
  const nextMatchIndex = Math.floor(finalized.matchIndex / 2);
  const slot = finalized.matchIndex % 2 === 0 ? 'player1Id' : 'player2Id';

  return updated.map((m) => {
    if (m.roundIndex === nextRound && m.matchIndex === nextMatchIndex) {
      return { ...m, [slot]: winnerId };
    }
    return m;
  });
}

export function getRoundsCount(maxPlayers: number): number {
  return Math.log2(nextPowerOf2(maxPlayers));
}

export function getRoundName(roundIndex: number, totalRounds: number): string {
  const fromEnd = totalRounds - 1 - roundIndex;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-Final';
  if (fromEnd === 2) return 'Quarter-Final';
  return `Round of ${Math.pow(2, fromEnd + 1)}`;
}
