import { NextRequest, NextResponse } from 'next/server';
import { createPaymentIntent } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  let body: { amountCents?: number; tournamentId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { amountCents, tournamentId } = body;
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });
  if (!amountCents || amountCents < 50) {
    return NextResponse.json({ error: 'Minimum donation is $0.50' }, { status: 400 });
  }
  if (amountCents > 1_000_000) {
    return NextResponse.json({ error: 'Donation exceeds maximum allowed amount' }, { status: 400 });
  }

  try {
    // Donations go to the platform account (no Connect transfer for now)
    const result = await createPaymentIntent(amountCents, undefined, 0, { tournament_id: tournamentId });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment setup failed';
    console.error('[donate-intent]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
