-- Closes two read-then-write races found ahead of a live tournament: none of
-- these are hypothetical, all three involve two requests racing to act on the
-- same row from application code, which is exactly what a single atomic SQL
-- statement (a real row lock, not a check in one query followed by a write in
-- another) is for.
--
-- 1. Two players registering for the very last open spot at the same instant
--    could both get seated/reserved, one over the tournament's cap — the
--    existing RLS "WITH CHECK" cap policies (005, 015) never actually run,
--    because every registration write goes through the service-role client,
--    which bypasses RLS entirely.
-- 2. Same race for the paid path's reservation (pending_registrations),
--    counting seated players plus other in-flight payment attempts.
-- 3. Two matches finishing on different courts at the same instant could both
--    read the same "next queued match" before either write commits, so one
--    freed court silently loses the race and sits idle while the match that
--    should have gone to it flips to the other court instead.

-- ── 1 & 2: atomic capacity-checked writes ────────────────────────────────────
--
-- Both functions lock the tournament row with `FOR UPDATE` before counting,
-- so a second concurrent call for the same tournament blocks until the
-- first's write has committed and released the lock — its own count then
-- already reflects that reservation, instead of two calls both reading the
-- pre-write count and both concluding there's room.
--
-- Both are service-role only: every caller (the registrations route and
-- create-intent) already runs entirely server-side with the service-role
-- client, so there is no browser-facing use for these.

-- Free / offline-paid registration: checks players.count against
-- playerRegistrationCap and inserts in one statement.
CREATE OR REPLACE FUNCTION register_player_if_room(
  p_tournament_id uuid,
  p_full_name text,
  p_email text,
  p_gender text,
  p_ntrp_rating numeric,
  p_utr_rating numeric,
  p_age int,
  p_user_id uuid,
  p_payment_status text
) RETURNS SETOF players
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cap int;
  v_seated int;
BEGIN
  PERFORM 1 FROM tournaments WHERE id = p_tournament_id FOR UPDATE;

  SELECT (settings->>'playerRegistrationCap')::int INTO v_cap
  FROM tournaments WHERE id = p_tournament_id;

  IF v_cap IS NOT NULL THEN
    SELECT count(*) INTO v_seated FROM players
      WHERE tournament_id = p_tournament_id AND status <> 'no_show_eliminated';
    IF v_seated >= v_cap THEN
      RAISE EXCEPTION 'CAP_REACHED';
    END IF;
  END IF;

  RETURN QUERY
    INSERT INTO players (
      tournament_id, full_name, email, gender, ntrp_rating, utr_rating, age,
      status, user_id, payment_status, stripe_payment_intent_id
    )
    VALUES (
      p_tournament_id, p_full_name, p_email, p_gender, p_ntrp_rating, p_utr_rating, p_age,
      'registered', p_user_id, p_payment_status, NULL
    )
    RETURNING *;
END;
$$;

-- Paid registration's reservation, called as the terminal write once Stripe
-- has already returned a real PaymentIntent — the same moment create-intent
-- used to do a plain SELECT-then-upsert. Counts players.count plus other
-- still-open (non-terminal) pending reservations against
-- playerRegistrationCap, atomically with the write, so a rejected caller can
-- cancel the PaymentIntent it already created and release any coupon use it
-- already reserved (create-intent does both) instead of leaving either
-- behind.
--
-- Returns the row's PRIOR stripe_payment_intent_id/coupon_id (before this
-- call's write overwrites them) so create-intent's existing retry handling —
-- cancel the old PaymentIntent this email's earlier attempt pointed to,
-- release any coupon use it reserved — keeps working unchanged; there'd be no
-- way to read those old values back out after the write below.
CREATE OR REPLACE FUNCTION reserve_capacity_for_payment(
  p_tournament_id uuid,
  p_full_name text,
  p_email text,
  p_gender text,
  p_ntrp_rating numeric,
  p_utr_rating numeric,
  p_age int,
  p_user_id uuid,
  p_stripe_payment_intent_id text,
  p_coupon_id uuid,
  p_discount_cents int
) RETURNS TABLE(prior_stripe_payment_intent_id text, prior_coupon_id uuid)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cap int;
  v_seated int;
  v_inflight int;
