-- 3rd serve add-on, and serve purchases now priced + recorded server-side.
--
-- Prices escalate with how many times the same player has bought the same
-- add-on (see src/lib/addOns.ts), which needs the player's purchase history —
-- something a referee, who cannot read the ledger, must not be trusted to
-- supply. Serve purchases therefore go through /api/matches/[id]/serve-purchases
-- (service role), so the referee INSERT policy from 038 is dropped.

ALTER TABLE player_charges DROP CONSTRAINT IF EXISTS player_charges_kind_check;
ALTER TABLE player_charges
  ADD CONSTRAINT player_charges_kind_check CHECK (kind IN ('second_serve', 'third_serve', 'buy_back'));

DROP POLICY IF EXISTS "Referee record second serve" ON player_charges;

-- A match is a single point: at most one bought 2nd serve and one 3rd serve.
CREATE UNIQUE INDEX IF NOT EXISTS player_charges_one_third_serve_per_match
  ON player_charges (match_id) WHERE kind = 'third_serve';
