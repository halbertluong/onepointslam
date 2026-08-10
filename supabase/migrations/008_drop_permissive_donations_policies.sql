-- 008_drop_permissive_donations_policies.sql
-- Drop the original permissive donations policies created in migration 002.
-- Migration 007 added authenticated-only policies but these old ones still existed
-- and overrode them (RLS uses OR logic across policies for the same operation).
DROP POLICY IF EXISTS "donations: anon insert" ON donations;
DROP POLICY IF EXISTS "donations: select" ON donations;
