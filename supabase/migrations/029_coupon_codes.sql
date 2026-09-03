-- Coupon codes: per-tournament discount codes with a usage limit.
--
-- Feature-flagged off by default via settings.couponCodesEnabled (opt-in,
-- unlike allowDonations' opt-out — this feature never existed before, so no
-- tournament should suddenly start accepting codes it was never configured
-- with). The flag itself lives in the existing settings jsonb, same as every
-- other tournament toggle; only the codes and their usage counts need a real
-- table, since concurrent redemptions must be able to race safely against a
-- fixed limit.
CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_cents int NOT NULL CHECK (discount_cents > 0),
  usage_limit int NOT NULL CHECK (usage_limit > 0),
  used_count int NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, code)
);

CREATE INDEX IF NOT EXISTS coupons_tournament_idx ON coupons (tournament_id);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- Directors manage their own tournaments' coupons — same shape as "Tenant
-- admin manage players". Deliberately no public read policy: unlike players,
-- the code list and remaining balances aren't meant to be enumerable by
-- visitors. Redemption during registration goes through the service-role
-- client in the coupon validate/create-intent routes, which bypasses RLS —
-- the same way pending_registrations is only ever touched there.
CREATE POLICY "Tenant admin manage coupons" ON coupons FOR ALL
  USING (
    current_user_role() = 'super_admin' OR
    tournament_id IN (
      SELECT id FROM tournaments WHERE tenant_id = ANY(current_user_tenant_ids())
    )
  );

-- Atomically reserves one use of a coupon, returning its discount if it
-- succeeded. A single UPDATE ... RETURNING is race-safe under Postgres row
-- locking: two concurrent redemptions can't both claim the last remaining
-- use, unlike a read-then-write check from application code.
CREATE OR REPLACE FUNCTION redeem_coupon(p_tournament_id uuid, p_code text)
RETURNS TABLE(id uuid, discount_cents int)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
    UPDATE coupons
    SET used_count = used_count + 1
    WHERE tournament_id = p_tournament_id
      AND code = upper(p_code)
      AND used_count < usage_limit
    RETURNING coupons.id, coupons.discount_cents;
END;
$$;

-- Gives back a reserved use — called when the payment it was reserved for
-- never completes (payment setup failed, a director dismissed the abandoned
-- reservation, or Stripe reported the charge declined/canceled).
CREATE OR REPLACE FUNCTION release_coupon(p_coupon_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = p_coupon_id;
$$;

-- Which coupon (if any) a reservation redeemed, so its use can be given back
-- if the reservation is abandoned instead of paid. `coupon_released` guards
-- against giving it back twice — the webhook and a director's dismiss click
-- can both reach for the same row, and only the caller that flips this from
-- false to true is allowed to actually release it (see releasePendingCoupon
-- in src/lib/coupons.ts).
ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL;
ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS discount_cents int;
ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS coupon_released boolean NOT NULL DEFAULT false;
