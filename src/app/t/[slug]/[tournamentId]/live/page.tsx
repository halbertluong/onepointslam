'use client';

import { useParams } from 'next/navigation';
import LiveScoreboard from '@/components/LiveScoreboard';

export default function LivePage() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  return <LiveScoreboard tournamentId={tournamentId} />;
}