BEGIN
  PERFORM 1 FROM tournaments WHERE id = p_tournament_id FOR UPDATE;

  SELECT (settings->>'playerRegistrationCap')::int INTO v_cap
  FROM tournaments WHERE id = p_tournament_id;

  IF v_cap IS NOT NULL THEN
    SELECT count(*) INTO v_seated FROM players
      WHERE tournament_id = p_tournament_id AND status <> 'no_show_eliminated';
    SELECT count(*) INTO v_inflight FROM pending_registrations
      WHERE tournament_id = p_tournament_id AND email <> p_email AND last_stripe_status IS NULL;
    IF v_seated + v_inflight >= v_cap THEN
      RAISE EXCEPTION 'CAP_REACHED';
    END IF;
  END IF;

  SELECT p.stripe_payment_intent_id, p.coupon_id
    INTO prior_stripe_payment_intent_id, prior_coupon_id
    FROM pending_registrations p
    WHERE p.tournament_id = p_tournament_id AND p.email = p_email;

  INSERT INTO pending_registrations (
    tournament_id, full_name, email, gender, ntrp_rating, utr_rating, age,
    stripe_payment_intent_id, user_id, last_stripe_status, coupon_id, discount_cents,
    coupon_released, updated_at
  )
  VALUES (
    p_tournament_id, p_full_name, p_email, p_gender, p_ntrp_rating, p_utr_rating, p_age,
    p_stripe_payment_intent_id, p_user_id, NULL, p_coupon_id, p_discount_cents, false, now()
  )
  ON CONFLICT (tournament_id, email) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    gender = EXCLUDED.gender,
    ntrp_rating = EXCLUDED.ntrp_rating,
    utr_rating = EXCLUDED.utr_rating,
    age = EXCLUDED.age,
    stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
    user_id = EXCLUDED.user_id,
    last_stripe_status = NULL,
    coupon_id = EXCLUDED.coupon_id,
    discount_cents = EXCLUDED.discount_cents,
    coupon_released = false,
    updated_at = now();

  RETURN NEXT;
END;
$$;

-- New functions default to PUBLIC-executable — lock these down the same way
-- 030 already had to for redeem_coupon/release_coupon, or any unauthenticated
-- caller could hit them straight through PostgREST and manufacture
-- reservations or read back players/pending_registrations rows via RETURNING.
REVOKE EXECUTE ON FUNCTION register_player_if_room(uuid, text, text, text, numeric, numeric, int, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION reserve_capacity_for_payment(uuid, text, text, text, numeric, numeric, int, uuid, text, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION register_player_if_room(uuid, text, text, text, numeric, numeric, int, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION reserve_capacity_for_payment(uuid, text, text, text, numeric, numeric, int, uuid, text, uuid, int) TO service_role;

-- ── 3: atomic court claim ─────────────────────────────────────────────────────
--
-- `FOR UPDATE SKIP LOCKED` inside a single UPDATE ... WHERE id = (SELECT ...)
-- statement: the row is locked as part of picking it, so a second concurrent
-- call can't select the same row — it skips straight to the next-best
-- candidate (or finds none), rather than both calls picking the same match
-- and the second silently overwriting the first's court assignment.
--
-- Unlike the two functions above, this is called from the browser client (the
-- director's dashboard and the referee console both call it as themselves,
-- not through a server route), so it needs its own authorization check
-- mirroring the "Referee and admin update matches" RLS policy on `matches`
-- (013) — SECURITY DEFINER bypasses that policy entirely, so without this
-- check any authenticated user could claim courts for any tournament.
CREATE OR REPLACE FUNCTION claim_next_court(p_tournament_id uuid, p_court_number int)
RETURNS SETOF matches
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT (
    current_user_role() = 'super_admin'
    OR (
      current_user_role() IN ('tenant_admin', 'referee')
      AND p_tournament_id IN (
        SELECT id FROM tournaments WHERE tenant_id = ANY(current_user_tenant_ids())
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to assign courts for this tournament';
  END IF;

  RETURN QUERY
    UPDATE matches
    SET court_number = p_court_number, status = 'court_assigned'
    WHERE id = (
      SELECT id FROM matches
      WHERE tournament_id = p_tournament_id
        AND status = 'scheduled'
        AND court_number IS NULL
        AND player1_id IS NOT NULL
        AND player2_id IS NOT NULL
      ORDER BY round_index ASC, match_index ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_next_court(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION claim_next_court(uuid, int) TO authenticated, service_role;
