/**
 * Shared vocabulary for the "match is queued for a referee" statuses, used by
 * every referee-queue list (the real dashboard's tab, the /demo sandbox's
 * director tab, and the full-screen referee console) so the labels, sort
 * order, and colors only have to be defined once.
 */

export const MATCH_STATUS_ORDER: Record<string, number> = {
  playing: 0,
  court_assigned: 1,
  warmup: 2,
  scheduled: 3,
};

export const MATCH_STATUS_LABEL: Record<string, string> = {
  playing: '● LIVE',
  court_assigned: 'Court Assigned',
  warmup: 'Warmup',
  scheduled: 'Scheduled',
  finalized: 'Complete',
  walkover: 'Complete',
};

export const MATCH_STATUS_STYLE: Record<string, string> = {
  playing: 'bg-red-100 text-red-700',
  court_assigned: 'bg-blue-100 text-blue-700',
  warmup: 'bg-amber-100 text-amber-700',
  scheduled: 'bg-slate-100 text-slate-500',
  finalized: 'bg-emerald-100 text-emerald-700',
  walkover: 'bg-emerald-100 text-emerald-700',
};
