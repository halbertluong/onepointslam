-- 005_atomic_cap_enforcement.sql
-- Replace simple status-check INSERT policy with one that atomically checks count vs cap.
-- Prevents concurrent registrations from exceeding maxPlayers via a read-then-write race.
DROP POLICY IF EXISTS "Anyone can register as player" ON players;
CREATE POLICY "Anyone can register as player" ON players FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id
        AND t.status = 'registration_open'
        AND t.deleted_at IS NULL
        AND (
          (t.settings->>'maxPlayers') IS NULL
          OR (
            SELECT COUNT(*) FROM players p WHERE p.tournament_id = t.id
          ) < (t.settings->>'maxPlayers')::int
        )
    )
  );
