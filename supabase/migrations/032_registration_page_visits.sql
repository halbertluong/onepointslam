-- ── Registration page visits ─────────────────────────────────────────────
--
-- Records one row per server-rendered load of a registration page — the
-- public per-tournament page (/t/[slug]/[tournament]/register) and the
-- account sign-up page (/auth/register) — so a director or admin can see
-- how many people land there, where they came from (referrer), and roughly
-- where from (IP-derived geography via Vercel's edge headers).
--
-- Written server-side, at render time, from headers() rather than a client
-- beacon: it works with JS disabled or blocked, can't be spoofed by a
-- browser extension, and needs no consent-gated client script. IP addresses
-- are personal data in some jurisdictions, so like pending_registrations
-- this table gets no RLS policies at all — every read goes through the
-- service-role client behind a director/admin-authorized API route.
CREATE TABLE IF NOT EXISTS registration_page_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  page text NOT NULL CHECK (page IN ('tournament_register', 'account_register')),
  tournament_id uuid REFERENCES tournaments(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  path text NOT NULL,
  referrer text,
  ip_address inet,
  country text,
  region text,
  city text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS registration_page_visits_tournament_idx
  ON registration_page_visits (tournament_id, created_at DESC);
CREATE INDEX IF NOT EXISTS registration_page_visits_page_idx
  ON registration_page_visits (page, created_at DESC);

ALTER TABLE registration_page_visits ENABLE ROW LEVEL SECURITY;
-- No policies — every access goes through the service-role client in API
-- routes, which bypasses RLS and enforces director/admin authorization
-- itself. Same reasoning as pending_registrations (027).
