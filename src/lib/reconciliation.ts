/**
 * Matching money taken in Stripe against what the app recorded.
 *
 * Every payment path here is two steps that can come apart: Stripe confirms the
 * card, then a separate request writes the row. When the second step fails —
 * the cap filled while the payer was typing their card number, the insert
 * errored, the tab closed — the money is real and the registration isn't. The
 * webhook can't see it either: it updates a player row *by* PaymentIntent id,
 * so a payment with no row updates nothing and reports success.
 *
 * This is the pure half of the check: hand it what Stripe says and what the
 * database holds, and it names the discrepancies. It does no I/O so it can be
 * exercised directly.
 */

export type PaymentKind = 'registration' | 'donation';

/** A payment as Stripe knows it. */
export interface StripePayment {
  id: string;
  amountCents: number;
  /** Stripe's own status; only 'succeeded' counts as money received. */
  status: string;
  createdAt: string;
  kind: PaymentKind;
  tournamentId?: string;
  registrantName?: string;
  registrantEmail?: string;
}

/** A payment as the database knows it. */
export interface RecordedPayment {
  paymentIntentId: string;
  kind: PaymentKind;
  /** Who or what the row represents, for display next to the Stripe charge. */
  label: string;
}

export interface ReconciliationReport {
  /** Money Stripe has actually taken. */
  stripeTotalCents: number;
  /** The part of it that has a row in the database. */
  recordedTotalCents: number;
  /** Succeeded payments with no row: someone paid and isn't in the tournament. */
  orphans: StripePayment[];
  /** Rows whose PaymentIntent Stripe doesn't report as succeeded — refunded,
   *  cancelled, or pointing at something that no longer exists. */
  unbackedRecords: RecordedPayment[];
  matchedCount: number;
  /** True when every succeeded payment has a row and every row has a payment. */
  balanced: boolean;
}

export function reconcile(
  stripePayments: StripePayment[],
  recorded: RecordedPayment[],
): ReconciliationReport {
  const succeeded = stripePayments.filter((p) => p.status === 'succeeded');
  const recordedIds = new Set(recorded.map((r) => r.paymentIntentId));
  const succeededIds = new Set(succeeded.map((p) => p.id));

  const orphans = succeeded.filter((p) => !recordedIds.has(p.id));
  const unbackedRecords = recorded.filter((r) => !succeededIds.has(r.paymentIntentId));

  const stripeTotalCents = succeeded.reduce((sum, p) => sum + p.amountCents, 0);
  const orphanCents = orphans.reduce((sum, p) => sum + p.amountCents, 0);

  return {
    stripeTotalCents,
    recordedTotalCents: stripeTotalCents - orphanCents,
    orphans,
    unbackedRecords,
    matchedCount: succeeded.length - orphans.length,
    balanced: orphans.length === 0 && unbackedRecords.length === 0,
  };
}

/** Reads a Stripe PaymentIntent-shaped object into the form reconcile() wants. */
export function toStripePayment(pi: {
  id: string;
  amount: number;
  status: string;
  created: number;
  metadata?: Record<string, string> | null;
}): StripePayment {
  const meta = pi.metadata ?? {};
  return {
    id: pi.id,
    amountCents: pi.amount,
    status: pi.status,
    createdAt: new Date(pi.created * 1000).toISOString(),
    // Donations are tagged at creation; everything else on a tournament is an entry.
    kind: meta.kind === 'donation' ? 'donation' : 'registration',
    tournamentId: meta.tournament_id || undefined,
    registrantName: meta.registrant_name || undefined,
    registrantEmail: meta.registrant_email || undefined,
  };
}
