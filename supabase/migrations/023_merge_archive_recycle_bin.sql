-- 023_merge_archive_recycle_bin.sql
-- Collapse the recycle bin (deleted_at) and archive (archived_at) states into
-- a single lifecycle flag. Archived is now the sole "hidden but recoverable"
-- state; permanent deletion requires archived_at to be set instead of deleted_at.

-- Carry forward any recycle-bin tournaments into the archived state before dropping deleted_at
UPDATE tournaments SET archived_at = deleted_at WHERE deleted_at IS NOT NULL AND archived_at IS NULL;

-- Registration policy: swap the deleted_at check for archived_at
DROP POLICY IF EXISTS "Anyone can register as player" ON players;
CREATE POLICY "Anyone can register as player" ON players FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id
        AND t.status = 'registration_open'
        AND t.archived_at IS NULL
        AND (
          (t.settings->>'playerRegistrationCap') IS NULL
          OR (
            SELECT COUNT(*) FROM players p WHERE p.tournament_id = t.id
          ) < (t.settings->>'playerRegistrationCap')::int
        )
    )
  );

ALTER TABLE tournaments DROP COLUMN IF EXISTS deleted_at;
