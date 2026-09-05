import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { couponsEnabled } from '@/lib/coupons';

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Read-only preview for the "Apply" button on the registration page: tells a
 * registrant whether a code is worth something before they commit to it,
 * without spending a use. The service-role client is required here since
 * coupons has no public-read RLS policy — codes and remaining balances aren't
 * meant to be enumerable by visitors.
 *
 * The actual redemption (which decrements the limit) happens atomically in
 * /api/payments/create-intent via the redeem_coupon function, right before the
 * amount to charge is computed — this route never reserves a use on its own,
 * so checking a code twice can't burn two of its uses.
 */
export async function POST(req: NextRequest) {
  let body: { tournamentId?: string; code?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ valid: false, error: 'Invalid JSON' }, { status: 400 }); }

  const { tournamentId, code } = body;
  if (!tournamentId || !code?.trim()) {
    return NextResponse.json({ valid: false, error: 'A coupon code is required' }, { status: 400 });
  }

  const db = admin();
  const { data: tournament } = await db
    .from('tournaments')
    .select('settings')
    .eq('id', tournamentId)
    .single();

  if (!tournament || !couponsEnabled(tournament.settings as Record<string, unknown> | null)) {
    return NextResponse.json({ valid: false, error: 'Coupon codes are not being accepted for this tournament.' }, { status: 403 });
  }

  const { data: coupon } = await db
    .from('coupons')
    .select('discount_cents, used_count, usage_limit')
    .eq('tournament_id', tournamentId)
    .eq('code', code.trim().toUpperCase())
    .maybeSingle();

  if (!coupon || coupon.used_count >= coupon.usage_limit) {
    return NextResponse.json({ valid: false, error: 'This coupon code is invalid or has been fully redeemed.' }, { status: 404 });
  }

  return NextResponse.json({ valid: true, discountCents: coupon.discount_cents });
}
