import { NextResponse } from 'next/server';

/**
 * TEMPORARY. Confirms the deployed Stripe credentials actually work, so a
 * misconfiguration is caught here rather than by a registrant at the till.
 * Returns no secrets — only key prefixes, booleans, and error text.
 *
 * Remove once payments are confirmed working.
 */
export async function GET() {
  const sk = process.env.STRIPE_SECRET_KEY ?? '';
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

  // Both keys carry the same account fragment right after the mode prefix, so
  // comparing them catches a secret and publishable key from different Stripe
  // environments (a real risk when sandboxes each have their own key pair).
  const fragment = (key: string) => key.replace(/^(sk|pk)_(test|live)_/, '').slice(0, 16);
  const mode = (key: string) => (key.startsWith('sk_live_') || key.startsWith('pk_live_') ? 'live' : key ? 'test' : 'none');

  const result: Record<string, unknown> = {
    secret: {
      present: !!sk,
      prefix: sk.slice(0, 8),
      mode: mode(sk),
      hasNonAscii: [...sk].some((c) => c.charCodeAt(0) > 255),
    },
    publishable: {
      present: !!pk,
      prefix: pk.slice(0, 8),
      mode: mode(pk),
      hasNonAscii: [...pk].some((c) => c.charCodeAt(0) > 255),
    },
    keysMatchSameAccount: !!sk && !!pk && fragment(sk) === fragment(pk),
    modesMatch: mode(sk) === mode(pk),
  };

  // A live call is the only real proof the key is accepted by Stripe.
  try {
    const { createStripeClient } = await import('@/lib/stripe');
    const stripe = await createStripeClient(sk);
    const balance = await stripe.balance.retrieve();
    result.stripeCall = { ok: true, livemode: balance.livemode };
  } catch (err) {
    result.stripeCall = {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  return NextResponse.json(result);
}
