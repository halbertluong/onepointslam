const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  mock: boolean;
}

/**
 * A secret key that isn't sendable as an HTTP header fails in a badly
 * misleading way: the header can't be encoded, so `fetch` throws before any
 * request goes out, and the SDK reports that as
 * "An error occurred with our connection to Stripe. Request was retried 2
 * times." — which reads like a network outage rather than a bad key.
 *
 * The usual cause is copying the key out of the Stripe dashboard while it is
 * still masked, capturing the bullet characters (•, U+2022) instead of the
 * key. Checking for non-ASCII up front turns a day of chasing phantom network
 * problems into one obvious error message.
 */
function assertKeyIsSendable(key: string): void {
  const bad = [...key].find((ch) => ch.charCodeAt(0) > 255);
  if (bad) {
    throw new Error(
      `STRIPE_SECRET_KEY contains a non-ASCII character (${JSON.stringify(bad)}), so it cannot be ` +
        'sent as an HTTP header. It is most likely a masked value copied from the Stripe ' +
        'dashboard rather than the real key — re-copy it with "Reveal key" first.',
    );
  }
}

/** Every Stripe client is built here so key validation can't be skipped. */
export async function createStripeClient(key: string, apiVersion?: string) {
  assertKeyIsSendable(key);
  const { default: Stripe } = await import('stripe');
  return new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(apiVersion ? { apiVersion: apiVersion as any } : {}),
  });
}

/**
 * Every tenant shares this one platform Stripe account — there is no per-tenant
 * Stripe Connect account to onboard. Money for every tenant lands in the same
 * place; `metadata` is what ties a charge back to its tenant, tournament, and
 * registrant so it can be reconciled and paid out to the right school.
 */
export async function createPaymentIntent(
  amountCents: number,
  metadata?: Record<string, string>,
): Promise<PaymentIntentResult> {
  if (!STRIPE_SECRET_KEY) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('STRIPE_SECRET_KEY is not set — cannot process payments in production');
    }
    return {
      clientSecret: `mock_pi_${Date.now()}_secret_mock`,
      paymentIntentId: `mock_pi_${Date.now()}`,
      mock: true,
    };
  }

  const stripe = await createStripeClient(STRIPE_SECRET_KEY);

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
    ...(metadata ? { metadata } : {}),
  });
  return { clientSecret: intent.client_secret!, paymentIntentId: intent.id, mock: false };
}
