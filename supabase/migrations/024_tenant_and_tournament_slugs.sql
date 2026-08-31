-- 024_tenant_and_tournament_slugs.sql
-- Human-typable registration links.
--
-- Registration URLs used to be /t/<tenant-slug>/<tournament-uuid>/register, which
-- nobody can read out loud or type off a flyer. Tournaments now carry their own
-- slug, unique within their tenant, so the same page lives at
-- /t/university-of-portland-tennis-womens/portland-one-point-bowl-fall-2026/register.
--
-- Both slugs are editable by the tournament admin, so everything here is written
-- to survive a rename: the app resolves a UUID as well as a slug, and the
-- generator below always lands on a free name rather than failing.

-- ============================================================
-- SLUGIFY
-- ============================================================
-- Lowercases, drops apostrophes outright (so "Women's" -> "womens", not
-- "women-s"), and collapses everything else non-alphanumeric to single dashes.
-- Returns null for input that has no slug-able characters at all.
CREATE OR REPLACE FUNCTION public.slugify(p_text text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(
    trim(both '-' FROM regexp_replace(
      lower(translate(coalesce(p_text, ''), '''’`´', '')),
      '[^a-z0-9]+', '-', 'g'
    )),
    ''
  );
$$;

-- ============================================================
-- TOURNAMENT SLUGS
-- ============================================================
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS slug text;

-- Picks a slug that is free within the tenant, suffixing -2, -3, … on collision.
-- p_exclude_id lets a tournament keep its own slug when re-derived on update.
CREATE OR REPLACE FUNCTION public.tournament_unique_slug(
  p_tenant_id uuid,
  p_base text,
  p_exclude_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base      text := left(coalesce(public.slugify(p_base), 'tournament'), 80);
  candidate text;
  n         int := 1;
BEGIN
  IF base IS NULL OR base = '' THEN
    base := 'tournament';
  END IF;
  -- A bare UUID would be ambiguous with the legacy /t/<tenant>/<uuid> form.
  IF base ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    base := 'tournament';
  END IF;

  candidate := base;
  WHILE EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE tenant_id = p_tenant_id
      AND slug = candidate
      AND (p_exclude_id IS NULL OR id <> p_exclude_id)
  ) LOOP
    n := n + 1;
    candidate := base || '-' || n;
  END LOOP;

  RETURN candidate;
END;
$$;

-- Normalises whatever the app sends and fills in a derived slug when it sends
-- none, so a tournament created by any path still gets a readable URL.
CREATE OR REPLACE FUNCTION public.tournaments_apply_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF new.slug IS NOT NULL AND public.slugify(new.slug) IS NOT NULL THEN
    -- An explicit slug is normalised but never silently renamed: a collision
    -- raises a unique violation the admin sees as "that URL is taken".
    new.slug := left(public.slugify(new.slug), 80);
  ELSE
    new.slug := public.tournament_unique_slug(new.tenant_id, new.name, new.id);
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS tournaments_apply_slug_trigger ON tournaments;
CREATE TRIGGER tournaments_apply_slug_trigger
  BEFORE INSERT OR UPDATE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION public.tournaments_apply_slug();

-- Backfill existing tournaments from their names, oldest first so the earliest
-- tournament of a duplicated name keeps the unsuffixed slug.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, tenant_id, name FROM tournaments WHERE slug IS NULL ORDER BY created_at LOOP
    UPDATE tournaments
       SET slug = public.tournament_unique_slug(r.tenant_id, r.name, r.id)
     WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE tournaments ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tournaments_tenant_slug_key
  ON tournaments (tenant_id, slug);

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_slug_format;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_slug_format CHECK (
  slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  AND length(slug) BETWEEN 1 AND 80
  -- Never a bare UUID: the route resolver reads those as legacy ids.
  AND slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

-- ============================================================
-- TENANT SLUGS
-- ============================================================
-- Tenant slugs were already free text. Now that admins can edit them, normalise
-- what is stored and enforce the same shape as tournament slugs.

-- The reserved names a tenant slug may not take. Kept in one place so the
-- repair pass below and the constraint that follows can't drift apart.
CREATE OR REPLACE FUNCTION public.reserved_tenant_slugs()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY[
    'admin','api','auth','dashboard','t','_next','referee',
    'demo','soccer','basketball','tennis','favicon.ico','public','static','login','register'
  ];
$$;

-- Repair any existing slug that would fail the new rules — wrong shape, too
-- short, too long, or now reserved — keeping the tenant reachable rather than
-- blocking the migration.
DO $$
DECLARE
  r         record;
  base      text;
  candidate text;
  n         int;
BEGIN
  FOR r IN
    SELECT id, slug, display_name FROM tenants
    WHERE slug IS NULL
       OR slug IS DISTINCT FROM public.slugify(slug)
       OR length(slug) NOT BETWEEN 3 AND 80
       OR slug = ANY(public.reserved_tenant_slugs())
    ORDER BY created_at
  LOOP
    base := left(coalesce(public.slugify(r.slug), public.slugify(r.display_name), 'tenant'), 74);
    IF length(base) < 3 OR base = ANY(public.reserved_tenant_slugs()) THEN
      base := base || '-tennis';
    END IF;
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM tenants WHERE slug = candidate AND id <> r.id) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    UPDATE tenants SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_slug_format;
ALTER TABLE tenants ADD CONSTRAINT tenants_slug_format CHECK (
  slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  AND length(slug) BETWEEN 3 AND 80
);

-- Reserved list already existed; restate it so a renamed tenant can't claim a
-- top-level route. 'basketball' and 'soccer' were added as routes after 010.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_slug_not_reserved;
ALTER TABLE tenants ADD CONSTRAINT tenants_slug_not_reserved CHECK (
  NOT (slug = ANY(public.reserved_tenant_slugs()))
);

-- Lowercase whatever the settings page sends, so an admin typing
-- "University-of-Portland-Tennis-Womens" gets the canonical slug rather than a
-- constraint violation.
CREATE OR REPLACE FUNCTION public.tenants_apply_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF new.slug IS NOT NULL THEN
    new.slug := left(coalesce(public.slugify(new.slug), new.slug), 80);
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS tenants_apply_slug_trigger ON tenants;
CREATE TRIGGER tenants_apply_slug_trigger
  BEFORE INSERT OR UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenants_apply_slug();
