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

/** Builds a single-elimination bracket (round 0 seeded from `slots`, byes auto-walked-over) tagged with the given `bracket` structure name. */
function buildSingleElimMatches(
  slots: (string | null)[],
  tournamentId: string,
  bracket: Match['bracket'],
): Match[] {
  const P = slots.length;
  const matches: Match[] = [];
  const matchesPerRound = P / 2;

  for (let i = 0; i < matchesPerRound; i++) {
    const p1 = slots[i * 2];
    const p2 = slots[i * 2 + 1];
    const isByeMatch = p1 == null || p2 == null;

    matches.push({
      id: `${tournamentId}-${bracket}-r0-${i}`,
      tournamentId,
      roundIndex: 0,
      matchIndex: i,
      player1Id: p1,
      player2Id: p2,
      serverPlayerId: null,
      winnerId: isByeMatch ? (p1 ?? p2) : null,
      status: isByeMatch ? 'walkover' : 'scheduled',
      bracket,
      courtNumber: undefined,
    });
  }

  const totalRounds = Math.log2(P);
  for (let r = 1; r < totalRounds; r++) {
    const count = P / Math.pow(2, r + 1);
    for (let i = 0; i < count; i++) {
      matches.push({
        id: `${tournamentId}-${bracket}-r${r}-${i}`,
        tournamentId,
        roundIndex: r,
        matchIndex: i,
        player1Id: null,
        player2Id: null,
        serverPlayerId: null,
        winnerId: null,
        status: 'scheduled',
        bracket,
        courtNumber: undefined,
      });
    }
  }

  return propagateWalkovers(matches, bracket);
}

/**
 * Builds the losers bracket for double elimination. Round r (r >= 1) of the
 * winners bracket is "odd" round `2r-1` here (minor round: survivors from the
 * previous round face freshly-dropped winners-bracket losers); every other
 * round is "even" (major round: survivors play each other, halving the
 * field). See `wbLoserDestination` for the matching drop-in math — both must
 * stay in sync.
 *
 * Simplification: opponents are paired in plain index order, so it's
 * possible (though uncommon in small draws) for two players to face a
 * rematch immediately after meeting in the winners bracket. Real
 * tournament-software implementations avoid this with extra placement logic;
 * out of scope here.
 */
function buildLosersBracket(winnersRounds: number, tournamentId: string): Match[] {
  const lbRoundsTotal = 2 * (winnersRounds - 1);
  const matches: Match[] = [];
  let count = Math.pow(2, winnersRounds - 1) / 2; // P/4

  for (let r = 0; r < lbRoundsTotal; r++) {
    if (r > 0 && r % 2 === 0) count = count / 2; // major round halves
    for (let i = 0; i < count; i++) {
      matches.push({
        id: `${tournamentId}-losers-r${r}-${i}`,
        tournamentId,
        roundIndex: r,
        matchIndex: i,
        player1Id: null,
        player2Id: null,
        serverPlayerId: null,
        winnerId: null,
        status: 'scheduled',
        bracket: 'losers',
        courtNumber: undefined,
      });
    }
  }
  return matches;
}

type BracketDrop = { roundIndex: number; matchIndex: number; slot: 'player1Id' | 'player2Id' };

/**
 * Round-0 losers of any single-elim bracket pair off directly against each
 * other in round 0 of whatever secondary bracket they drop into — used both
 * by the losers bracket (double elimination) and the consolation bracket.
 */
function round0DropDestination(matchIndex: number): BracketDrop {
  return {
    roundIndex: 0,
    matchIndex: Math.floor(matchIndex / 2),
    slot: matchIndex % 2 === 0 ? 'player1Id' : 'player2Id',
  };
}

/**
 * For a winners-bracket match at (roundIndex, matchIndex) in a bracket with
 * `winnersRounds` rounds total, returns where its loser drops into the
 * losers bracket — round 0 losers pair off via `round0DropDestination`;
 * every other round's loser fills the player2 slot of a "minor" losers
 * round. Must stay in sync with `buildLosersBracket`. Returns null for the
 * winners-bracket final, whose loser goes to the losers-bracket final
 * directly (handled as a special case in `resolveAdvancement`).
 */
function wbLoserDestination(
  roundIndex: number,
  matchIndex: number,
  winnersRounds: number,
): BracketDrop | null {
  if (roundIndex >= winnersRounds - 1) return null;
  if (roundIndex === 0) return round0DropDestination(matchIndex);
  return { roundIndex: 2 * roundIndex - 1, matchIndex, slot: 'player2Id' };
}

