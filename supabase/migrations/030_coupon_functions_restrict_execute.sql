-- redeem_coupon and release_coupon are SECURITY DEFINER, and Postgres grants
-- EXECUTE on a new function to PUBLIC by default — which meant any
-- unauthenticated caller could hit them straight through PostgREST
-- (/rest/v1/rpc/redeem_coupon) and burn through a coupon's usage_limit
-- without ever going through create-intent's couponCodesEnabled check or a
-- real payment. Only the service-role client in the app's own routes should
-- ever call these.
REVOKE EXECUTE ON FUNCTION redeem_coupon(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION release_coupon(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION redeem_coupon(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION release_coupon(uuid) TO service_role;
