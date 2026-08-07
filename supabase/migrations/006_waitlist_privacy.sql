-- 006_waitlist_privacy.sql
-- Drop the overly permissive waitlist SELECT policy.
-- The admin page uses the service-role client which bypasses RLS entirely,
-- so no SELECT policy is needed for admin reads.
DROP POLICY IF EXISTS "waitlist: service role select" ON waitlist;
DROP POLICY IF EXISTS "waitlist: service role full access" ON waitlist;
