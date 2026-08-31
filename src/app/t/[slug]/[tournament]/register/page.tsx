import { notFound, redirect } from 'next/navigation';
import RegistrationFlow from '@/components/RegistrationFlow';
import { resolvePublicTournament, isCanonicalPath, searchSuffix } from '@/lib/publicRoutes';

interface Props {
  params: Promise<{ slug: string; tournament: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
