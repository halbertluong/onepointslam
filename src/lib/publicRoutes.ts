import { createClient } from '@/lib/supabase/server';
import { isUuid, tournamentPath } from '@/lib/slugs';

/**
 * Resolving the two segments of /t/<tenant>/<tournament>.
 *
 * Both segments are slugs an admin can rename, and the tournament segment used
 * to be a UUID, so every lookup here accepts either form:
 *
 *   - slugs match case-insensitively, so a link printed as
 *     `.../Portland-One-Point-Bowl-Fall-2026/register` still lands;
 *   - a UUID in the tournament segment still resolves, so links already handed
 *     out — QR codes on posters, confirmation emails — keep working forever.
 *
 * Anything that isn't already the canonical form gets redirected to it by the
 * pages, so only one URL is ever shared going forward.
 */

export interface ResolvedTenant {
  id: string;
  slug: string;
  display_name: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  platform_fee?: number;
  stripe_connect_account_id?: string;
}

export interface ResolvedTournament {
  id: string;
  slug: string;
  tenant_id: string;
  name: string;
  status: string;
  settings?: Record<string, unknown> | null;
  deleted_at?: string | null;
  archived_at?: string | null;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Slugs are stored canonically lowercase, so lowercasing the URL segment and
 * matching on equality gives case-insensitive lookup without handing user input
 * to `ilike`, where `%` and `_` would act as wildcards. Route params arrive
 * already percent-decoded, so there is nothing to decode here.
 */
function canonicalise(segment: string): string {
  return (segment ?? '').trim().toLowerCase();
}

export async function findTenant(
  supabase: Supabase,
  slugSegment: string,
): Promise<ResolvedTenant | null> {
  const slug = canonicalise(slugSegment);
  if (!slug) return null;
  const { data } = await supabase.from('tenants').select('*').eq('slug', slug).maybeSingle();
  return (data as ResolvedTenant | null) ?? null;
}

export async function findTournament(
  supabase: Supabase,
  tenantId: string,
  segment: string,
): Promise<ResolvedTournament | null> {
  const ref = canonicalise(segment);
  if (!ref) return null;

  // A UUID is the legacy identifier, still handed out on printed material.
  if (isUuid(ref)) {
    const { data } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', ref)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return (data as ResolvedTournament | null) ?? null;
  }

  const { data } = await supabase
    .from('tournaments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('slug', ref)
    .maybeSingle();
  return (data as ResolvedTournament | null) ?? null;
}

/**
 * Resolves both segments at once. Returns the rows plus the canonical path for
 * this page, so the caller can redirect when the visitor arrived on an old
 * UUID link or typed the slug in a different case.
 */
export async function resolvePublicTournament(
  slugSegment: string,
  tournamentSegment: string,
  leaf?: 'register' | 'live',
): Promise<{ tenant: ResolvedTenant; tournament: ResolvedTournament; canonicalPath: string } | null> {
  const supabase = await createClient();
  const tenant = await findTenant(supabase, slugSegment);
  if (!tenant) return null;

  const tournament = await findTournament(supabase, tenant.id, tournamentSegment);
  if (!tournament) return null;

  return {
    tenant,
    tournament,
    canonicalPath: tournamentPath(tenant.slug, tournament.slug, leaf),
  };
}

/** True when the visited URL already is the canonical one — nothing to redirect. */
export function isCanonicalPath(
  slugSegment: string,
  tournamentSegment: string,
  tenantSlug: string,
  tournamentSlug: string,
): boolean {
  return slugSegment === tenantSlug && tournamentSegment === tournamentSlug;
}

/** Rebuilds the query string so a redirect doesn't drop `?invite=…`. */
export function searchSuffix(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): string {
  if (!searchParams) return '';
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else if (value !== undefined) qs.append(key, value);
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}
