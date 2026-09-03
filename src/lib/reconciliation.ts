/**
 * Matching money taken in Stripe against what the app recorded.
 *
 * A registration reserves before it pays: the moment the form is submitted, a
 * row goes into `pending_registrations` alongside the PaymentIntent about to
 * charge the payer, and only once Stripe confirms the charge does that row get
 * promoted into `players` (see src/lib/paymentPromotion.ts). That closes the
 * old failure mode — Stripe takes the money, a second request that never
 * happens is what would have written the row — but it leaves a few states
 * worth telling apart:
 *
 *   - orphan: Stripe took the money, nothing was ever recorded for it at all.
 *   - stuck reservation: a reservation exists, Stripe succeeded, but it was
 *     never promoted (webhook and fast-path ping both missed it).
 *   - stale status: a confirmed player row exists but doesn't say 'paid',
 *     despite Stripe reporting success — only possible for a row created the
 *     old way, before promotion always wrote 'paid' at creation.
 *   - unbacked: something is recorded, but Stripe no longer reports that
 *     payment as succeeded (refunded, canceled).
 *   - abandoned: a reservation whose payment never succeeded — informational,
 *     not a discrepancy. This is the "started but didn't finish" list.
 *
 * This is the pure half of the check: hand it what Stripe says and what the
 * database holds, and it sorts every payment into exactly one of these. It
 * does no I/O so it can be exercised directly.
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

export type RecordedStage = 'reserved' | 'confirmed';

/** A payment as the database knows it — either a reservation or a confirmed record. */
export interface RecordedPayment {
  paymentIntentId: string;
  kind: PaymentKind;
  /** Who or what the row represents, for display next to the Stripe charge. */
  label: string;
  stage: RecordedStage;
  /** players.payment_status, when stage is 'confirmed' and it's a registration. */
  storedStatus?: string;
}

export type MatchState = 'confirmed' | 'stuck' | 'stale' | 'orphan';

/** One succeeded Stripe payment, tagged with how (or whether) it's recorded — the full ledger. */
export interface AnnotatedPayment extends StripePayment {
  matchState: MatchState;
  record?: RecordedPayment;
}

export interface ReconciliationReport {
  /** Money Stripe has actually taken. */
  stripeTotalCents: number;
  /** The part of it fully confirmed — a real registration or donation, correctly marked. */
  confirmedCents: number;
  /** Succeeded payments with no record anywhere — needs manual recovery. */
  orphans: StripePayment[];
  /** A reservation whose payment succeeded but was never promoted — needs promoting. */
  stuckReservations: RecordedPayment[];
  /** A confirmed record whose stored status disagrees with Stripe's success — needs syncing. */
  staleStatus: RecordedPayment[];
  /** Recorded, but Stripe no longer reports that payment as succeeded (refunded, canceled). */
  unbackedRecords: RecordedPayment[];
  /** Reservations whose payment never succeeded — informational, not a problem to fix. */
  abandoned: RecordedPayment[];
  /** Every succeeded payment, newest first, tagged with its match state — the full ledger. */
  payments: AnnotatedPayment[];
  matchedCount: number;
  /** True when every succeeded payment is fully and correctly recorded. */
  balanced: boolean;
}

export function reconcile(
  stripePayments: StripePayment[],
  recorded: RecordedPayment[],
): ReconciliationReport {
  const succeeded = stripePayments.filter((p) => p.status === 'succeeded');
  const succeededIds = new Set(succeeded.map((p) => p.id));
  const byId = new Map(recorded.map((r) => [r.paymentIntentId, r]));

  const orphans: StripePayment[] = [];
  const stuckReservations: RecordedPayment[] = [];
  const staleStatus: RecordedPayment[] = [];
  const payments: AnnotatedPayment[] = [];
  let confirmedCents = 0;

  for (const p of succeeded) {
    const rec = byId.get(p.id);
    if (!rec) {
      orphans.push(p);
      payments.push({ ...p, matchState: 'orphan' });
      continue;
    }
    if (rec.stage === 'reserved') {
      stuckReservations.push(rec);
      payments.push({ ...p, matchState: 'stuck', record: rec });
      continue;
    }
    if (rec.storedStatus && rec.storedStatus !== 'paid') {
      staleStatus.push(rec);
      payments.push({ ...p, matchState: 'stale', record: rec });
      continue;
    }
    confirmedCents += p.amountCents;
    payments.push({ ...p, matchState: 'confirmed', record: rec });
  }
  payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const unbackedRecords = recorded.filter((r) => r.stage === 'confirmed' && !succeededIds.has(r.paymentIntentId));
  const abandoned = recorded.filter((r) => r.stage === 'reserved' && !succeededIds.has(r.paymentIntentId));

  const stripeTotalCents = succeeded.reduce((sum, p) => sum + p.amountCents, 0);

  return {
    stripeTotalCents,
    confirmedCents,
    orphans,
    stuckReservations,
    staleStatus,
    unbackedRecords,
    abandoned,
    payments,
    matchedCount: succeeded.length - orphans.length - stuckReservations.length - staleStatus.length,
    balanced: orphans.length === 0 && stuckReservations.length === 0 && staleStatus.length === 0 && unbackedRecords.length === 0,
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
