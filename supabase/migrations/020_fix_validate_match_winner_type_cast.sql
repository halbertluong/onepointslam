-- 020_fix_validate_match_winner_type_cast.sql
-- 011_validate_winner_id compared winner_id (uuid) directly against
-- player1_id/player2_id (text) with IS DISTINCT FROM, which Postgres has no
-- uuid/text equality operator for. Every winner declaration raised
-- "operator does not exist: uuid = text" and the write silently failed
-- (the app doesn't check the Supabase response), leaving matches stuck as
-- court_assigned with no winner. Cast winner_id to text before comparing.
CREATE OR REPLACE FUNCTION validate_match_winner()
RETURNS trigger AS $$
BEGIN
  IF NEW.winner_id IS NOT NULL THEN
    IF NEW.winner_id::text IS DISTINCT FROM NEW.player1_id AND NEW.winner_id::text IS DISTINCT FROM NEW.player2_id THEN
      RAISE EXCEPTION 'winner_id must be player1_id or player2_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
