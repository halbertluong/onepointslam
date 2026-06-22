export const SYSTEM_TECH_FEE = 5.0;

export interface PriceBreakdown {
  playerTotal: number;
  schoolRevenue: number;
  systemFee: number;
}

export function calcGoalBased(
  fundraisingGoal: number,
  targetPlayerCount: number,
  systemFee: number = SYSTEM_TECH_FEE,
): PriceBreakdown {
  const schoolRevenue = fundraisingGoal / targetPlayerCount;
  const playerTotal = schoolRevenue + systemFee;
  return { playerTotal, schoolRevenue, systemFee };
}

export function calcMarginBased(
  desiredMarginPerPlayer: number,
  systemFee: number = SYSTEM_TECH_FEE,
): PriceBreakdown {
  const playerTotal = desiredMarginPerPlayer + systemFee;
  return { playerTotal, schoolRevenue: desiredMarginPerPlayer, systemFee };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
