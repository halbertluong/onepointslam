import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Marks a player's add-on charges as paid by Stripe once a balance
 * PaymentIntent has succeeded. Only charges that existed when the intent was
 * created are settled — anything added to the balance afterwards stays open,
 * since it was never part of the amount the payer was shown.
 *
 * Callers must already know the PaymentIntent succeeded. Safe to call more
 * than once for the same intent (the webhook and the director's own client
 * both do): already-settled charges are not touched.
 */
export async function settleBalanceCharges(
  admin: SupabaseClient,
  pi: { id: string; created: number; metadata?: Record<string, string> | null },
): Promise<{ settled: number; error?: string }> {
  const playerId = pi.metadata?.player_id;
  const tournamentId = pi.metadata?.tournament_id;
  if (pi.metadata?.kind !== 'balance' || !playerId || !tournamentId) {
    return { settled: 0, error: 'Not a balance payment' };
  }
  const { data, error } = await admin
    .from('player_charges')
    .update({
      settled_at: new Date().toISOString(),
      settlement_method: 'stripe',
      stripe_payment_intent_id: pi.id,
    })
    .eq('tournament_id', tournamentId)
    .eq('player_id', playerId)
    .is('settled_at', null)
    .lte('created_at', new Date(pi.created * 1000).toISOString())
    .select('id');
  if (error) return { settled: 0, error: error.message };
  return { settled: data?.length ?? 0 };
}
