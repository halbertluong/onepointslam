/**
 * Whether a tournament offers the direct donate link on its registration page.
 *
 * Opt-out rather than opt-in: the donate path pre-dates this setting, so a
 * tournament that has never been saved since keeps its link. Only a director
 * explicitly switching it off — `allowDonations: false` — takes it away.
 *
 * Shared by the registration flow and the donate-intent route so the button and
 * the payment gate can't disagree: without it, a hidden link would still take
 * money from anyone who kept a stale page open.
 *
 * Takes either typed settings or the raw JSONB row, since the public flow reads
 * the tournament straight out of Supabase without mapping it.
 */
export function donationsAllowed(
  settings: { allowDonations?: boolean } | Record<string, unknown> | null | undefined,
): boolean {
  return (settings as { allowDonations?: unknown } | null | undefined)?.allowDonations !== false;
}
