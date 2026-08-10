-- 011_validate_winner_id.sql
-- Enforce that winner_id must be one of the match's two players.
-- Prevents a referee from declaring an arbitrary player as winner via direct API calls.
CREATE OR REPLACE FUNCTION validate_match_winner()
RETURNS trigger AS $$
BEGIN
  IF NEW.winner_id IS NOT NULL THEN
    IF NEW.winner_id IS DISTINCT FROM NEW.player1_id AND NEW.winner_id IS DISTINCT FROM NEW.player2_id THEN
      RAISE EXCEPTION 'winner_id must be player1_id or player2_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_match_winner ON matches;
CREATE TRIGGER enforce_match_winner
  BEFORE INSERT OR UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION validate_match_winner();
