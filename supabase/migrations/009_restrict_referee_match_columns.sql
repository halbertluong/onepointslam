-- 009_restrict_referee_match_columns.sql
-- Prevent referees from modifying structural bracket columns via direct API calls.
-- Referees should only update winner_id, status, and server_player_id.
CREATE OR REPLACE FUNCTION restrict_referee_match_columns()
RETURNS trigger AS $$
BEGIN
  IF current_user_role() NOT IN ('super_admin', 'tenant_admin') THEN
    IF (NEW.player1_id IS DISTINCT FROM OLD.player1_id OR
        NEW.player2_id IS DISTINCT FROM OLD.player2_id OR
        NEW.round_index IS DISTINCT FROM OLD.round_index OR
        NEW.match_index IS DISTINCT FROM OLD.match_index OR
        NEW.court_number IS DISTINCT FROM OLD.court_number OR
        NEW.tournament_id IS DISTINCT FROM OLD.tournament_id) THEN
      RAISE EXCEPTION 'Referees may only update match results (winner_id, status, server_player_id)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_referee_match_columns ON matches;
CREATE TRIGGER enforce_referee_match_columns
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION restrict_referee_match_columns();
