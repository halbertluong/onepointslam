/**
 * The per-registrant service fee charged on top of the entry, when neither the
 * tournament nor the school overrides it. Read it from here rather than
 * repeating the number — a stale literal silently undercharges.
 */
export const DEFAULT_SERVICE_FEE = 8.0;

export interface GoalBasedResult {
  entranceFeePerPlayer: number;
  totalRaised: number;
  playerCount: number;
}

export interface PlayerBasedResult {
  entranceFeePerPlayer: number;
  schoolRevenue: number;
}

export function calcGoalBased(
  fundraisingGoal: number,
  targetPlayerCount: number,
): GoalBasedResult {
  const entranceFeePerPlayer = fundraisingGoal / (targetPlayerCount || 1);
  return {
    entranceFeePerPlayer,
    totalRaised: fundraisingGoal,
    playerCount: targetPlayerCount,
  };
}

export function calcPlayerBased(
  entranceFeePerPlayer: number,
  targetPlayerCount: number,
): PlayerBasedResult {
  return {
    entranceFeePerPlayer,
    schoolRevenue: entranceFeePerPlayer * targetPlayerCount,
  };
}

/** Single source of truth: registration revenue + any donation contributions. */
export function calcRaised(
  playerCount: number,
  ticketPrice: number,
  donationTotal: number = 0,
): number {
  return playerCount * ticketPrice + donationTotal;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
