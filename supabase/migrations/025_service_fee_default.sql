-- ── Service fee: default is $8, not $5 ───────────────────────────────────────
--
-- tenants.platform_fee is the per-registrant service fee a school is charged
-- when a tournament doesn't override it. New schools are provisioned without
-- setting the column, so they inherit this default — which still said 5.00
-- while the product had moved to 8.00.
--
-- Only the default changes. Existing rows keep whatever fee they were given:
-- those are live prices on registration pages that are already open, and each
-- school's fee is set deliberately from the admin dashboard.

ALTER TABLE tenants
  ALTER COLUMN platform_fee SET DEFAULT 8.0;
