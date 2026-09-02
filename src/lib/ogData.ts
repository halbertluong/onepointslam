import { createClient } from '@supabase/supabase-js';
import { DEFAULT_PLATFORM_FEE, formatCurrency } from '@/lib/pricing';
import { isUuid } from '@/lib/slugs';
import type { OgCardData } from '@/lib/ogCard';

/**
 * Data for the link-preview cards.
 *
 * Deliberately does NOT use the cookie-bound server client: a preview card is
 * public, identical for everyone, and fetched by link crawlers rather than by a
 * signed-in visitor. Reading cookies would opt the image route into per-request
 * rendering, so every share would re-render the PNG — and iMessage in
 * particular gives up quickly. Public read policies cover both tables.
 */
const publicDb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

export interface PreviewSource {
  tenantSlug: string;
  tenantName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  tournamentSlug: string;
  name: string;
  status: string;
  settings: Record<string, unknown> | null;
}

/** Resolves the two URL segments the same way the pages do, slug or legacy id. */
export async function loadPreviewSource(
  tenantSegment: string,
  tournamentSegment: string,
): Promise<PreviewSource | null> {
  const db = publicDb();
  const tenantSlug = (tenantSegment ?? '').trim().toLowerCase();
  const ref = (tournamentSegment ?? '').trim().toLowerCase();
  if (!tenantSlug || !ref) return null;

  const { data: tenant } = await db
    .from('tenants')
    .select('id, slug, display_name, primary_color, secondary_color, logo_url')
    .eq('slug', tenantSlug)
    .maybeSingle();
  if (!tenant) return null;

  const query = db
    .from('tournaments')
    .select('slug, name, status, settings')
    .eq('tenant_id', tenant.id);

  const { data: tournament } = await (isUuid(ref)
    ? query.eq('id', ref)
    : query.eq('slug', ref)
  ).maybeSingle();
  if (!tournament) return null;

  return {
    tenantSlug: tenant.slug,
    tenantName: tenant.display_name,
    primaryColor: tenant.primary_color,
    secondaryColor: tenant.secondary_color,
    logoUrl: tenant.logo_url ?? null,
    tournamentSlug: tournament.slug,
    name: tournament.name,
    status: tournament.status,
    settings: (tournament.settings as Record<string, unknown> | null) ?? null,
  };
}

/** Fixed to UTC so the date on the card doesn't shift with the render region. */
function dateLabel(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/** What a registrant actually pays: the program's fee plus the platform fee. */
export function entryTotal(settings: Record<string, unknown> | null): number {
  const ticket = (settings?.ticketPriceForFundraiser as number) ?? 0;
  const platform = (settings?.systemTechFee as number) ?? DEFAULT_PLATFORM_FEE;
  return ticket + platform;
}

export function toCardData(source: PreviewSource, leaf: 'register' | 'bracket'): OgCardData {
  const s = source.settings;
  const facts: string[] = [];

  const date = dateLabel(s?.tournamentDate);
  if (date) facts.push(date);

  if (leaf === 'register') {
    const total = entryTotal(s);
    facts.push(total > 0 ? `${formatCurrency(total)} entry` : 'Free entry');
    const draw = s?.maxPlayers as number | undefined;
    if (draw) facts.push(`${draw}-player draw`);
  } else if (source.status === 'live_play') {
    facts.push('Live now');
  }

  return {
    title: source.name,
    school: source.tenantName,
    primaryColor: source.primaryColor,
    secondaryColor: source.secondaryColor,
    logoUrl: source.logoUrl,
    facts,
    cta: leaf === 'register' ? 'Register →' : 'View bracket →',
  };
}

/** The sentence shown under the title in a chat preview. */
export function previewDescription(source: PreviewSource, leaf: 'register' | 'bracket'): string {
  if (leaf === 'bracket') {
    return source.status === 'live_play'
      ? `Live bracket and scores for ${source.name}, hosted by ${source.tenantName}.`
      : `Bracket and results for ${source.name}, hosted by ${source.tenantName}.`;
  }
  const total = entryTotal(source.settings);
  const price = total > 0 ? `${formatCurrency(total)} to enter` : 'Free to enter';
  const date = dateLabel(source.settings?.tournamentDate);
  return [
    `Sign up for ${source.name}, hosted by ${source.tenantName}.`,
    date ? `${date}.` : null,
    `${price} — every entry supports the team.`,
  ].filter(Boolean).join(' ');
}
