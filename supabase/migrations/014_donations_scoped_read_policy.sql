-- 014_donations_scoped_read_policy.sql
-- Scope donations SELECT to tenant admins and super_admin only.
-- The donations table has no user_id FK; donor info (name, email) is PII
-- that only the organizing tenant should see.
-- The prior "authenticated read" policy exposed all donations to any logged-in user.
DROP POLICY IF EXISTS "donations: authenticated read" ON donations;

CREATE POLICY "donations: admin read" ON donations FOR SELECT
  USING (
    current_user_role() = 'super_admin'
    OR (
      current_user_role() = 'tenant_admin'
      AND tournament_id IN (
        SELECT id FROM tournaments WHERE tenant_id = ANY(current_user_tenant_ids())
      )
    )
  );
