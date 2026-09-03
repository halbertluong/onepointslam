import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { registrationIsOpen, verifyDirector } from '@/lib/registrationAccess';
import { getSiteUrl } from '@/lib/siteUrl';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Allow unauthenticated (guest) registrations — user may be null

  let body: {
    tournamentId?: string;
    fullName?: string;
    email?: string;
    gender?: string;
    ntrp?: string;
    utr?: string;
    age?: string;
    skillTier?: string;
    /** Set by the director dashboard to add a player at the desk. Authorization
     *  is verified server-side below — the flag alone grants nothing. */
    directorEntry?: boolean;
    /** Director entry only: whether the entry fee was collected offline. */
    markPaid?: boolean;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { tournamentId, fullName, email, gender, ntrp, utr, age, skillTier } = body;
  if (!tournamentId || !fullName || !email) {
    return NextResponse.json({ error: 'tournamentId, fullName, and email are required' }, { status: 400 });
  }

  // Look up tournament fee server-side
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('settings, status, tenant_id')
    .eq('id', tournamentId)
    .single();

  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

  const settings = tournament.settings as Record<string, unknown> | null;
  const entranceFee = (settings?.ticketPriceForFundraiser as number) ?? 0;

  // A director acting from the dashboard may register a player the public
  // couldn't — after registration closed, or with the fee collected offline —
  // so the claim is verified against the session rather than trusted.
  let isDirector = false;
  if (body.directorEntry) {
    const check = await verifyDirector(supabase, user?.id, tournament.tenant_id);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
    isDirector = true;
  }

  // Directors can add players right up until the tournament is finished.
  const allowed = registrationIsOpen(tournament.status, settings)
    || (isDirector && tournament.status !== 'completed');
  if (!allowed) {
    return NextResponse.json({ error: 'Registration is not open' }, { status: 400 });
  }

  // A real card payment never reaches this route: it goes through
  // /api/payments/create-intent, which reserves a pending_registrations row
  // before the charge happens, and the payment is what promotes that row into
  // players (see src/lib/paymentPromotion.ts). This route only ever creates a
  // player with no payment behind it — a free tournament, or a director
  // settling the fee offline — so it has no Stripe reference to verify.
  let paymentStatus: 'pending' | 'paid' = 'pending';
  if (entranceFee > 0) {
    if (!isDirector) {
      return NextResponse.json({ error: 'Payment required for this tournament' }, { status: 402 });
    }
    paymentStatus = body.markPaid ? 'paid' : 'pending';
  } else if (isDirector) {
    paymentStatus = body.markPaid ? 'paid' : 'pending';
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Duplicate check (before cap check — returning registrant gets accurate error)
  const { data: existing } = await admin
    .from('players')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('email', email)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: 'This email is already registered for this tournament.' }, { status: 409 });

  // Explicit cap check (service-role bypasses RLS)
  const playerCap = (settings?.playerRegistrationCap as number) ?? null;
  if (playerCap !== null) {
    const { count } = await admin
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .neq('status', 'no_show_eliminated');
    if ((count ?? 0) >= playerCap) {
      return NextResponse.json({ error: 'Registration is full' }, { status: 409 });
    }
  }

  const { data: inserted, error: insertErr } = await admin.from('players').insert({
    tournament_id: tournamentId,
    full_name: fullName,
    email,
    skill_tier: skillTier ?? null,
    gender: gender || null,
    ntrp_rating: ntrp ? parseFloat(ntrp) : null,
    utr_rating: utr ? parseFloat(utr) : null,
    age: age ? parseInt(age) : null,
    status: 'registered',
    user_id: user?.id ?? null,
    payment_status: paymentStatus,
    stripe_payment_intent_id: null,
  }).select('id').single();

  if (insertErr) {
    if (insertErr.code === '23505') return NextResponse.json({ error: 'This email is already registered.' }, { status: 409 });
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Fire-and-forget: send confirmation email
  fetch(`${getSiteUrl()}/api/email/registration-confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_API_SECRET ?? '',
    },
    body: JSON.stringify({ to: email, playerId: inserted?.id, tournamentId }),
  }).catch(() => {});

  // Close registration if cap reached
  if (playerCap !== null) {
    const { count: newCount } = await admin
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .neq('status', 'no_show_eliminated');
    if ((newCount ?? 0) >= playerCap) {
      await admin
        .from('tournaments')
        .update({ status: 'registration_closed', registration_close_reason: 'cap_reached' })
        .eq('id', tournamentId);
    }
  }

  return NextResponse.json({ playerId: inserted?.id });
}
