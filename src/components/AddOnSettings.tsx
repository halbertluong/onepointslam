'use client';

import {
  DEFAULT_BUY_BACK_PRICE,
  DEFAULT_SECOND_SERVE_PRICE,
} from '@/lib/addOns';

export interface AddOnValues {
  allowSecondServe: boolean;
  secondServePrice: string;
  allowBuyBack: boolean;
  buyBackPrice: string;
}

/** Feature flags (and prices) for the on-site add-ons. Both default on. */
export default function AddOnSettings({
  values,
  onChange,
  showSecondServe = true,
}: {
  values: AddOnValues;
  onChange: (patch: Partial<AddOnValues>) => void;
  /** The 2nd serve only exists in tennis. */
  showSecondServe?: boolean;
}) {
  const rows: {
    key: 'second' | 'buyback';
    enabledKey: 'allowSecondServe' | 'allowBuyBack';
    priceKey: 'secondServePrice' | 'buyBackPrice';
    title: string;
    help: string;
    fallback: number;
  }[] = [
    ...(showSecondServe
      ? [{
          key: 'second' as const,
          enabledKey: 'allowSecondServe' as const,
          priceKey: 'secondServePrice' as const,
          title: 'Allow buying a 2nd serve',
          help: 'After a missed serve, the player can buy a second one. The fee is added to their balance, collected at the end of the event.',
          fallback: DEFAULT_SECOND_SERVE_PRICE,
        }]
      : []),
    {
      key: 'buyback',
      enabledKey: 'allowBuyBack',
      priceKey: 'buyBackPrice',
      title: 'Allow buying back into the tournament',
      help: 'An eliminated player can pay to re-enter. The director places them in an open slot, and the fee is added to their balance.',
      fallback: DEFAULT_BUY_BACK_PRICE,
    },
  ];

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key} className="rounded-xl border border-slate-200 p-3.5 space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={values[r.enabledKey]}
              onChange={(e) => onChange({ [r.enabledKey]: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-700">{r.title}</span>
              <span className="block text-xs text-slate-400 mt-0.5">{r.help}</span>
            </span>
          </label>
          {values[r.enabledKey] && (
            <div className="flex items-center gap-2 pl-7">
              <span className="text-xs font-semibold text-slate-500">Price</span>
              <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
                <span className="px-2.5 text-sm text-slate-400 bg-slate-50 self-stretch flex items-center">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={values[r.priceKey]}
                  placeholder={String(r.fallback)}
                  onChange={(e) => onChange({ [r.priceKey]: e.target.value })}
                  aria-label={`${r.title} price`}
                  className="w-24 px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Converts form values into the settings patch (explicit booleans so an opt-out sticks). */
export function addOnPatch(v: AddOnValues) {
  const num = (raw: string) => {
    const n = parseFloat(raw);
    return !isNaN(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
  };
  return {
    allowSecondServe: v.allowSecondServe,
    secondServePrice: num(v.secondServePrice),
    allowBuyBack: v.allowBuyBack,
    buyBackPrice: num(v.buyBackPrice),
  };
}
