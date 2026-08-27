const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  mock: boolean;
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

  const stripe = await import('stripe').then((m) => new m.default(STRIPE_SECRET_KEY!));

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
    ...(metadata ? { metadata } : {}),
  });
  return { clientSecret: intent.client_secret!, paymentIntentId: intent.id, mock: false };
}
