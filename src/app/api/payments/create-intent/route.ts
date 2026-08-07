import { NextRequest, NextResponse } from 'next/server';
import { createPaymentIntent } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  let body: { amountCents?: number; tenantConnectAccountId?: string; applicationFeeCents?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { amountCents, tenantConnectAccountId, applicationFeeCents = 0 } = body;
  if (!amountCents || amountCents < 50) {
    return NextResponse.json({ error: 'amountCents must be at least 50' }, { status: 400 });
  }

  try {
    const result = await createPaymentIntent(amountCents, tenantConnectAccountId, applicationFeeCents);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment setup failed';
    console.error('[create-intent]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
