-- 033_allow_referee_court_release.sql
-- Referees legitimately change court_number as part of finishing a match:
-- releaseCourtToNextMatch() hands the now-free court to the next queued
-- match, which is a routine write made from the referee console (a
-- non-admin, 'referee'-role session). The trigger from
-- 009_restrict_referee_match_columns.sql blocked any court_number change
-- from a referee, so that hand-off silently failed (the update raised, and
-- the caller doesn't check the result) and a tournament's court got stuck
-- on the match that had just finished instead of moving to the next one.
--
-- court_number isn't a structural bracket column the way player1_id/
-- player2_id/round_index/match_index/tournament_id are — letting a referee
-- change it doesn't let them alter who plays whom or when, only which
-- physical court a match is on. Drop it from the restricted list.
CREATE OR REPLACE FUNCTION restrict_referee_match_columns()
RETURNS trigger AS $$
BEGIN
  IF current_user_role() NOT IN ('super_admin', 'tenant_admin') THEN
    IF (NEW.player1_id IS DISTINCT FROM OLD.player1_id OR
        NEW.player2_id IS DISTINCT FROM OLD.player2_id OR
        NEW.round_index IS DISTINCT FROM OLD.round_index OR
        NEW.match_index IS DISTINCT FROM OLD.match_index OR
        NEW.tournament_id IS DISTINCT FROM OLD.tournament_id) THEN
      RAISE EXCEPTION 'Referees may only update match results and court assignment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
