/**
 * Readable URL slugs for tenants and tournaments.
 *
 * Registration links are read off flyers, printed on QR posters, and typed into
 * phones, so both segments of /t/<tenant>/<tournament>/register are words rather
 * than the tournament's UUID. These helpers are the single client-side source of
 * truth for what a slug may look like; migration 024 enforces the same rules in
 * the database, so a slug that passes here is one Postgres will also accept.
 */

/** Top-level route names a tenant slug would shadow. Mirrors reserved_tenant_slugs() in SQL. */
export const RESERVED_TENANT_SLUGS = [
  'admin', 'api', 'auth', 'dashboard', 't', '_next', 'referee',
  'demo', 'soccer', 'basketball', 'tennis', 'favicon.ico', 'public', 'static', 'login', 'register',
];

export const TENANT_SLUG_MIN = 3;
export const SLUG_MAX = 80;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** True for the legacy tournament identifier, which routes still resolve. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Canonical slug form: lowercase, apostrophes dropped rather than turned into
 * separators ("Women's" → "womens"), everything else non-alphanumeric collapsed
 * to single dashes. Matches public.slugify() in the database exactly.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’`´]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
}

/**
 * What to keep while the admin is still typing. Unlike slugify() this leaves a
 * trailing dash alone, so typing "fall-" then "2026" doesn't fight the cursor.
 */
export function slugifyWhileTyping(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’`´]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX);
}

/** Returns an error message for an unusable tenant slug, or null when it's fine. */
export function validateTenantSlug(slug: string): string | null {
  if (!slug) return 'Pick a URL name for your program.';
  if (slug.length < TENANT_SLUG_MIN) return `Use at least ${TENANT_SLUG_MIN} characters.`;
  if (slug.length > SLUG_MAX) return `Keep it under ${SLUG_MAX} characters.`;
  if (!SLUG_RE.test(slug)) return 'Use lowercase letters, numbers, and single dashes only.';
  if (RESERVED_TENANT_SLUGS.includes(slug)) return `“${slug}” is reserved. Please choose a different one.`;
  return null;
}

/** Returns an error message for an unusable tournament slug, or null when it's fine. */
export function validateTournamentSlug(slug: string): string | null {
  if (!slug) return 'Pick a URL name for this tournament.';
  if (slug.length > SLUG_MAX) return `Keep it under ${SLUG_MAX} characters.`;
  if (!SLUG_RE.test(slug)) return 'Use lowercase letters, numbers, and single dashes only.';
  if (isUuid(slug)) return 'That looks like an ID rather than a name — try something readable.';
  return null;
}

/** The public path for a tournament page, with an optional `register` / `live` leaf. */
export function tournamentPath(
  tenantSlug: string,
  tournamentSlug: string,
  leaf?: 'register' | 'live',
): string {
  const base = `/t/${tenantSlug}/${tournamentSlug}`;
  return leaf ? `${base}/${leaf}` : base;
}