export function generateBracket(
  players: Player[],
  settings: TournamentSettings,
  tournamentId: string,
): Match[] {
  const N = players.length;
  // The configured draw size is a floor, not a suggestion: a 64-player draw with
  // 20 entrants still gets 64 slots (the rest byes), which is what makes
  // resizing a draw possible at all. Always rounded up to a power of two, and
  // never smaller than the field actually needs.
  const P = Math.max(nextPowerOf2(N), nextPowerOf2(settings?.maxPlayers ?? 0));

  // Seeded players keep their declared order; unseeded are shuffled so each
  // generation produces a fresh draw. Both then go through the standard
  // seeding layout, so slot i holds the player at seeding rank seedSlotOrder[i].
  const seeded = players.filter((p) => p.seedRating != null).sort((a, b) => (a.seedRating ?? 99) - (b.seedRating ?? 99));
  const unseeded = shuffle(players.filter((p) => p.seedRating == null));
  const ranked = [...seeded, ...unseeded];

  // Empty slots stay null — 'BYE' is an internal sentinel only, never written to the DB
  const slots: (string | null)[] = seedSlotOrder(P).map((seedNo) => ranked[seedNo - 1]?.id ?? null);

  const main = buildSingleElimMatches(slots, tournamentId, 'main');
  const format = settings?.bracketFormat ?? 'single_elimination';

  if (format === 'consolation') {
    // Round-0 losers of the main bracket feed a second, independent
    // single-elim bracket — but round 0 hasn't been played yet at generation
    // time, so (like the losers bracket in double elimination) it starts
    // fully empty and fills in via resolveAdvancement as those results come
    // in. A round-0 walkover has no loser, so that slot stays a permanent
    // bye, which an all-null starting slot already represents correctly.
    const round0Count = main.filter((m) => m.roundIndex === 0).length;
    const consolation = buildSingleElimMatches(new Array(round0Count).fill(null), tournamentId, 'consolation');
    return [...main, ...consolation];
  }

  if (format === 'double_elimination') {
    const winnersRounds = Math.log2(P);
    // Losers-bracket rounds all start empty — including round 0, since main
    // round-0 matches aren't decided yet at generation time. They fill in as
    // real results come in via resolveAdvancement, the same way the
    // consolation bracket's later rounds do (round-0 walkovers have no real
    // loser, so nothing to route from them either).
    const losers = buildLosersBracket(winnersRounds, tournamentId);

    const grandFinal: Match = {
      id: `${tournamentId}-grand_final-r0-0`,
      tournamentId,
      roundIndex: 0,
      matchIndex: 0,
      player1Id: null,
      player2Id: null,
      serverPlayerId: null,
      winnerId: null,
      status: 'scheduled',
      bracket: 'grand_final',
      courtNumber: undefined,
    };
    const grandFinalReset: Match = { ...grandFinal, id: `${tournamentId}-grand_final-r0-1`, matchIndex: 1 };

    return [...main, ...propagateWalkovers(losers, 'losers'), grandFinal, grandFinalReset];
  }

  return main;
}

export function propagateWalkovers(matches: Match[], bracket?: Match['bracket']): Match[] {
  const updated = [...matches];
  const walkovers = updated.filter((m) => m.status === 'walkover' && m.winnerId && (!bracket || m.bracket === bracket));

  for (const m of walkovers) {
    const nextRound = m.roundIndex + 1;
    const nextMatchIndex = Math.floor(m.matchIndex / 2);
    const slot = m.matchIndex % 2 === 0 ? 'player1Id' : 'player2Id';
    const nextMatch = updated.find(
      (nm) => nm.roundIndex === nextRound && nm.matchIndex === nextMatchIndex && (!bracket || nm.bracket === bracket),
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
    if (m.bracket === finalized.bracket && m.roundIndex === nextRound && m.matchIndex === nextMatchIndex) {
      return { ...m, [slot]: winnerId };
    }
    return m;
  });
}

/**
 * A single database patch to apply as part of resolving a match result.
 * `updates` uses camelCase Match field names — callers translate to their
 * own column-naming convention when persisting.
 */
export type AdvancementUpdate = { matchId: string; updates: Partial<Match> };

/**
 * Computes every downstream match update triggered by declaring a winner (and,
 * for double elimination, the corresponding loser) of `match`. Centralizes the
 * bracket-topology math (winners-bracket advancement, losers-bracket
 * advancement, winners→losers loser drop-in, and grand-final / bracket-reset
 * handling) that used to be duplicated per-sport in the referee console.
 *
 * Does not mutate `allMatches` — callers persist the returned updates and
 * re-fetch, matching the existing Supabase `.update()` pattern.
 */
