import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Whether a tournament's directors can create discount codes that registrants
 * redeem on the registration page before paying.
 *
 * Opt-in and default off, unlike allowDonations' opt-out: this feature never
 * existed before, so no tournament should suddenly start accepting codes it
 * was never configured with. Only an explicit `couponCodesEnabled: true`
 * turns it on.
 *
 * Shared by the Coupon Codes tab, the public registration flow, and the
 * validate/create-intent routes so none of them can disagree about whether
 * codes are being accepted right now.
 */
export function couponsEnabled(
  settings: { couponCodesEnabled?: boolean } | Record<string, unknown> | null | undefined,
): boolean {
  return (settings as { couponCodesEnabled?: unknown } | null | undefined)?.couponCodesEnabled === true;
}

/**
 * Gives back a coupon use that was reserved for a payment which never
 * completed (payment setup failed, a director dismissed the abandoned
 * reservation, or Stripe reported the charge declined/canceled).
 *
 * Races the release against every other caller that might reach for the same
 * reservation (the webhook and a director's dismiss click can both land on
 * the same row) by first claiming it with a conditional UPDATE — only the
 * caller that flips `coupon_released` from false to true goes on to call
 * release_coupon, so a reservation is never given back twice.
 */
export async function releasePendingCoupon(
  admin: SupabaseClient,
  match: { id: string } | { stripePaymentIntentId: string },
): Promise<void> {
  let query = admin
    .from('pending_registrations')
    .update({ coupon_released: true })
    .eq('coupon_released', false)
    .not('coupon_id', 'is', null);
  query = 'id' in match
    ? query.eq('id', match.id)
    : query.eq('stripe_payment_intent_id', match.stripePaymentIntentId);
  const { data } = await query.select('coupon_id');
  const couponId = (data?.[0] as { coupon_id?: string } | undefined)?.coupon_id;
  if (couponId) await admin.rpc('release_coupon', { p_coupon_id: couponId });
}
