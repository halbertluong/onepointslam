-- ── Donations: restore the columns the application actually writes ───────────
--
-- 002 created this table with `stripe_payment_intent_id` and `player_id`, but
-- it was guarded by CREATE TABLE IF NOT EXISTS and production already had a
-- donations table of a different shape (donor_name / donor_email, no Stripe
-- reference). The guard meant the migration silently did nothing, so the table
-- has been missing the column ever since.
--
-- /api/donations inserts stripe_payment_intent_id and reads it back for its
-- idempotency check, so every donation insert fails against the live schema:
-- the card is charged, the row is never written, and the fundraising total
-- never moves. Adding the columns makes that path work and gives every
-- donation a Stripe reference to reconcile against.

ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS player_id uuid REFERENCES players(id) ON DELETE SET NULL;

-- One donation row per PaymentIntent. The route's idempotency check is the
-- first line of defence; this is the one that can't be raced.
CREATE UNIQUE INDEX IF NOT EXISTS donations_stripe_pi_unique
  ON donations (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
