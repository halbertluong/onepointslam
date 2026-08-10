export const DEFAULT_PLATFORM_FEE = 5.0;

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
