-- 036_referee_advancement_rpc.sql
--
-- Bug: once a referee (not a tenant_admin/super_admin) finished a match past
-- round 0, every later round silently stopped getting queued, even though
-- the bracket still listed those matches as left to play.
--
-- Root cause: applyAdvancement() (src/app/referee/[matchId]/page.tsx) writes
-- the winner into the *next* match's player1_id/player2_id right after
-- finalizing the current one. The 009_restrict_referee_match_columns.sql
-- trigger blocks exactly that write for non-admins (it was written to stop
-- a referee from tampering with bracket structure via raw REST calls), and
-- the app's update loop never checked the response for an error, so the
-- failure was invisible. The next match kept player1_id/player2_id null,
-- which is exactly what the referee queue query
-- (src/app/referee/page.tsx) and releaseCourtToNextMatch
-- (src/lib/courts.ts) filter on to decide what's ready to play — so it
-- never appeared there, while the unfiltered bracket view still showed it.
--
-- Fix: give the app a narrow, validated path to advance a winner instead of
-- loosening the trigger itself (which stays in place for raw .update()
-- calls from a referee session). advance_match_winner() finalizes the
-- source match and writes only the winner or loser of that same match into
-- a downstream match's player slot(s) -- nothing else a caller passes in
-- can reach player1_id/player2_id. Since a SECURITY DEFINER function's own
-- UPDATEs still fire the 009 trigger (it isn't superuser-only, and
-- current_user_role() still reads the calling referee's auth.uid()
-- regardless of the function's owner), the trigger gets a narrow,
-- transaction-local bypass that only this function ever sets, rather than
-- being reachable by any client.

CREATE OR REPLACE FUNCTION restrict_referee_match_columns()
RETURNS trigger AS $$
BEGIN
  IF current_setting('app.bypass_match_column_restriction', true) = 'true' THEN
    RETURN NEW;
  END IF;
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

CREATE OR REPLACE FUNCTION advance_match_winner(
  p_match_id text,
  p_winner_id uuid,
  p_loser_id uuid,
  p_status text,
  p_downstream jsonb DEFAULT '[]'::jsonb -- [{match_id, player1_id?, player2_id?}, ...]
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

  -- Local to this transaction only (PostgREST runs each RPC call in its own
  -- transaction) -- it can't leak to any other session, and no client can
  -- set it directly since PostgREST only exposes functions in `public`, not
  -- the built-in set_config().
  PERFORM set_config('app.bypass_match_column_restriction', 'true', true);

  UPDATE matches
    SET winner_id = p_winner_id, loser_id = p_loser_id, status = p_status
    WHERE id = p_match_id;

  FOR d IN SELECT * FROM jsonb_array_elements(coalesce(p_downstream, '[]'::jsonb))
  LOOP
    v_p1 := d->>'player1_id';
    v_p2 := d->>'player2_id';

    IF v_p1 IS NOT NULL AND v_p1 IS DISTINCT FROM p_winner_id::text AND v_p1 IS DISTINCT FROM p_loser_id::text THEN
      RAISE EXCEPTION 'downstream player1_id must be the winner or loser of match %', p_match_id;
    END IF;
    IF v_p2 IS NOT NULL AND v_p2 IS DISTINCT FROM p_winner_id::text AND v_p2 IS DISTINCT FROM p_loser_id::text THEN
      RAISE EXCEPTION 'downstream player2_id must be the winner or loser of match %', p_match_id;
    END IF;

    UPDATE matches SET
      player1_id = coalesce(v_p1, player1_id),
      player2_id = coalesce(v_p2, player2_id)
      WHERE id = d->>'match_id';
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION advance_match_winner(text, uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION advance_match_winner(text, uuid, uuid, text, jsonb) TO authenticated;
