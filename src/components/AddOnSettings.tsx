'use client';

import {
  CHARGE_LABEL,
  DEFAULT_BUY_BACK_PRICE,
  DEFAULT_SECOND_SERVE_PRICE,
  DEFAULT_THIRD_SERVE_PRICE,
  escalationOf,
  priceLadderCents,
} from '@/lib/addOns';
import { formatCurrency } from '@/lib/pricing';
import type { ChargeKind, PriceEscalation, TournamentSettings } from '@/types';

/** One add-on's form state, kept as strings so typing feels natural. */
export interface AddOnConfig {
  enabled: boolean;
  price: string;
  mode: PriceEscalation['mode'];
  amount: string;
}
export type AddOnValues = Record<ChargeKind, AddOnConfig>;

const FIELDS = {
  second_serve: { allow: 'allowSecondServe', price: 'secondServePrice', esc: 'secondServeEscalation' },
  third_serve: { allow: 'allowThirdServe', price: 'thirdServePrice', esc: 'thirdServeEscalation' },
  buy_back: { allow: 'allowBuyBack', price: 'buyBackPrice', esc: 'buyBackEscalation' },
} as const;

const FALLBACK: Record<ChargeKind, number> = {
  second_serve: DEFAULT_SECOND_SERVE_PRICE,
  third_serve: DEFAULT_THIRD_SERVE_PRICE,
  buy_back: DEFAULT_BUY_BACK_PRICE,
};

/** Form state from saved settings (a tournament with nothing saved gets the defaults). */
export function addOnValuesFromSettings(settings: Partial<TournamentSettings> | null | undefined): AddOnValues {
  const one = (kind: ChargeKind): AddOnConfig => {
    const esc = escalationOf(settings, kind);
    const savedPrice = (settings as Record<string, unknown> | null | undefined)?.[FIELDS[kind].price];
    return {
      // Read the raw flag, not addOnEnabled: the 3rd serve's own toggle should
      // keep its value while the 2nd serve is switched off.
      enabled: (settings as Record<string, unknown> | null | undefined)?.[FIELDS[kind].allow] !== false,
      price: typeof savedPrice === 'number' ? String(savedPrice) : '',
      mode: esc.mode,
      amount: esc.mode === 'none' ? '' : String(esc.amount),
    };
  };
  return { second_serve: one('second_serve'), third_serve: one('third_serve'), buy_back: one('buy_back') };
}

