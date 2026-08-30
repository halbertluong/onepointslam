import { NextResponse } from 'next/server';

// Temporary diagnostic: surfaces the raw underlying error when the Stripe SDK
// reports a connection failure, plus a plain fetch to api.stripe.com to
// separate "network unreachable" from "SDK problem". Returns no secrets —
// only booleans, key prefix, and error text. Remove once payments work.
export async function GET() {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  const result: Record<string, unknown> = {
    keyPresent: !!key,
    keyPrefix: key ? key.slice(0, 8) : null,
    keyLength: key.length,
    keyHasWhitespace: key !== key.trim(),
    nodeVersion: process.version,
  };

  // 1. Raw fetch to Stripe, no SDK involved
  try {
    const t0 = Date.now();
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${key.trim()}` },
      signal: AbortSignal.timeout(10000),
    });
    result.rawFetch = { ok: res.ok, status: res.status, ms: Date.now() - t0 };
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: { type?: string; message?: string } } | null;
      result.rawFetchError = body?.error?.type ?? null;
    }
  } catch (err) {
    const e = err as Error & { cause?: Error };
    result.rawFetch = { ok: false, error: e.message, cause: e.cause?.message ?? null, name: e.name };
  }

  // 2. Through the SDK exactly as the payment routes use it
  try {
    const { createStripeClient } = await import('@/lib/stripe');
    const stripe = await createStripeClient(key);
    const t0 = Date.now();
    await stripe.balance.retrieve();
    result.sdk = { ok: true, ms: Date.now() - t0 };
  } catch (err) {
    const e = err as Error & { type?: string; detail?: unknown; cause?: Error };
    result.sdk = {
      ok: false,
      name: e.name,
      type: e.type ?? null,
      message: e.message,
      detail: e.detail ? String(e.detail) : null,
      cause: e.cause?.message ?? null,
    };
  }

  return NextResponse.json(result);
}
