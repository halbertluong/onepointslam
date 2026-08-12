import type { Player, Match, TournamentSettings, KickOutcome, PossessionOutcome } from '@/types';

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
 * Standard single-elimination seeding order, generated for any bracket size.
 *
 * Returns one entry per bracket slot, in slot order, holding the 1-indexed
 * seed number that belongs in that slot. Built by the usual "fold" method:
 * start with [1, 2], then repeatedly replace every seed s in the list with
 * the pair (s, roundTotal + 1 - s), which doubles the field each pass.
 *
 * The result is the bracket every real tournament uses: seed 1 sits at the
 * top and seed 2 at the bottom so they can only meet in the final, 3 and 4
 * land in the opposite halves from each other (and away from 1 and 2), and
 * so on down the list — each seed is placed as far from its closest rivals
 * as the bracket allows, and every seed's first-round opponent is the
 * lowest-ranked player still available.
 *
 * e.g. size 8 -> [1, 8, 4, 5, 2, 7, 3, 6]
 *   round 1: 1v8, 4v5, 2v7, 3v6
 *   semis:   1v4, 2v3
 *   final:   1v2
 */
export function seedSlotOrder(bracketSize: number): number[] {
  let order = [1, 2];
  while (order.length < bracketSize) {
    const roundTotal = order.length * 2 + 1;
    const next: number[] = [];
    for (const seed of order) {
      next.push(seed, roundTotal - seed);
    }
    order = next;
  }
  return order.slice(0, bracketSize);
}

/**
 * Orders players into the seeding ranks used for bracket placement: explicitly
 * seeded players first (by their seed number), then everyone else strongest
 * first, so unseeded talent still gets spread across the draw rather than
 * clustered. Deterministic, so a director pressing "redistribute" twice gets
 * the same draw both times.
 */
export function rankPlayersForSeeding(players: Player[]): Player[] {
  const seeded = players
    .filter((p) => p.seedRating != null)
    .sort((a, b) => (a.seedRating ?? 99) - (b.seedRating ?? 99));
  const unseeded = players
    .filter((p) => p.seedRating == null)
    .sort((a, b) =>
      (b.ntrpRating ?? 0) - (a.ntrpRating ?? 0) ||
      (b.utrRating ?? 0) - (a.utrRating ?? 0) ||
      a.fullName.localeCompare(b.fullName),
    );
  return [...seeded, ...unseeded];
}

/**
 * Lays players out across a bracket's first-round slots using standard
 * tournament seeding. Slots with no player left to fill come back as null,
 * which the caller turns into a BYE — and because byes fall on the seeds'
 * opponents first, the top seeds are the ones who get them.
 */
export function distributeBySeeding(players: Player[], bracketSize: number): (string | null)[] {
  const ranked = rankPlayersForSeeding(players);
  return seedSlotOrder(bracketSize).map((seedNo) => ranked[seedNo - 1]?.id ?? null);
}

export function generateBracket(
  players: Player[],
  _settings: TournamentSettings,
  tournamentId: string,
): Match[] {
  const N = players.length;
  const P = nextPowerOf2(N);

  // Seeded players keep their declared order; unseeded are shuffled so each
  // generation produces a fresh draw. Both then go through the standard
  // seeding layout, so slot i holds the player at seeding rank seedSlotOrder[i].
  const seeded = players.filter((p) => p.seedRating != null).sort((a, b) => (a.seedRating ?? 99) - (b.seedRating ?? 99));
  const unseeded = shuffle(players.filter((p) => p.seedRating == null));
  const ranked = [...seeded, ...unseeded];

  // Empty slots stay null — 'BYE' is an internal sentinel only, never written to the DB
  const slots: (string | null)[] = seedSlotOrder(P).map((seedNo) => ranked[seedNo - 1]?.id ?? null);

  const matches: Match[] = [];
  const matchesPerRound = P / 2;

  // Round 0 (first round)
  for (let i = 0; i < matchesPerRound; i++) {
    const p1 = slots[i * 2];
    const p2 = slots[i * 2 + 1];
    const isByeMatch = p1 == null || p2 == null;

    matches.push({
      id: `${tournamentId}-r0-${i}`,
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
        id: `${tournamentId}-r${r}-${i}`,
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

/**
 * One Goal Bowl (soccer): the winner follows directly from the kick outcome.
 * A goal advances the kicker; a miss or a save advances the keeper. There is
 * no tiebreaker — the outcome is always decisive.
 */
export function determineOneGoalBowlWinner(
  kickerPlayerId: string,
  keeperPlayerId: string,
  outcome: KickOutcome,
): string {
  return outcome === 'goal' ? kickerPlayerId : keeperPlayerId;
}

/**
 * One Point Bowl (basketball): the winner follows directly from the
 * possession outcome. A made shot advances the offensive player; a miss,
 * steal, or block advances the defensive player. There is no tiebreaker —
 * the outcome is always decisive.
 */
export function determineOnePointBowlWinner(
  offensePlayerId: string,
  defensePlayerId: string,
  outcome: PossessionOutcome,
): string {
  return outcome === 'made' ? offensePlayerId : defensePlayerId;
}

export function reverseWinner(matches: Match[], matchId: string): Match[] {
  const match = matches.find((m) => m.id === matchId);
  if (!match?.winnerId) return matches;

  const nextRound = match.roundIndex + 1;
  const nextMatchIndex = Math.floor(match.matchIndex / 2);
  const slot = match.matchIndex % 2 === 0 ? 'player1Id' : 'player2Id';

  const nextMatch = matches.find((m) => m.roundIndex === nextRound && m.matchIndex === nextMatchIndex);
  // Undoing this result pulls its winner back out of the next match, so any
  // result already recorded there is void — whoever won it did so against a
  // player who is no longer in that slot. Unwind it too, and recursively on up
  // the bracket, so the draw never keeps a result that outlived its own inputs.
  const updated = nextMatch?.winnerId
    ? reverseWinner(matches, nextMatch.id)
    : [...matches];

  return updated.map((m) => {
    // An undone match hasn't been played, so it keeps no record of how it was
    // played either — the toss/serve and per-sport result fields clear with the
    // winner. persistReversal writes the same reset to the database.
    if (m.id === matchId) {
      return {
        ...m,
        winnerId: null,
        status: 'scheduled' as const,
        serverPlayerId: null,
        tossWinnerId: null,
        kickerPlayerId: null,
        keeperPlayerId: null,
        kickOutcome: null,
        coinFlipWinnerId: null,
        offensePlayerId: null,
        defensePlayerId: null,
        possessionOutcome: null,
      };
    }
    if (m.roundIndex === nextRound && m.matchIndex === nextMatchIndex) return { ...m, [slot]: null };
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
