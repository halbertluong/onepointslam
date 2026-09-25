-- ── Drop skill_tier: the self-reported "Beginner/Intermediate/Advanced" pick ─
--
-- collected at registration alongside NTRP/UTR. In practice directors never
-- used it to seed or bracket players — NTRP and UTR (and seeds) do that job —
-- so it was just an extra, unverified field on every registrant. Removed from
-- the registration form and player editor; this drops the column it was
-- stored in.
ALTER TABLE players DROP COLUMN IF EXISTS skill_tier;
ALTER TABLE pending_registrations DROP COLUMN IF EXISTS skill_tier;
