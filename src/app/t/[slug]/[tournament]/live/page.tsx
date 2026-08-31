import { notFound, redirect } from 'next/navigation';
import LiveScoreboard from '@/components/LiveScoreboard';
import { resolvePublicTournament, isCanonicalPath, searchSuffix } from '@/lib/publicRoutes';

interface Props {
  params: Promise<{ slug: string; tournament: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LivePage({ params, searchParams }: Props) {
  const { slug, tournament: tournamentRef } = await params;

  const resolved = await resolvePublicTournament(slug, tournamentRef, 'live');
  if (!resolved) notFound();
  const { tenant, tournament, canonicalPath } = resolved;

  if (!isCanonicalPath(slug, tournamentRef, tenant.slug, tournament.slug)) {
    redirect(`${canonicalPath}${searchSuffix(await searchParams)}`);
  }

  return <LiveScoreboard tournamentId={tournament.id} />;
}
