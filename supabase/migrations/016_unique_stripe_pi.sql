-- 016_unique_stripe_pi.sql
-- Prevent PaymentIntent reuse across multiple player registrations.
-- The application layer checks for reuse, but this constraint is the atomic DB-level guard.
ALTER TABLE players
  ADD CONSTRAINT players_stripe_pi_unique UNIQUE (stripe_payment_intent_id);
