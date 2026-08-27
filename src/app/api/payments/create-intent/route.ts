import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { registrationIsOpen, verifyDirector } from '@/lib/registrationAccess';

export async function POST(req: NextRequest) {
  // Auth optional — guests may pay entry fees too. The amount and tournament are
  // derived server-side, so unauthenticated PI creation is safe here.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let body: { tournamentId?: string; directorEntry?: boolean; fullName?: string; email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { tournamentId } = body;
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 });

  // Look up the fee server-side — never trust caller-supplied amounts
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('settings, status, tenant_id, tenants(display_name, platform_fee)')
    .eq('id', tournamentId)
    .single();

  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

  const status = (tournament as Record<string, unknown>).status as string;
  const settings = tournament.settings as Record<string, unknown> | null;
  const entranceFee = (settings?.ticketPriceForFundraiser as number) ?? 0;

  // A director taking payment from the dashboard can charge after the public
  // link has closed; everyone else is held to the same gate as the sign-up form
  // so a registrant can never get through the form only to fail at payment.
  let isDirector = false;
  if (body.directorEntry) {
    const check = await verifyDirector(supabase, user?.id, (tournament as Record<string, unknown>).tenant_id as string);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
    isDirector = true;
  }

  if (!registrationIsOpen(status, settings) && !(isDirector && status !== 'completed')) {
    return NextResponse.json({ error: 'Registration is not open for this tournament' }, { status: 400 });
  }

  if (entranceFee <= 0) {
    return NextResponse.json({ error: 'This tournament has no entry fee' }, { status: 400 });
  }

  const tenantRaw = tournament.tenants as { display_name?: string; platform_fee?: number } | null;
  const platformFee = (settings?.systemTechFee as number) ?? tenantRaw?.platform_fee ?? 0;
  const totalCents = Math.round((entranceFee + platformFee) * 100);
  const tenantId = (tournament as Record<string, unknown>).tenant_id as string;

  try {
    const { createPaymentIntent } = await import('@/lib/stripe');
    // Metadata is what makes one shared Stripe account reconcilable across every
    // tenant — it's how a charge in the Stripe dashboard gets tied back to the
    // school, tournament, and registrant it belongs to.
    const result = await createPaymentIntent(totalCents, {
      tenant_id: tenantId,
      tenant_name: tenantRaw?.display_name ?? '',
      tournament_id: tournamentId,
      ...(body.fullName ? { registrant_name: body.fullName } : {}),
      ...(body.email ? { registrant_email: body.email } : {}),
      ...(user ? { user_id: user.id } : {}),
      ...(isDirector ? { director_entry: 'true' } : {}),
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment setup failed';
    console.error('[create-intent]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
