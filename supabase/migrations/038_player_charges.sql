-- Player charges: a running balance of on-site add-ons (a bought 2nd serve, a
-- buy-back into the tournament) that is collected at the end of the event.
-- Each row is one charge; settling stamps the method used (stripe, cash,
-- check, or a donation made on the school's site) purely for documentation —
-- only 'stripe' is tied to real payment processing.
CREATE TABLE IF NOT EXISTS player_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('second_serve', 'buy_back')),
  amount_cents int NOT NULL CHECK (amount_cents >= 0),
  match_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  settlement_method text CHECK (settlement_method IN ('stripe', 'cash', 'check', 'donation')),
  stripe_payment_intent_id text
);

CREATE INDEX IF NOT EXISTS player_charges_tournament_idx ON player_charges (tournament_id);
CREATE INDEX IF NOT EXISTS player_charges_player_idx ON player_charges (player_id);

ALTER TABLE player_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admin manage player charges" ON player_charges FOR ALL
  USING (
    current_user_role() = 'super_admin' OR
    (current_user_role() = 'tenant_admin' AND tournament_id IN (
      SELECT id FROM tournaments WHERE tenant_id = ANY(current_user_tenant_ids())
    ))
  )
  WITH CHECK (
    current_user_role() = 'super_admin' OR
    (current_user_role() = 'tenant_admin' AND tournament_id IN (
      SELECT id FROM tournaments WHERE tenant_id = ANY(current_user_tenant_ids())
    ))
  );

-- Referees record a bought 2nd serve from the court, but can do nothing else
-- with the ledger (no reads, no settling, no buy-backs).
CREATE POLICY "Referee record second serve" ON player_charges FOR INSERT
  WITH CHECK (
    current_user_role() = 'referee'
    AND kind = 'second_serve'
    AND settled_at IS NULL
    AND tournament_id IN (
      SELECT id FROM tournaments WHERE tenant_id = ANY(current_user_tenant_ids())
    )
  );

-- A match is a single point, so it can have at most one bought 2nd serve.
-- This also makes a referee's double-tap or page reload harmless.
CREATE UNIQUE INDEX IF NOT EXISTS player_charges_one_second_serve_per_match
  ON player_charges (match_id) WHERE kind = 'second_serve';