/** Converts form values into the settings patch (explicit booleans so an opt-out sticks). */
export function addOnPatch(v: AddOnValues): Partial<TournamentSettings> {
  const num = (raw: string) => {
    const n = parseFloat(raw);
    return !isNaN(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
  };
  const patch: Record<string, unknown> = {};
  (Object.keys(FIELDS) as ChargeKind[]).forEach((kind) => {
    const c = v[kind];
    const amount = parseFloat(c.amount);
    const valid = c.mode !== 'none' && !isNaN(amount) && amount > 0 && (c.mode === 'add' || amount > 1 || amount === 1);
    patch[FIELDS[kind].allow] = c.enabled;
    patch[FIELDS[kind].price] = num(c.price);
    patch[FIELDS[kind].esc] = valid ? { mode: c.mode, amount: c.mode === 'add' ? Math.round(amount * 100) / 100 : amount } : undefined;
  });
  return patch as Partial<TournamentSettings>;
}

const COPY: Record<ChargeKind, { title: string; help: string }> = {
  second_serve: {
    title: '2nd serve',
    help: 'After a missed serve, the player can buy a second one.',
  },
  third_serve: {
    title: '3rd serve',
    help: 'After missing the 2nd serve too, the player can buy a third. Only offered once a 2nd serve has been bought.',
  },
  buy_back: {
    title: 'Buy back into the tournament',
    help: 'An eliminated player can pay to re-enter. The director places them in an open slot.',
  },
};

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Settings for the on-site add-ons: an on/off switch, a first-time price, and
 * an optional rule that makes the price climb each time the same player buys
 * it again, with a live preview of what one player would pay.
 */
export default function AddOnSettings({
  values,
  onChange,
  showSecondServe = true,
}: {
  values: AddOnValues;
  onChange: (next: AddOnValues) => void;
  /** Serves only exist in tennis; other sports just get the buy-back. */
  showSecondServe?: boolean;
}) {
  const kinds: ChargeKind[] = showSecondServe ? ['second_serve', 'third_serve', 'buy_back'] : ['buy_back'];
  const patchOf = (kind: ChargeKind, p: Partial<AddOnConfig>) => onChange({ ...values, [kind]: { ...values[kind], ...p } });

  return (
    <div className="space-y-3">
      {kinds.map((kind) => {
        const c = values[kind];
        const blocked = kind === 'third_serve' && !values.second_serve.enabled;
        const on = c.enabled && !blocked;
        // Preview straight from the form state, through the same pricing code the app charges with.
        const preview = addOnPatch(values);
        const ladder = priceLadderCents(preview, kind, 4);
        const stepNoun = kind === 'buy_back' ? 'buy-back' : `${CHARGE_LABEL[kind]}`;
        const mode = c.mode;

        return (
          <div key={kind} className={`rounded-xl border p-4 space-y-3 ${on ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50'}`}>
            <label className={`flex items-start gap-3 ${blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={on}
                disabled={blocked}
                onChange={(e) => patchOf(kind, { enabled: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-700">Allow {COPY[kind].title}</span>
                <span className="block text-xs text-slate-400 mt-0.5">
                  {blocked ? 'Turn on the 2nd serve first — a 3rd serve builds on it.' : COPY[kind].help}
                </span>
              </span>
            </label>

            {on && (
              <div className="pl-7 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">First time a player buys it</label>
                    <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <span className="px-2.5 text-sm text-slate-400 bg-slate-50 self-stretch flex items-center">$</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={c.price}
                        placeholder={String(FALLBACK[kind])}
                        onChange={(e) => patchOf(kind, { price: e.target.value })}
                        aria-label={`${COPY[kind].title} price`}
                        className="w-full px-3 py-2 text-sm focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Each time after that</label>
                    <select
                      value={mode}
                      onChange={(e) => patchOf(kind, { mode: e.target.value as PriceEscalation['mode'], amount: e.target.value === 'none' ? '' : c.amount })}
                      aria-label={`${COPY[kind].title} repeat pricing`}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none"
                    >
                      <option value="none">Price stays the same</option>
                      <option value="add">Goes up by a set amount</option>
                      <option value="multiply">Multiplies (gets steeper)</option>
                    </select>
                  </div>
                </div>

                {mode !== 'none' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">
                      {mode === 'add' ? 'Add' : 'Multiply by'}
                    </span>
                    <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <span className="px-2.5 text-sm text-slate-400 bg-slate-50 self-stretch flex items-center">{mode === 'add' ? '+ $' : '×'}</span>
                      <input
                        type="number" min={mode === 'add' ? '0' : '1'} step={mode === 'add' ? '0.01' : '0.05'}
                        value={c.amount}
                        placeholder={mode === 'add' ? '5' : '1.5'}
                        onChange={(e) => patchOf(kind, { amount: e.target.value })}
                        aria-label={`${COPY[kind].title} ${mode === 'add' ? 'increase' : 'multiplier'}`}
                        className="w-24 px-3 py-2 text-sm focus:outline-none"
                      />
                    </div>
                    <span className="text-xs text-slate-400">
                      for every {stepNoun} the player already bought
                    </span>
                  </div>
                )}

                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">What one player pays</p>
                  <p className="text-sm text-slate-700 flex flex-wrap gap-x-1.5 gap-y-0.5">
                    {ladder.map((cents, i) => (
                      <span key={i} className="whitespace-nowrap">
                        <span className="text-slate-400">{ordinal(i + 1)}</span>{' '}
                        <strong>{formatCurrency(cents / 100)}</strong>
                        {i < ladder.length - 1 && <span className="text-slate-300"> →</span>}
                      </span>
                    ))}
                    {mode !== 'none' && <span className="text-slate-400">…</span>}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
