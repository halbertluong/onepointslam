import type { SupabaseClient } from '@supabase/supabase-js';
import { getSiteUrl } from './siteUrl';

/**
 * Moves a reservation from `pending_registrations` into `players` once its
 * payment has actually succeeded.
 *
 * This is the only place that promotion happens — both the Stripe webhook
 * (the source of truth) and the payer's own post-payment ping call it, so
 * there is exactly one answer to "what does completing a payment do to the
 * database" rather than two that could drift apart. Both callers are free to
 * call it more than once for the same payment; it is built to be safe to
 * repeat.
 *
 * Callers must already know the PaymentIntent succeeded — this function only
 * handles the database side of the move, not Stripe verification.
 */
export interface PromotionResult {
  /** A new players row was created from the reservation. */
  promoted: boolean;
  /** Already handled by an earlier call (webhook and ping raced, or this ran twice). */
  alreadyDone: boolean;
  playerId?: string;
  error?: string;
}

export async function promotePendingRegistration(
  admin: SupabaseClient,
  paymentIntentId: string,
): Promise<PromotionResult> {
  // If a player already exists for this payment, promotion already happened —
  // just clear out the reservation row if one is still sitting there (the
  // webhook and the client ping can both reach this point for the same
  // payment, and this makes the second call a no-op instead of a duplicate).
  const { data: existingPlayer } = await admin
    .from('players')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (existingPlayer) {
    await admin.from('pending_registrations').delete().eq('stripe_payment_intent_id', paymentIntentId);
    return { promoted: false, alreadyDone: true, playerId: existingPlayer.id };
  }

  const { data: pending } = await admin
    .from('pending_registrations')
    .select('*')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (!pending) {
    // No reservation to promote. Either the initial reservation write itself
    // failed (rare — create-intent cancels the PaymentIntent when that
    // happens, so this shouldn't have a succeeded payment behind it) or two
    // promotion attempts raced and the other one already deleted it. Either
    // way there is nothing here to do; the Payments tab's orphan check is
    // what catches a succeeded payment with no reservation and no player.
    return { promoted: false, alreadyDone: false };
  }

  const { data: inserted, error } = await admin
    .from('players')
    .insert({
      tournament_id: pending.tournament_id,
      full_name: pending.full_name,
      email: pending.email,
      gender: pending.gender,
      ntrp_rating: pending.ntrp_rating,
      utr_rating: pending.utr_rating,
      age: pending.age,
      skill_tier: pending.skill_tier,
      status: 'registered',
      payment_status: 'paid',
      stripe_payment_intent_id: paymentIntentId,
      user_id: pending.user_id,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      // Someone else registered this email while this payment was in flight
      // — an offline entry at the desk, most likely. The card is genuinely
      // charged and this reservation is the only record of it, so it is left
      // in place rather than deleted: the Payments tab will show a succeeded
      // payment with no matching player, which is exactly what a director
      // needs to see to sort out by hand (refund, or remove the duplicate).
      return { promoted: false, alreadyDone: false, error: 'That email is already registered under a different entry.' };
    }
    return { promoted: false, alreadyDone: false, error: error.message };
  }

  await admin.from('pending_registrations').delete().eq('id', pending.id);

  // Fire-and-forget: this is the only path a real, paid registration is
  // created from, so it's the single place to send the "you're in and
  // charged" email — mirrors the same call /api/registrations makes for the
  // free/offline-paid path, which never reaches here.
  fetch(`${getSiteUrl()}/api/email/registration-confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
    },
    body: JSON.stringify({ to: pending.email, playerId: inserted.id, tournamentId: pending.tournament_id }),
  }).catch(() => {});

  return { promoted: true, alreadyDone: false, playerId: inserted.id };
}
