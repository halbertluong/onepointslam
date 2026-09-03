-- ── Pending registrations: a reservation that exists before payment does ─────
--
-- Until now, a paid registration was written to `players` only after Stripe
-- confirmed the card — two separate requests, with nothing durable between
-- them. When the second one failed (cap filled while the payer was typing
-- their card number, the request errored, the tab closed), Stripe had the
-- money and the tournament had no record the person ever existed.
--
-- This table exists to close that window: the moment someone submits the
-- registration form, their details and the PaymentIntent about to charge them
-- are written here — before the card is ever charged. If the payment
-- succeeds, the row is promoted into `players` (paid) and deleted from here.
-- If it doesn't, the row stays here as a visible, named "didn't finish"
-- attempt instead of vanishing.
--
-- One row per (tournament, email): a repeat attempt after an abandoned one
-- overwrites its own reservation rather than piling up a second row, so
-- someone who tries twice and pays the second time is never left with a
-- stale abandoned-looking entry once they've actually completed.
CREATE TABLE IF NOT EXISTS pending_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  gender text,
  ntrp_rating numeric,
  utr_rating numeric,
  age int,
  skill_tier text,
  stripe_payment_intent_id text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Set by the Stripe webhook when a card is declined or the intent is
  -- canceled, so an abandoned-looking row can say why rather than just when.
  -- Null means still open — no terminal outcome yet, they may still return.
  last_stripe_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, email)
);

CREATE INDEX IF NOT EXISTS pending_registrations_tournament_idx
  ON pending_registrations (tournament_id);

ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;
-- No policies: every read and write goes through the service-role client in
-- API routes, which bypasses RLS — same reasoning as the waitlist table's own
-- privacy migration (006). This table is more sensitive than players (which
-- has a public-read policy for the spectator bracket page): it holds personal
-- details of people who have not completed registration and have no reason
-- to expect them shown publicly.
