import type { ChargeKind, PlayerCharge, SettlementMethod } from '@/types';

/**
 * On-site add-ons — a bought 2nd serve after a fault, and buying back into the
 * tournament after a loss. Both are opt-out: tournaments that predate the
 * settings keep working, and only an explicit `false` takes a feature away.
 * Fees accrue to a per-player balance that is collected at the end of the event.
 */
export const DEFAULT_SECOND_SERVE_PRICE = 10;
export const DEFAULT_BUY_BACK_PRICE = 20;

type SettingsLike = Record<string, unknown> | { allowSecondServe?: boolean; allowBuyBack?: boolean } | null | undefined;

export function secondServeEnabled(settings: SettingsLike): boolean {
  return (settings as { allowSecondServe?: unknown } | null | undefined)?.allowSecondServe !== false;
}

export function buyBackEnabled(settings: SettingsLike): boolean {
  return (settings as { allowBuyBack?: unknown } | null | undefined)?.allowBuyBack !== false;
}

function priceOf(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

export function secondServePrice(settings: SettingsLike): number {
  return priceOf((settings as { secondServePrice?: unknown } | null | undefined)?.secondServePrice, DEFAULT_SECOND_SERVE_PRICE);
}

export function buyBackPrice(settings: SettingsLike): number {
  return priceOf((settings as { buyBackPrice?: unknown } | null | undefined)?.buyBackPrice, DEFAULT_BUY_BACK_PRICE);
}

export function chargePriceCents(kind: ChargeKind, settings: SettingsLike): number {
  return Math.round((kind === 'second_serve' ? secondServePrice(settings) : buyBackPrice(settings)) * 100);
}

export const CHARGE_LABEL: Record<ChargeKind, string> = {
  second_serve: '2nd serve',
  buy_back: 'Buy-back',
};

export const SETTLEMENT_LABEL: Record<SettlementMethod, string> = {
  stripe: 'Stripe',
  cash: 'Cash',
  check: 'Check',
  donation: 'School donation page',
};

/** Outstanding (unsettled) cents per player. */
export function outstandingByPlayer(charges: PlayerCharge[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of charges) {
    if (!c.settledAt) out[c.playerId] = (out[c.playerId] ?? 0) + c.amountCents;
  }
  return out;
}
