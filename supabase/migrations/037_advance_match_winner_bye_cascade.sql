-- 037_advance_match_winner_bye_cascade.sql
--
-- Bug found on the live "Portland One Point Bowl Fall 2026 (Test)" tournament:
-- the consolation bracket's round-0 "matches" were ALL pre-marked
-- status='walkover' at generation time (buildSingleElimMatches's bye
-- detection saw every slot start null -- true at generation, since real
-- occupants only arrive later via resolveAdvancement's round-0 drop-ins --
-- and concluded every one of them was a bye). Once a real main-bracket
-- round-0 match dropped a genuine loser into both of a consolation slot's
-- player columns, the match was really two real players who needed to be
-- refereed -- but it was already 'walkover' with no winner, so it could
-- never enter the referee queue (which excludes anything not 'scheduled'/
-- 'court_assigned'/'warmup'/'playing') and could never be played or
-- cascade forward.
--
-- src/lib/bracket.ts's buildSingleElimMatches and resolveAdvancement were
-- fixed correspondingly (deferred brackets no longer pre-decide round 0;
-- resolveAdvancement now settles a genuine one-sided bye the moment its one
-- real drop-in lands, and pushes that winner one round further). That
-- forced-bye settlement can now include winner_id/status in a *downstream*
-- match's advancement update (previously downstream updates only ever
-- touched player1_id/player2_id) -- extend advance_match_winner to accept
-- and validate those two additional fields per downstream entry, the same
-- way it already validates player1_id/player2_id: the value must be this
-- call's own winner_id or loser_id, and status must be a valid terminal
-- status. Nothing else a caller passes in can reach these columns.
CREATE OR REPLACE FUNCTION advance_match_winner(
  p_match_id text,
  p_winner_id uuid,
  p_loser_id uuid,
  p_status text,
  p_downstream jsonb DEFAULT '[]'::jsonb -- [{match_id, player1_id?, player2_id?, winner_id?, status?}, ...]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m matches%rowtype;
  d jsonb;
  v_p1 text;
  v_p2 text;
  v_winner text;
  v_status text;
BEGIN
  IF current_user_role() NOT IN ('super_admin', 'tenant_admin', 'referee') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO m FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match % not found', p_match_id;
  END IF;

  IF p_winner_id::text IS DISTINCT FROM m.player1_id AND p_winner_id::text IS DISTINCT FROM m.player2_id THEN
    RAISE EXCEPTION 'winner_id must be player1_id or player2_id of match %', p_match_id;
  END IF;

  IF p_status NOT IN ('finalized', 'walkover') THEN
    RAISE EXCEPTION 'invalid status for advancement: %', p_status;
  END IF;

  PERFORM set_config('app.bypass_match_column_restriction', 'true', true);

  UPDATE matches
    SET winner_id = p_winner_id, loser_id = p_loser_id, status = p_status
    WHERE id = p_match_id;

  FOR d IN SELECT * FROM jsonb_array_elements(coalesce(p_downstream, '[]'::jsonb))
  LOOP
    v_p1 := d->>'player1_id';
    v_p2 := d->>'player2_id';
    v_winner := d->>'winner_id';
    v_status := d->>'status';

    IF v_p1 IS NOT NULL AND v_p1 IS DISTINCT FROM p_winner_id::text AND v_p1 IS DISTINCT FROM p_loser_id::text THEN
      RAISE EXCEPTION 'downstream player1_id must be the winner or loser of match %', p_match_id;
    END IF;
    IF v_p2 IS NOT NULL AND v_p2 IS DISTINCT FROM p_winner_id::text AND v_p2 IS DISTINCT FROM p_loser_id::text THEN
      RAISE EXCEPTION 'downstream player2_id must be the winner or loser of match %', p_match_id;
    END IF;
    IF v_winner IS NOT NULL AND v_winner IS DISTINCT FROM p_winner_id::text AND v_winner IS DISTINCT FROM p_loser_id::text THEN
      RAISE EXCEPTION 'downstream winner_id must be the winner or loser of match %', p_match_id;
    END IF;
    IF v_status IS NOT NULL AND v_status NOT IN ('finalized', 'walkover') THEN
      RAISE EXCEPTION 'invalid downstream status: %', v_status;
    END IF;

    UPDATE matches SET
      player1_id = coalesce(v_p1, player1_id),
      player2_id = coalesce(v_p2, player2_id),
      winner_id = coalesce(v_winner::uuid, winner_id),
      status = coalesce(v_status, status)
      WHERE id = d->>'match_id';
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION advance_match_winner(text, uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION advance_match_winner(text, uuid, uuid, text, jsonb) TO authenticated;
