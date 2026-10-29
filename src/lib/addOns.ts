import type { ChargeKind, PlayerCharge, PriceEscalation, SettlementMethod, TournamentSettings } from '@/types';

/**
 * On-site add-ons — a bought 2nd serve after a fault, a 3rd serve after
 * faulting that, and buying back into the tournament after a loss. All are
 * opt-out: tournaments that predate the settings keep working, and only an
 * explicit `false` takes a feature away. Fees accrue to a per-player balance
 * collected at the end of the event.
 *
 * Each add-on has a base price and an optional escalation, so the more often
 * the same player buys the same add-on, the more it costs them. "Times
 * bought" is counted per player, per add-on, across the whole tournament.
 */
export const DEFAULT_SECOND_SERVE_PRICE = 10;
export const DEFAULT_THIRD_SERVE_PRICE = 20;
export const DEFAULT_BUY_BACK_PRICE = 20;

export const ADD_ON_KINDS: ChargeKind[] = ['second_serve', 'third_serve', 'buy_back'];
export const SERVE_KINDS = ['second_serve', 'third_serve'] as const;
export type ServeKind = (typeof SERVE_KINDS)[number];

type SettingsLike = Partial<TournamentSettings> | Record<string, unknown> | null | undefined;

const KEYS = {
  second_serve: { allow: 'allowSecondServe', price: 'secondServePrice', esc: 'secondServeEscalation', fallback: DEFAULT_SECOND_SERVE_PRICE },
  third_serve: { allow: 'allowThirdServe', price: 'thirdServePrice', esc: 'thirdServeEscalation', fallback: DEFAULT_THIRD_SERVE_PRICE },
  buy_back: { allow: 'allowBuyBack', price: 'buyBackPrice', esc: 'buyBackEscalation', fallback: DEFAULT_BUY_BACK_PRICE },
} as const;

function field(settings: SettingsLike, key: string): unknown {
  return (settings as Record<string, unknown> | null | undefined)?.[key];
}

/** Whether a given add-on can be bought. A 3rd serve also needs the 2nd serve on. */
export function addOnEnabled(settings: SettingsLike, kind: ChargeKind): boolean {
  if (field(settings, KEYS[kind].allow) === false) return false;
  if (kind === 'third_serve') return field(settings, KEYS.second_serve.allow) !== false;
  return true;
}

export const secondServeEnabled = (s: SettingsLike) => addOnEnabled(s, 'second_serve');
export const thirdServeEnabled = (s: SettingsLike) => addOnEnabled(s, 'third_serve');
export const buyBackEnabled = (s: SettingsLike) => addOnEnabled(s, 'buy_back');

/** Base price in dollars — what a player's first purchase costs. */
export function basePrice(settings: SettingsLike, kind: ChargeKind): number {
  const raw = field(settings, KEYS[kind].price);
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : KEYS[kind].fallback;
}

export function escalationOf(settings: SettingsLike, kind: ChargeKind): PriceEscalation {
  const raw = field(settings, KEYS[kind].esc) as Partial<PriceEscalation> | undefined;
  if (raw && (raw.mode === 'add' || raw.mode === 'multiply') && typeof raw.amount === 'number' && raw.amount > 0) {
    return { mode: raw.mode, amount: raw.amount };
  }
  return { mode: 'none', amount: 0 };
}

/** Price in cents for a player's next purchase, given how many of this add-on they've already bought. */
export function priceCentsForPurchase(settings: SettingsLike, kind: ChargeKind, priorCount: number): number {
  const base = basePrice(settings, kind);
  const { mode, amount } = escalationOf(settings, kind);
  const n = Math.max(0, priorCount);
  const dollars = mode === 'add' ? base + amount * n : mode === 'multiply' ? base * Math.pow(amount, n) : base;
  return Math.round(dollars * 100);
}

/** How many of this add-on a player has already bought (settled or not). */
export function priorPurchaseCount(charges: Pick<PlayerCharge, 'playerId' | 'kind'>[], playerId: string, kind: ChargeKind): number {
  return charges.filter((c) => c.playerId === playerId && c.kind === kind).length;
}

/** The next `steps` prices a player would pay, in cents — for the settings preview. */
export function priceLadderCents(settings: SettingsLike, kind: ChargeKind, steps = 4): number[] {
  return Array.from({ length: steps }, (_, i) => priceCentsForPurchase(settings, kind, i));
}

export const CHARGE_LABEL: Record<ChargeKind, string> = {
  second_serve: '2nd serve',
  third_serve: '3rd serve',
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
