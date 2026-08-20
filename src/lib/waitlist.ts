import type { Player } from '@/types';

/** A player still eligible for a bracket seat — not withdrawn/eliminated. */
function isEligible(p: Player): boolean {
  return p.status === 'registered' || p.status === 'waitlisted' || p.status === 'checked_in';
}

/** Registration queue order: earliest registrant first, since they get
 *  priority for a bracket seat over someone who signed up later. */
export function byRegistrationOrder(players: Player[]): Player[] {
  return [...players].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Splits a tournament's eligible roster into who fits in a `capacity`-slot
 * bracket and who doesn't, by registration order — earliest registrants seed
 * the bracket, the newest overflow is the waitlist. This is the single rule
 * every automated waitlist decision (initial generation, a Draw Editor
 * rebuild, a new registration arriving after the bracket is full) goes
 * through, so they can never disagree about who's in and who's waiting.
 */
export function splitByCapacity(
  players: Player[],
  capacity: number,
): { seated: Player[]; overflow: Player[] } {
  const eligible = byRegistrationOrder(players.filter(isEligible));
  return { seated: eligible.slice(0, capacity), overflow: eligible.slice(capacity) };
}

/** Short, human-readable registration timestamp for waitlist / roster tables. */
export function formatRegisteredAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
