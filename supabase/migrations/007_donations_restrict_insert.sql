-- 007_donations_restrict_insert.sql
-- Restrict donations INSERT to authenticated users only.
DROP POLICY IF EXISTS "donations: service role full access" ON donations;

CREATE POLICY "donations: authenticated insert" ON donations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "donations: authenticated read" ON donations FOR SELECT
  USING (auth.role() = 'authenticated');
