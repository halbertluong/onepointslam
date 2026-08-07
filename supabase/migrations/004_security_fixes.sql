-- 004_security_fixes.sql
-- Applied directly to production; recorded here for source control.

-- Fix referee RLS: scope match updates to own tenant only
DROP POLICY IF EXISTS "Referee and admin update matches" ON matches;
CREATE POLICY "Referee and admin update matches" ON matches FOR UPDATE
  USING (
    current_user_role() = 'super_admin'
    OR tournament_id IN (
      SELECT id FROM tournaments WHERE tenant_id = ANY(current_user_tenant_ids())
    )
  );

-- Enforce hex color format on tenants
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_primary_color_hex;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_secondary_color_hex;
ALTER TABLE tenants ADD CONSTRAINT tenants_primary_color_hex
  CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9a-fA-F]{6}$');
ALTER TABLE tenants ADD CONSTRAINT tenants_secondary_color_hex
  CHECK (secondary_color IS NULL OR secondary_color ~ '^#[0-9a-fA-F]{6}$');

-- Enforce slug blocklist and format
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_slug_not_reserved;
ALTER TABLE tenants ADD CONSTRAINT tenants_slug_not_reserved
  CHECK (slug NOT IN ('admin','api','auth','dashboard','t','_next','referee','demo','soccer'));

-- Storage: restrict tenant-assets uploads to tenant_admin/super_admin
DROP POLICY IF EXISTS "Authenticated upload tenant assets" ON storage.objects;
CREATE POLICY "Tenant admin upload tenant assets" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'tenant-assets'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('tenant_admin', 'super_admin')
    )
  );

-- Waitlist: fix SELECT policy (was wrongly requiring service_role)
DROP POLICY IF EXISTS "waitlist: service role select" ON waitlist;
CREATE POLICY "waitlist: service role select" ON waitlist FOR SELECT USING (true);

-- Players: registration only allowed for open, non-deleted tournaments
DROP POLICY IF EXISTS "Anyone can register as player" ON players;
CREATE POLICY "Anyone can register as player" ON players FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id
        AND t.status = 'registration_open'
        AND t.deleted_at IS NULL
    )
  );

-- Players: prevent duplicate registrations at DB level
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_tournament_email_unique;
ALTER TABLE players ADD CONSTRAINT players_tournament_email_unique UNIQUE (tournament_id, email);

-- Users: prevent duplicate emails
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);

-- Users: prevent self-promotion via direct RLS update
DROP POLICY IF EXISTS "Users update own row" ON users;
CREATE POLICY "Users update own non-role fields" ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (role = (SELECT role FROM public.users WHERE id = auth.uid()));
