-- 012_restrict_rls_to_tenant_admin_role.sql
-- Tighten "FOR ALL" management policies to require tenant_admin role,
-- not just membership in assigned_tenant_ids.
-- Referees could previously mutate tournaments/players/matches via the
-- Supabase REST API since they are assigned to tenant IDs.

DROP POLICY IF EXISTS "Tenant admin manage own tournaments" ON tournaments;
CREATE POLICY "Tenant admin manage own tournaments" ON tournaments FOR ALL
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'tenant_admin'
        AND tenant_id = ANY(current_user_tenant_ids()))
  );

DROP POLICY IF EXISTS "Tenant admin manage players" ON players;
CREATE POLICY "Tenant admin manage players" ON players FOR ALL
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'tenant_admin'
        AND tournament_id IN (
          SELECT id FROM tournaments
          WHERE tenant_id = ANY(current_user_tenant_ids())
        ))
  );

DROP POLICY IF EXISTS "Admin manage matches" ON matches;
CREATE POLICY "Admin manage matches" ON matches FOR ALL
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'tenant_admin'
        AND tournament_id IN (
          SELECT id FROM tournaments
          WHERE tenant_id = ANY(current_user_tenant_ids())
        ))
  );