export function resolveAdvancement(
  allMatches: Match[],
  match: Match,
  winnerId: string,
  loserId: string | null,
  winnersRounds: number,
): AdvancementUpdate[] {
  const updates: AdvancementUpdate[] = [
    { matchId: match.id, updates: { winnerId, loserId, status: 'finalized' } },
  ];

  const findMatch = (bracket: Match['bracket'], roundIndex: number, matchIndex: number) =>
    allMatches.find((m) => m.bracket === bracket && m.roundIndex === roundIndex && m.matchIndex === matchIndex);

  if (match.bracket === 'main' || match.bracket === 'consolation') {
    const nextRound = match.roundIndex + 1;
    const nextMatchIndex = Math.floor(match.matchIndex / 2);
    const slot = match.matchIndex % 2 === 0 ? 'player1Id' : 'player2Id';
    const next = findMatch(match.bracket, nextRound, nextMatchIndex);
    if (next) updates.push({ matchId: next.id, updates: { [slot]: winnerId } });

    // Double elimination: the winners-bracket loser drops into the losers bracket.
    if (match.bracket === 'main' && loserId) {
      if (match.roundIndex === winnersRounds - 1) {
        // Winners-bracket final loser waits in the losers-bracket final slot
        // (player2 — the survivor of the losers bracket occupies player1).
        const lbFinalRound = 2 * (winnersRounds - 1) - 1;
        const lbFinal = findMatch('losers', lbFinalRound, 0);
        if (lbFinal) updates.push({ matchId: lbFinal.id, updates: { player2Id: loserId } });
      } else {
        const dest = wbLoserDestination(match.roundIndex, match.matchIndex, winnersRounds);
        if (dest) {
          const lbMatch = findMatch('losers', dest.roundIndex, dest.matchIndex);
          if (lbMatch) updates.push({ matchId: lbMatch.id, updates: { [dest.slot]: loserId } });
        }
      }
    }

    // Consolation format: round-0 losers feed the consolation bracket the
    // same way round-0 losers feed losers-bracket round 0 above. No-op
    // (findMatch returns undefined) for formats with no consolation bracket.
    if (match.bracket === 'main' && match.roundIndex === 0 && loserId) {
      const dest = round0DropDestination(match.matchIndex);
      const consMatch = findMatch('consolation', dest.roundIndex, dest.matchIndex);
      if (consMatch) updates.push({ matchId: consMatch.id, updates: { [dest.slot]: loserId } });
    }

    // Winners-bracket final winner feeds the grand final (player1 slot).
    if (match.bracket === 'main' && match.roundIndex === winnersRounds - 1) {
      const gf = findMatch('grand_final', 0, 0);
      if (gf) updates.push({ matchId: gf.id, updates: { player1Id: winnerId } });
    }
    return updates;
  }

  if (match.bracket === 'losers') {
    const lbRoundsTotal = 2 * (winnersRounds - 1);
    const isLastLbRound = match.roundIndex === lbRoundsTotal - 1;
    if (isLastLbRound) {
      const gf = findMatch('grand_final', 0, 0);
      if (gf) updates.push({ matchId: gf.id, updates: { player2Id: winnerId } });
      return updates;
    }
    const nextRoundIsMajor = (match.roundIndex + 1) % 2 === 0;
    const nextRound = match.roundIndex + 1;
    if (nextRoundIsMajor) {
      const nextMatchIndex = Math.floor(match.matchIndex / 2);
      const slot = match.matchIndex % 2 === 0 ? 'player1Id' : 'player2Id';
      const next = findMatch('losers', nextRound, nextMatchIndex);
      if (next) updates.push({ matchId: next.id, updates: { [slot]: winnerId } });
    } else {
      // Minor round: the survivor carries forward into player1 of the same match index.
      const next = findMatch('losers', nextRound, match.matchIndex);
      if (next) updates.push({ matchId: next.id, updates: { player1Id: winnerId } });
    }
    return updates;
  }

  if (match.bracket === 'grand_final') {
    if (match.matchIndex === 0 && winnerId === match.player2Id) {
      // The losers-bracket finalist beat the winners-bracket champion in game
      // 1 — that's the champion's first loss, so a bracket reset is required:
      // activate the decisive second grand-final match between the same two.
      const reset = findMatch('grand_final', 0, 1);
      if (reset) {
        updates.push({ matchId: reset.id, updates: { player1Id: match.player1Id, player2Id: match.player2Id } });
      }
    }
    return updates;
  }

  return updates;
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

/**
 * Where a winners-bracket match's loser was dropped, for undo purposes —
 * mirrors the forward routing in `resolveAdvancement` but only needs the
 * destination (roundIndex/matchIndex/slot), not the player id, since it's
 * clearing a slot rather than filling one.
 *
 * Which secondary bracket a loser went to is decided by which one the
 * tournament actually has, not by round arithmetic: a round-0 loser drops
 * the same way under both formats, so the maths alone cannot tell them
 * apart. `resolveAdvancement` routes forward by looking for the destination
 * match and doing nothing when it is absent, and `hasBracket` is how this
 * side stays in step with it. Returns null for single elimination, which has
 * no secondary bracket, and for a non-round-0 match under consolation, which
 * only ever receives round-0 losers.
 */
function loserDropDestination(
  match: Match,
  winnersRounds: number,
  hasBracket: (bracket: Match['bracket']) => boolean,
): { bracket: Match['bracket']; roundIndex: number; matchIndex: number; slot: 'player1Id' | 'player2Id' } | null {
  if (hasBracket('losers')) {
    if (match.roundIndex === winnersRounds - 1) {
      return { bracket: 'losers', roundIndex: 2 * (winnersRounds - 1) - 1, matchIndex: 0, slot: 'player2Id' };
    }
    const dest = wbLoserDestination(match.roundIndex, match.matchIndex, winnersRounds);
    return dest ? { bracket: 'losers', ...dest } : null;
  }
  if (hasBracket('consolation') && match.roundIndex === 0) {
    return { bracket: 'consolation', ...round0DropDestination(match.matchIndex) };
  }
  return null;
}

/**
 * Undoes a match result, including its knock-on effects: the winner is
 * pulled back out of whatever match it had advanced into (recursively, so a
 * result that outlived its own inputs never lingers), and — when
 * `winnersRounds` is given, for a double-elimination or consolation
 * winners-bracket match — the loser is pulled back out of the losers or
 * consolation bracket slot it was dropped into, with the same recursive
 * unwind if that slot's match had already been played.
 */
export function reverseWinner(matches: Match[], matchId: string, winnersRounds?: number): Match[] {
  const match = matches.find((m) => m.id === matchId);
  if (!match?.winnerId) return matches;

  const nextRound = match.roundIndex + 1;
  const nextMatchIndex = Math.floor(match.matchIndex / 2);
  const slot = match.matchIndex % 2 === 0 ? 'player1Id' : 'player2Id';

  const nextMatch = matches.find((m) => m.bracket === match.bracket && m.roundIndex === nextRound && m.matchIndex === nextMatchIndex);
  // Undoing this result pulls its winner back out of the next match, so any
  // result already recorded there is void — whoever won it did so against a
  // player who is no longer in that slot. Unwind it too, and recursively on up
  // the bracket, so the draw never keeps a result that outlived its own inputs.
  let updated = nextMatch?.winnerId
    ? reverseWinner(matches, nextMatch.id, winnersRounds)
    : [...matches];

  // Same cascade, but for the loser's cross-bracket drop (double elim / consolation).
  const dropDest =
    match.bracket === 'main' && winnersRounds
      ? loserDropDestination(match, winnersRounds, (bracket) => matches.some((m) => m.bracket === bracket))
      : null;
  const dropMatch = dropDest
    ? updated.find((m) => m.bracket === dropDest.bracket && m.roundIndex === dropDest.roundIndex && m.matchIndex === dropDest.matchIndex)
    : null;
  if (dropMatch?.winnerId) updated = reverseWinner(updated, dropMatch.id, winnersRounds);

  return updated.map((m) => {
    // An undone match hasn't been played, so it keeps no record of how it was
    // played either — the toss/serve and per-sport result fields clear with the
    // winner. persistReversal writes the same reset to the database.
    if (m.id === matchId) {
      return {
        ...m,
        winnerId: null,
        loserId: null,
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
    if (m.bracket === match.bracket && m.roundIndex === nextRound && m.matchIndex === nextMatchIndex) return { ...m, [slot]: null };
    if (dropDest && m.bracket === dropDest.bracket && m.roundIndex === dropDest.roundIndex && m.matchIndex === dropDest.matchIndex) {
      return { ...m, [dropDest.slot]: null };
    }
    return m;
  });
}

export function getRoundsCount(maxPlayers: number): number {
  return Math.log2(nextPowerOf2(maxPlayers));
}

/** Round count for a double-elimination losers bracket, given the main draw's max players. */
export function getLosersRoundsCount(maxPlayers: number): number {
  return 2 * (getRoundsCount(maxPlayers) - 1);
}

/** Translates a partial Match (camelCase) into the matches table's snake_case columns, for persisting `resolveAdvancement` results. */
export function matchUpdatesToColumns(updates: Partial<Match>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('winnerId' in updates) out.winner_id = updates.winnerId;
  if ('loserId' in updates) out.loser_id = updates.loserId;
  if ('status' in updates) out.status = updates.status;
  if ('player1Id' in updates) out.player1_id = updates.player1Id;
  if ('player2Id' in updates) out.player2_id = updates.player2Id;
  return out;
}

export function getRoundName(roundIndex: number, totalRounds: number): string {
  const fromEnd = totalRounds - 1 - roundIndex;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-Final';
  if (fromEnd === 2) return 'Quarter-Final';
  return `Round of ${Math.pow(2, fromEnd + 1)}`;
}
