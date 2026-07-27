-- 010_slug_blocklist_favicon.sql
-- Add favicon.ico to the tenant slug blocklist (was in client-side check but not DB constraint)
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_slug_not_reserved;
ALTER TABLE tenants ADD CONSTRAINT tenants_slug_not_reserved
  CHECK (slug NOT IN ('admin','api','auth','dashboard','t','_next','referee','demo','soccer','favicon.ico'));
