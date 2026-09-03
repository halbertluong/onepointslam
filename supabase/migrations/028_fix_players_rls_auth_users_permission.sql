-- 028_fix_players_rls_auth_users_permission.sql
--
-- Two players-table policies (added directly against production, outside
-- this migration history) reference auth.users in their USING/WITH CHECK
-- expressions. The authenticated/anon roles have no grant to read auth.users
-- directly, so evaluating either policy raises "permission denied for table
-- users" -- and since Postgres RLS policies are combined with OR but a
-- thrown error still aborts the whole statement, this broke every direct
-- players UPDATE from the browser client for a tenant admin (Withdraw, Save
-- Seeds, etc.), not just the self-service cases these two policies exist for.

-- Fully redundant: "Public read players" already grants unconditional SELECT
-- to every role, so this policy was never adding read access -- only the
-- auth.users permission error.
DROP POLICY IF EXISTS "Players read own registrations" ON players;

-- Same fix for the self-claim policy: public.users.email already mirrors
-- auth.users.email (populated at signup by handle_new_user()), so the same
-- match works without touching auth.users.
DROP POLICY IF EXISTS "Players update own user_id" ON players;
CREATE POLICY "Players update own user_id" ON players FOR UPDATE
  USING (email = (SELECT u.email FROM public.users u WHERE u.id = auth.uid()))
  WITH CHECK (user_id = auth.uid());
