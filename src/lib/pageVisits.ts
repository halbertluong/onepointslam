import { headers } from 'next/headers';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Best-effort visit-of-the-registration-page log, called from the page
 * component itself so it captures every server-rendered load — including
 * visitors with JS disabled. Geography comes from the `x-vercel-ip-*`
 * headers Vercel's edge attaches to every request; on other hosts, or in
 * local dev, those are simply absent and the row is written with nulls
 * there. Never throws: a broken insert (missing service-role key, DB
 * hiccup) must not take the registration page down with it.
 */
export async function recordPageVisit(args: {
  page: 'tournament_register' | 'account_register';
  path: string;
  tournamentId?: string;
  tenantId?: string;
}): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;

  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for') ?? '';
    const ip = h.get('x-real-ip') || forwarded.split(',').at(0)?.trim() || null;

    await admin().from('registration_page_visits').insert({
      page: args.page,
      path: args.path,
      tournament_id: args.tournamentId ?? null,
      tenant_id: args.tenantId ?? null,
      referrer: h.get('referer') || null,
      ip_address: ip,
      country: h.get('x-vercel-ip-country') || null,
      region: h.get('x-vercel-ip-country-region') || null,
      city: h.get('x-vercel-ip-city') ? decodeURIComponent(h.get('x-vercel-ip-city')!) : null,
      user_agent: h.get('user-agent') || null,
    });
  } catch {
    // Analytics is never allowed to break the page it's measuring.
  }
}
