-- 015_fix_cap_key.sql
-- Fix cap enforcement RLS policy: use playerRegistrationCap (the key the app writes)
-- instead of maxPlayers (the bracket size). The service-role registrations route
-- now does an explicit cap check, but this policy remains as an atomic DB-level safety net.
DROP POLICY IF EXISTS "Anyone can register as player" ON players;
CREATE POLICY "Anyone can register as player" ON players FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id
        AND t.status = 'registration_open'
        AND t.deleted_at IS NULL
        AND (
          (t.settings->>'playerRegistrationCap') IS NULL
          OR (
            SELECT COUNT(*) FROM players p WHERE p.tournament_id = t.id
          ) < (t.settings->>'playerRegistrationCap')::int
        )
    )
  );
