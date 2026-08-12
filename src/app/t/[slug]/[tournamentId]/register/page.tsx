'use client';

import { useParams } from 'next/navigation';
import RegistrationFlow from '@/components/RegistrationFlow';

export default function RegisterPage() {
  const { slug, tournamentId } = useParams<{ slug: string; tournamentId: string }>();
  return <RegistrationFlow slug={slug} tournamentId={tournamentId} />;
}
