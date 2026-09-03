import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import BracketView from '@/components/BracketView';
import { resolvePublicTournament, isCanonicalPath, searchSuffix } from '@/lib/publicRoutes';
import { loadPreviewSource, previewDescription } from '@/lib/ogData';
import { tournamentPath } from '@/lib/slugs';
import type { Player, Match } from '@/types';

interface Props {
  params: Promise<{ slug: string; tournament: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Tournament-specific link preview; the card image lives in opengraph-image.tsx. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, tournament } = await params;
  const source = await loadPreviewSource(slug, tournament);
  if (!source) return { title: 'Tournament not found' };

  const description = previewDescription(source, 'bracket');
  const url = tournamentPath(source.tenantSlug, source.tournamentSlug);

  return {
    title: source.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: source.name,
      description,
      type: 'website',
      siteName: 'One Point Bowl',
      url,
    },
    twitter: { card: 'summary_large_image', title: source.name, description },
  };
}

export default async function PublicBracketPage({ params, searchParams }: Props) {
  const { slug, tournament: tournamentRef } = await params;

  const resolved = await resolvePublicTournament(slug, tournamentRef);
  if (!resolved) notFound();
  const { tenant, tournament, canonicalPath } = resolved;

  // Arrived on an old UUID link, or typed the slug in a different case — send
  // them to the one canonical URL so that is the one that gets shared onward.
  if (!isCanonicalPath(slug, tournamentRef, tenant.slug, tournament.slug)) {
    redirect(`${canonicalPath}${searchSuffix(await searchParams)}`);
  }

  const supabase = await createClient();
  const [{ data: players }, { data: matches }] = await Promise.all([
    supabase.from('players').select('*').eq('tournament_id', tournament.id),
    supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournament.id)
      .order('round_index')
      .order('match_index'),
  ]);

  const typedPlayers: Player[] = (players ?? []).map((p) => ({
    id: p.id,
    tournamentId: p.tournament_id,
    fullName: p.full_name,
    email: p.email,
    seedRating: p.seed_rating,
    skillTier: p.skill_tier,
    status: p.status,
  }));

  const typedMatches: Match[] = (matches ?? []).map((m) => ({
    id: m.id,
    tournamentId: m.tournament_id,
    roundIndex: m.round_index,
    matchIndex: m.match_index,
    player1Id: m.player1_id,
    player2Id: m.player2_id,
    serverPlayerId: m.server_player_id,
    winnerId: m.winner_id,
    status: m.status,
    bracket: m.bracket ?? 'main',
    courtNumber: m.court_number,
  }));

  const settings = tournament.settings as Record<string, unknown> | null;
  const isLive = tournament.status === 'live_play';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">{tournament.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              {isLive && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 animate-pulse">
                  ● LIVE
                </span>
              )}
              <span className="text-sm text-slate-500">
                {typedPlayers.length} players
              </span>
            </div>
          </div>
        </div>

        {typedMatches.length === 0 ? (
          <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200">
            <p className="text-3xl mb-2">🎾</p>
            <p className="font-medium">Bracket not yet generated.</p>
            <p className="text-sm mt-1">Check back when registration closes.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <BracketView
              initialMatches={typedMatches}
              players={typedPlayers}
              maxPlayers={(settings?.maxPlayers as number) ?? 32}
              tournamentId={tournament.id}
              liveUpdates={isLive}
            />
          </div>
        )}
      </div>
    </div>
  );
}
