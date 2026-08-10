-- 013_lock_assigned_tenant_ids_and_role_checks.sql
-- Fix three related privilege escalation vectors.

-- Fix 1: Prevent users from self-assigning assigned_tenant_ids via PostgREST.
-- The old WITH CHECK only blocked role changes, not tenant ID changes.
DROP POLICY IF EXISTS "Users update own non-role fields" ON users;
CREATE POLICY "Users update own non-role fields" ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    role = (SELECT role FROM public.users WHERE id = auth.uid())
    AND assigned_tenant_ids IS NOT DISTINCT FROM (SELECT assigned_tenant_ids FROM public.users WHERE id = auth.uid())
  );

-- Fix 2: Restrict tenant updates to tenant_admin and super_admin roles.
-- The old policy only checked current_user_tenant_ids(), not the user's role.
DROP POLICY IF EXISTS "Tenant admin update own tenant" ON tenants;
CREATE POLICY "Tenant admin update own tenant" ON tenants FOR UPDATE
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'tenant_admin'
        AND id = ANY(current_user_tenant_ids()))
  );

-- Fix 3: Add explicit role check to the referee/admin match update policy.
-- Previously any user with assigned_tenant_ids set could update match results.
DROP POLICY IF EXISTS "Referee and admin update matches" ON matches;
CREATE POLICY "Referee and admin update matches" ON matches FOR UPDATE
  USING (
    current_user_role() = 'super_admin'
    OR (
      current_user_role() IN ('tenant_admin', 'referee')
      AND tournament_id IN (
        SELECT id FROM tournaments WHERE tenant_id = ANY(current_user_tenant_ids())
      )
    )
  );
