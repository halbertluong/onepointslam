import { loadPreviewSource, toCardData } from '@/lib/ogData';
import { tournamentCard, OG_SIZE } from '@/lib/ogCard';

export const alt = 'Tournament registration';
export const size = OG_SIZE;
export const contentType = 'image/png';

/** Regenerated at most hourly — the card only changes when a director edits the tournament. */
export const revalidate = 3600;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; tournament: string }>;
}) {
  const { slug, tournament } = await params;
  const source = await loadPreviewSource(slug, tournament);
  if (!source) return new Response('Not found', { status: 404 });
  return tournamentCard(toCardData(source, 'register'));
}
