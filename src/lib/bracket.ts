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

/**
 * Builds a single-elimination bracket, round 0 seeded from `slots`. A slot
 * left null next to a real opponent is a bye, but it is not resolved here —
 * a director can freely rearrange the draw (including anyone sitting on a
 * bye) for as long as the tournament stays in the editing phase, and a bye
 * that auto-walked-over at generation time left a stale advanced name behind
 * in round 1 whenever it was later dragged elsewhere. Byes are settled into
 * walkovers and advanced by `settleByeAdvancement`, called once the
 * tournament actually goes live.
 */
function buildSingleElimMatches(
  slots: (string | null)[],
  tournamentId: string,
  bracket: Match['bracket'],
): Match[] {
  const P = slots.length;
  const matches: Match[] = [];
  const matchesPerRound = P / 2;

  for (let i = 0; i < matchesPerRound; i++) {
    matches.push({
      id: `${tournamentId}-${bracket}-r0-${i}`,
      tournamentId,
      roundIndex: 0,
      matchIndex: i,
      player1Id: slots[i * 2],
      player2Id: slots[i * 2 + 1],
      serverPlayerId: null,
      winnerId: null,
      status: 'scheduled',
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

  return matches;
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

/**
 * Whether a "minor round" losers-bracket drop-in (a winners-bracket round
 * `wbRoundIndex` loser, at `wbMatchIndex`, landing via `wbLoserDestination`)
 * will ever get an opponent in the slot it's waiting on.
 *
 * That opponent is the survivor of the losers bracket's own "major round"
 * immediately before it — recursively, all the way back to round 0 — and
 * every one of those rounds is fed *exclusively* by round-0 winners-bracket
 * losers drawn from one contiguous block of main-bracket round-0 matches:
 * the same `2^wbRoundIndex` matches, starting at
 * `wbMatchIndex * 2^wbRoundIndex`, that feed winners-bracket round
 * `wbRoundIndex` at `wbMatchIndex` in the first place (standard balanced-
 * bracket indexing). A bye produces no loser, so if every match in that
 * block is a bye, that whole losers-bracket branch never receives anyone,
 * ever — the drop-in the loser is waiting to face doesn't exist and never
 * will, no matter how much later play happens elsewhere in the bracket.
 *
 * Byes only ever occur in round 0, and only there, so this only needs
 * checking for `wbRoundIndex >= 1` — round 0 itself drops in pairs handled
 * by `round0DropDestination`, where the equivalent check is "is the sibling
 * of this pair a bye", already handled separately in `pushRoundZeroDrop`.
 */
function minorRoundDropIsUnreachable(
  findMatch: (bracket: Match['bracket'], roundIndex: number, matchIndex: number) => Match | undefined,
  wbRoundIndex: number,
  wbMatchIndex: number,
): boolean {
  const blockSize = Math.pow(2, wbRoundIndex);
  const blockStart = wbMatchIndex * blockSize;
  for (let i = blockStart; i < blockStart + blockSize; i++) {
    const r0Match = findMatch('main', 0, i);
    const isBye = !!r0Match && (r0Match.player1Id == null || r0Match.player2Id == null);
    if (!isBye) return false;
  }
  return true;
}

export function generateBracket(
  players: Player[],
  settings: TournamentSettings,
  tournamentId: string,
): Match[] {
  const N = players.length;
  const format = settings?.bracketFormat ?? 'single_elimination';

  // The configured draw size is normally a floor, not a suggestion: a
  // 64-player draw with 20 entrants still gets 64 slots (the rest byes),
  // which is what makes resizing a draw possible at all (a director can set
  // the max ahead of registration closing, and late signups just fill open
  // slots via addPlayersToDraw without a full regeneration).
  //
  // Double elimination is the one exception: once byes fill half the draw or
  // more, main round 0 is nothing but byes, which means the losers bracket's
  // very first round never receives anyone — and downstream of that, the
  // routing that pairs winners-bracket losers off with each other has no one
  // real to pair them with. A double-elimination bracket that's more empty
  // than full can't be played to completion, so it's always sized tightly to
  // the actual field instead of the configured floor.
  const P = format === 'double_elimination'
    ? nextPowerOf2(N)
    : Math.max(nextPowerOf2(N), nextPowerOf2(settings?.maxPlayers ?? 0));

  // Seeded players keep their declared order; unseeded are shuffled so each
  // generation produces a fresh draw. Both then go through the standard
  // seeding layout, so slot i holds the player at seeding rank seedSlotOrder[i].
  const seeded = players.filter((p) => p.seedRating != null).sort((a, b) => (a.seedRating ?? 99) - (b.seedRating ?? 99));
  const unseeded = shuffle(players.filter((p) => p.seedRating == null));
  const ranked = [...seeded, ...unseeded];

  // Empty slots stay null — 'BYE' is an internal sentinel only, never written to the DB
  const slots: (string | null)[] = seedSlotOrder(P).map((seedNo) => ranked[seedNo - 1]?.id ?? null);

  const main = buildSingleElimMatches(slots, tournamentId, 'main');

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
 * Settles every still-open first-round bye in the main bracket into a
 * walkover and advances that winner into round 1. Deliberately not run at
 * generation (or redistribution) time: a bye resolved and propagated that
 * early left a stale, already-advanced name sitting in round 1 whenever a
 * director later dragged that player to a different slot in the Draw
 * Editor, since editing only ever patches the round-0 match itself. Instead
 * nothing is decided until the tournament actually goes live — the one
 * point past which the draw stops being rearranged — so this runs then.
 */
export function settleByeAdvancementLocal(matches: Match[]): Match[] {
  const settled = matches.map((m) => {
    if (m.bracket !== 'main' || m.roundIndex !== 0 || m.winnerId || m.status !== 'scheduled') return m;
    const isBye = (m.player1Id == null) !== (m.player2Id == null);
    if (!isBye) return m;
    return { ...m, winnerId: (m.player1Id ?? m.player2Id) as string, status: 'walkover' as const };
  });
  return propagateWalkovers(settled, 'main');
}

/** Same as `settleByeAdvancementLocal`, but returns only the matches that actually changed, for a caller that persists one row per change (e.g. to Supabase) instead of working on the whole Match[] in memory. */
export function settleByeAdvancement(matches: Match[]): AdvancementUpdate[] {
  const advanced = settleByeAdvancementLocal(matches);

  const updates: AdvancementUpdate[] = [];
  for (const m of advanced) {
    const before = matches.find((b) => b.id === m.id)!;
    if (before.winnerId !== m.winnerId || before.status !== m.status) {
      updates.push({ matchId: m.id, updates: { winnerId: m.winnerId, status: m.status } });
    } else if (before.player1Id !== m.player1Id || before.player2Id !== m.player2Id) {
      updates.push({ matchId: m.id, updates: { player1Id: m.player1Id, player2Id: m.player2Id } });
    }
  }
  return updates;
}

/**
 * Pushes a round-0 cross-bracket drop-in (a losers-bracket or consolation-
 * bracket round-0 slot receiving the loser of a main-bracket round-0 match),
 * plus — if this drop completes the slot — the forced walkover that follows.
 *
 * A round-0 slot in a secondary bracket is fed by exactly two main-bracket
 * round-0 matches (see `round0DropDestination`). If the *other* one of that
 * pair was itself a bye (no real opponent, so it never produces a loser to
 * drop in), this slot will only ever receive this one drop-in — it's a
 * permanent bye, decided the moment this loser lands, and nobody can ever
 * referee it to a decision otherwise. Detect that case and settle it
 * immediately: mark the slot's winner and advance it one round further, the
 * same way a generation-time bye would have. If both siblings are real
 * matches, the slot just waits, `scheduled`, for both drops to land and a
 * referee to play it normally — the common case, left untouched here.
 *
 * Only ever called with a genuine round-0 `sourceMatch` — a losers-bracket
 * "minor round" drop-in (winners-bracket round 1+) has its own equivalent
 * check in `minorRoundDropIsUnreachable`, since the sibling relationship here
 * is specific to how `round0DropDestination` pairs off round-0 losers and
 * doesn't mean anything for a later round.
 */
function pushRoundZeroDrop(
  updates: AdvancementUpdate[],
  findMatch: (bracket: Match['bracket'], roundIndex: number, matchIndex: number) => Match | undefined,
  dest: Match,
  drop: BracketDrop,
  loserId: string,
  sourceMatch: Match,
): void {
  const patch: Partial<Match> = { [drop.slot]: loserId };

  const siblingIndex = drop.slot === 'player1Id' ? sourceMatch.matchIndex + 1 : sourceMatch.matchIndex - 1;
  const sibling = findMatch('main', 0, siblingIndex);
  const siblingIsBye = !!sibling && (sibling.player1Id == null || sibling.player2Id == null);
  const forcedWalkover = siblingIsBye;
  if (forcedWalkover) {
    patch.winnerId = loserId;
    patch.status = 'walkover';
  }
  updates.push({ matchId: dest.id, updates: patch });

  if (forcedWalkover) {
    // Round 0 -> round 1 means different things in different brackets: the
    // losers bracket's round 0 is a "major" round, and a major round always
    // advances into the next ("minor") round at the *same* match index,
    // filling player1 — see the 'losers' branch of resolveAdvancement. Only
    // the consolation bracket (a standard single-elimination bracket) halves
    // the index every round the way `advanceWinner`/round-0 byes elsewhere
    // in this file do.
    const isLosersBracket = dest.bracket === 'losers';
    const fwdMatchIndex = isLosersBracket ? dest.matchIndex : Math.floor(dest.matchIndex / 2);
    const fwdSlot: 'player1Id' | 'player2Id' = isLosersBracket
      ? 'player1Id'
      : dest.matchIndex % 2 === 0 ? 'player1Id' : 'player2Id';
    const fwd = findMatch(dest.bracket, dest.roundIndex + 1, fwdMatchIndex);
    if (fwd) updates.push({ matchId: fwd.id, updates: { [fwdSlot]: loserId } });
  }
}

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
        if (winnersRounds === 1) {
          // A 2-entrant draw: there's only ever one winners-bracket match, so
          // no losers bracket exists at all (buildLosersBracket produces zero
          // rounds for it). The loser is the losers-bracket "champion" by
          // default — straight into the grand final's player2 slot.
          const gf = findMatch('grand_final', 0, 0);
          if (gf) updates.push({ matchId: gf.id, updates: { player2Id: loserId } });
        } else {
          // Winners-bracket final loser waits in the losers-bracket final slot
          // (player2 — the survivor of the losers bracket occupies player1).
          const lbFinalRound = 2 * (winnersRounds - 1) - 1;
          const lbFinal = findMatch('losers', lbFinalRound, 0);
          if (lbFinal) updates.push({ matchId: lbFinal.id, updates: { player2Id: loserId } });
        }
      } else if (match.roundIndex === 0) {
        const dest = wbLoserDestination(match.roundIndex, match.matchIndex, winnersRounds);
        if (dest) {
          const lbMatch = findMatch('losers', dest.roundIndex, dest.matchIndex);
          if (lbMatch) pushRoundZeroDrop(updates, findMatch, lbMatch, dest, loserId, match);
        }
      } else {
        // A "minor round" drop (winners-bracket round 1+). Unlike a round-0
        // drop, this always lands alone in player2 of an existing losers
        // match — there's no sibling pairing to settle here, only the
        // question of whether player1 will ever be able to arrive at all
        // (see minorRoundDropIsUnreachable). If not, this loser has already
        // beaten everyone that branch of the losers bracket could ever have
        // produced, by default — settle it now and send them on, the same
        // way a round-0 bye's forced walkover advances.
        const dest = wbLoserDestination(match.roundIndex, match.matchIndex, winnersRounds);
        if (dest) {
          const lbMatch = findMatch('losers', dest.roundIndex, dest.matchIndex);
          if (lbMatch) {
            const unreachable = minorRoundDropIsUnreachable(findMatch, match.roundIndex, match.matchIndex);
            const patch: Partial<Match> = { [dest.slot]: loserId };
            if (unreachable) {
              patch.winnerId = loserId;
              patch.status = 'walkover';
            }
            updates.push({ matchId: lbMatch.id, updates: patch });
            if (unreachable) {
              const fwdMatchIndex = Math.floor(lbMatch.matchIndex / 2);
              const fwdSlot = lbMatch.matchIndex % 2 === 0 ? 'player1Id' : 'player2Id';
              const fwd = findMatch(lbMatch.bracket, lbMatch.roundIndex + 1, fwdMatchIndex);
              if (fwd) updates.push({ matchId: fwd.id, updates: { [fwdSlot]: loserId } });
            }
          }
        }
      }
    }

    // Consolation format: round-0 losers feed the consolation bracket the
    // same way round-0 losers feed losers-bracket round 0 above. No-op
    // (findMatch returns undefined) for formats with no consolation bracket.
    if (match.bracket === 'main' && match.roundIndex === 0 && loserId) {
      const dest = round0DropDestination(match.matchIndex);
      const consMatch = findMatch('consolation', dest.roundIndex, dest.matchIndex);
      if (consMatch) pushRoundZeroDrop(updates, findMatch, consMatch, dest, loserId, match);
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
  if (winnersRounds === 1 && match.roundIndex === 0 && hasBracket('grand_final')) {
    // A 2-entrant draw has no losers bracket at all (hasBracket('losers') is
    // false — buildLosersBracket produced zero rows for it) — the winners-
    // bracket final's loser went straight into the grand final instead. Must
    // stay in sync with the matching case in resolveAdvancement.
    return { bracket: 'grand_final', roundIndex: 0, matchIndex: 0, slot: 'player2Id' };
  }
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
 * Where a winners-bracket final's WINNER was routed, for undo purposes.
 * Every other match's winner advances via the generic "next round of the
 * same bracket" cascade in `reverseWinner` — but there is no round
 * `winnersRounds` of the main bracket, so the winners-bracket final is the
 * one match whose winner is instead pushed straight into the grand final's
 * player1 slot, a special case in `resolveAdvancement` this mirrors. Returns
 * null for every other match.
 */
function winnerDropDestination(
  match: Match,
  winnersRounds: number,
  hasBracket: (bracket: Match['bracket']) => boolean,
): { bracket: Match['bracket']; roundIndex: number; matchIndex: number; slot: 'player1Id' | 'player2Id' } | null {
  if (match.bracket === 'main' && match.roundIndex === winnersRounds - 1 && hasBracket('grand_final')) {
    return { bracket: 'grand_final', roundIndex: 0, matchIndex: 0, slot: 'player1Id' };
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

  const hasBracket = (bracket: Match['bracket']) => matches.some((m) => m.bracket === bracket);

  // Same cascade, but for the loser's cross-bracket drop (double elim / consolation).
  const dropDest = match.bracket === 'main' && winnersRounds ? loserDropDestination(match, winnersRounds, hasBracket) : null;
  const dropMatch = dropDest
    ? updated.find((m) => m.bracket === dropDest.bracket && m.roundIndex === dropDest.roundIndex && m.matchIndex === dropDest.matchIndex)
    : null;
  if (dropMatch?.winnerId) updated = reverseWinner(updated, dropMatch.id, winnersRounds);

  // Same cascade again, but for the rare case where the winner's own
  // advancement isn't the generic "next round" case above (the
  // winners-bracket final, whose winner goes straight to the grand final).
  const winDest = winnersRounds ? winnerDropDestination(match, winnersRounds, hasBracket) : null;
  const winDestMatch = winDest
    ? updated.find((m) => m.bracket === winDest.bracket && m.roundIndex === winDest.roundIndex && m.matchIndex === winDest.matchIndex)
    : null;
  if (winDestMatch?.winnerId) updated = reverseWinner(updated, winDestMatch.id, winnersRounds);

  return updated.map((m) => {
    // A 2-entrant draw's winners-bracket final routes both its winner and its
    // loser into the very same grand-final match (player1 and player2
    // respectively — there's no losers bracket to hold the loser separately),
    // so more than one of the clears below can land on the same row; every
    // check here contributes to one accumulated patch instead of returning
    // early; and independently.
    let patch: Partial<Match> = {};

    // An undone match hasn't been played, so it keeps no record of how it was
    // played either — the toss/serve and per-sport result fields clear with the
    // winner. persistReversal writes the same reset to the database.
    if (m.id === matchId) {
      patch = {
        ...patch,
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
    if (m.bracket === match.bracket && m.roundIndex === nextRound && m.matchIndex === nextMatchIndex) {
      patch = { ...patch, [slot]: null };
    }
    if (dropDest && m.bracket === dropDest.bracket && m.roundIndex === dropDest.roundIndex && m.matchIndex === dropDest.matchIndex) {
      patch = { ...patch, [dropDest.slot]: null };
    }
    if (winDest && m.bracket === winDest.bracket && m.roundIndex === winDest.roundIndex && m.matchIndex === winDest.matchIndex) {
      patch = { ...patch, [winDest.slot]: null };
    }
    return Object.keys(patch).length > 0 ? { ...m, ...patch } : m;
  });
}

export function getRoundsCount(maxPlayers: number): number {
  return Math.log2(nextPowerOf2(maxPlayers));
}

/** Round count for a double-elimination losers bracket, given the main draw's max players. */
export function getLosersRoundsCount(maxPlayers: number): number {
  return 2 * (getRoundsCount(maxPlayers) - 1);
}

/**
 * Round count for a consolation bracket, given the main draw's max players.
 * It seeds from main round 0's losers — half as many players as the main
 * draw — so it always has exactly one fewer round than main. Without this,
 * a caller that reuses main's round count to label the consolation bracket
 * mislabels every round one size too big (e.g. a 32-draw's consolation
 * round 0, really a round of 16, showing as "Round of 32").
 */
export function getConsolationRoundsCount(maxPlayers: number): number {
  return getRoundsCount(maxPlayers) - 1;
}

/**
 * How many rounds of `bracket` actually exist in a set of already-generated
 * match rows, read straight from the data instead of recomputed from
 * `settings.maxPlayers`.
 *
 * Every one of the `get*RoundsCount` helpers above answers "how many rounds
 * would a draw of this configured size have" — the right question at
 * generation time, when there's no bracket yet to look at. Once a bracket
 * exists, `settings.maxPlayers` is no longer guaranteed to describe it:
 * double elimination sizes its draw to the actual field rather than the
 * configured floor (see `generateBracket`), so a director who configured a
 * 32-player draw and got 15 signups ends up with a real 16-slot bracket —
 * `getRoundsCount(32)` would answer 5 when the bracket in front of you only
 * has 4. Anything recomputing a round count for a bracket that already has
 * match rows (routing a result, or labeling a bracket panel) should read it
 * from those rows via this instead. Falls back to `fallback` for an empty or
 * not-yet-generated bracket, where there's nothing to derive it from.
 */
export function actualRoundsCount(matches: Match[], bracket: Match['bracket'], fallback: number): number {
  const roundIndexes = matches.filter((m) => m.bracket === bracket).map((m) => m.roundIndex);
  return roundIndexes.length > 0 ? Math.max(...roundIndexes) + 1 : fallback;
}

/**
 * Where a match belongs in queue order across bracket types, lowest first.
 * Within a single bracket, earlier rounds always come first. For a
 * consolation-format tournament, the consolation bracket's rounds are
 * interleaved two main-bracket rounds behind it — main R1, main R2,
 * consolation R1, main R3, consolation R2, main R4, consolation R3, ... —
 * instead of every consolation match waiting until the entire main bracket
 * is finished. Other bracket types (losers, grand_final) just use their own
 * round index, since nothing here asks them to interleave with anything.
 */
export function queueRoundPriority(bracket: Match['bracket'], roundIndex: number): number {
  if (bracket === 'consolation') return 2 * roundIndex + 2;
  return roundIndex <= 1 ? roundIndex : 2 * roundIndex - 1;
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
