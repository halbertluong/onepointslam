import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import RegistrationFlow from '@/components/RegistrationFlow';
import { resolvePublicTournament, isCanonicalPath, searchSuffix } from '@/lib/publicRoutes';
import { loadPreviewSource, previewDescription } from '@/lib/ogData';
import { tournamentPath } from '@/lib/slugs';

interface Props {
  params: Promise<{ slug: string; tournament: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Names the tournament in the link preview a chat app builds when this URL is
 * shared. Without it every registration link showed the same site-wide title,
 * so a group chat couldn't tell one tournament from another. The card image
 * itself comes from opengraph-image.tsx alongside this file.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, tournament } = await params;
  const source = await loadPreviewSource(slug, tournament);
  if (!source) return { title: 'Tournament not found' };

  const title = `Register — ${source.name}`;
  const description = previewDescription(source, 'register');

  return {
    title,
    description,
    alternates: {
      canonical: tournamentPath(source.tenantSlug, source.tournamentSlug, 'register'),
    },
    openGraph: {
      title: source.name,
      description,
      type: 'website',
      siteName: 'One Point Bowl',
      url: tournamentPath(source.tenantSlug, source.tournamentSlug, 'register'),
    },
    twitter: { card: 'summary_large_image', title: source.name, description },
  };
}

/**
 * Resolved on the server so the registration flow — which queries by the
 * tournament's real id — never has to care whether the visitor arrived on the
 * readable slug or an older UUID link.
 */
export default async function RegisterPage({ params, searchParams }: Props) {
  const { slug, tournament: tournamentRef } = await params;

  const resolved = await resolvePublicTournament(slug, tournamentRef, 'register');
  if (!resolved) notFound();
  const { tenant, tournament, canonicalPath } = resolved;

  if (!isCanonicalPath(slug, tournamentRef, tenant.slug, tournament.slug)) {
    redirect(`${canonicalPath}${searchSuffix(await searchParams)}`);
  }

  return (
    <RegistrationFlow
      slug={tenant.slug}
      tournamentId={tournament.id}
      tournamentSlug={tournament.slug}
    />
  );
}
