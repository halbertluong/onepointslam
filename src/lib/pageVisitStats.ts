export interface PageVisitRow {
  created_at: string;
  referrer: string | null;
  ip_address: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  user_agent: string | null;
}

export interface PageVisitStats {
  total: number;
  last7Days: number;
  last30Days: number;
  byDay: { date: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
  topLocations: { location: string; count: number }[];
  recent: PageVisitRow[];
}

/** Referrer URLs collapse to their host — "3 visits from google.com", not
 *  three different search-result URLs that all mean the same source. */
function referrerLabel(referrer: string | null): string {
  if (!referrer) return 'Direct / no referrer';
  try {
    return new URL(referrer).hostname.replace(/^www\./, '');
  } catch {
    return referrer;
  }
}

function locationLabel(row: PageVisitRow): string {
  const parts = [row.city, row.region, row.country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Unknown';
}

function topCounts(labels: string[], limit: number): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  labels.forEach((l) => counts.set(l, (counts.get(l) ?? 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

export function summarizeVisits(rows: PageVisitRow[]): PageVisitStats {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const last7Days = rows.filter((r) => now - new Date(r.created_at).getTime() <= 7 * day).length;
  const last30Days = rows.filter((r) => now - new Date(r.created_at).getTime() <= 30 * day).length;

  const byDayMap = new Map<string, number>();
  rows.forEach((r) => {
    if (now - new Date(r.created_at).getTime() > 30 * day) return;
    const date = r.created_at.slice(0, 10);
    byDayMap.set(date, (byDayMap.get(date) ?? 0) + 1);
  });
  const byDay = [...byDayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  return {
    total: rows.length,
    last7Days,
    last30Days,
    byDay,
    topReferrers: topCounts(rows.map((r) => referrerLabel(r.referrer)), 10)
      .map(({ label, count }) => ({ referrer: label, count })),
    topLocations: topCounts(rows.map(locationLabel), 10)
      .map(({ label, count }) => ({ location: label, count })),
    recent: rows.slice(0, 20),
  };
}
