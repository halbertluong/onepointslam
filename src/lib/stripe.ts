const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  mock: boolean;
}

export async function createPaymentIntent(
  amountCents: number,
  tenantConnectAccountId: string | undefined,
  applicationFeeCents: number,
): Promise<PaymentIntentResult> {
  if (!STRIPE_SECRET_KEY) {
    // Mock mode
    return {
      clientSecret: `mock_pi_${Date.now()}_secret_mock`,
      paymentIntentId: `mock_pi_${Date.now()}`,
      mock: true,
    };
  }

  const stripe = await import('stripe').then((m) => new m.default(STRIPE_SECRET_KEY!));

  const params: Parameters<typeof stripe.paymentIntents.create>[0] = {
    amount: amountCents,
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
  };

  if (tenantConnectAccountId) {
    params.application_fee_amount = applicationFeeCents;
    params.transfer_data = { destination: tenantConnectAccountId };
  }

  const intent = await stripe.paymentIntents.create(params);
  return { clientSecret: intent.client_secret!, paymentIntentId: intent.id, mock: false };
}
