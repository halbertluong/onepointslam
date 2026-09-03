-- Links a player back to the coupon they redeemed at registration, so the
-- Coupon Codes tab can show directors who used each code rather than just a
-- count. Populated at promotion time (see promotePendingRegistration in
-- src/lib/paymentPromotion.ts) from the pending_registrations row's own
-- coupon_id — the same reservation redeem_coupon already accounted for.
ALTER TABLE players ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS players_coupon_idx ON players (coupon_id) WHERE coupon_id IS NOT NULL;
