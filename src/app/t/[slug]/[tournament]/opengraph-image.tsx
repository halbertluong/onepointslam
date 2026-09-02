import { loadPreviewSource, toCardData } from '@/lib/ogData';
import { tournamentCard, OG_SIZE } from '@/lib/ogCard';

export const alt = 'Tournament bracket';
export const size = OG_SIZE;
export const contentType = 'image/png';

export const revalidate = 3600;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; tournament: string }>;
}) {
  const { slug, tournament } = await params;
  const source = await loadPreviewSource(slug, tournament);
  if (!source) return new Response('Not found', { status: 404 });
  return tournamentCard(toCardData(source, 'bracket'));
}
