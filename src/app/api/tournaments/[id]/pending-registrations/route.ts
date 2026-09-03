import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { verifyDirector } from '@/lib/registrationAccess';
import { releasePendingCoupon } from '@/lib/coupons';

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * pending_registrations carries the personal details of people who haven't
 * completed registration yet, so unlike `players` (public-read, for the
 * spectator bracket page) it has no read policy at all — every access is
 * director-authorized through here.
 */
async function authorize(tournamentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: tournament } = await supabase
    .from('tournaments').select('tenant_id').eq('id', tournamentId).single();
  if (!tournament) return { error: 'Tournament not found', status: 404 as const };
  const check = await verifyDirector(supabase, user?.id, tournament.tenant_id);
  if (!check.ok) return { error: check.error, status: check.status };
  return { ok: true as const };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params;
  const auth = await authorize(tournamentId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await admin()
    .from('pending_registrations')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ pendingRegistrations: data ?? [] });
}

/**
 * Director dismisses a stale, clearly-abandoned attempt from the list.
 *
 * Deleting the row alone isn't safe on its own: the PaymentIntent it points
 * to can still be sitting there payable, and if the payer came back and
 * finished paying after their reservation was removed, promotion would find
 * no row to promote and the card would be charged with nothing to show for
 * it — the exact orphaned-payment problem this whole feature exists to
 * prevent. So this cancels the PaymentIntent first (best-effort; it may
 * already be canceled or too far along, which is fine), and refuses outright
 * if Stripe already reports it succeeded — that reservation isn't abandoned,
 * it's unpromoted, and deleting it would destroy the only record of real
 * money taken. The Payments tab's "Move to roster" is the right tool there.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await params;
  const auth = await authorize(tournamentId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const pendingId = req.nextUrl.searchParams.get('pendingId');
  if (!pendingId) return NextResponse.json({ error: 'pendingId is required' }, { status: 400 });

  const db = admin();
  const { data: pending, error: fetchErr } = await db
    .from('pending_registrations')
    .select('id, stripe_payment_intent_id')
    .eq('id', pendingId)
    .eq('tournament_id', tournamentId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!pending) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey) {
    try {
      const { createStripeClient } = await import('@/lib/stripe');
      const stripe = await createStripeClient(stripeKey);
      const pi = await stripe.paymentIntents.retrieve(pending.stripe_payment_intent_id);
      if (pi.status === 'succeeded') {
        return NextResponse.json(
          { error: 'This payment already succeeded — use "Move to roster" on the Payments tab instead of removing it.' },
          { status: 409 },
        );
      }
      await stripe.paymentIntents.cancel(pending.stripe_payment_intent_id).catch(() => {
        // Already canceled, already failed, or too far along to cancel —
        // none of that should block removing the reservation.
      });
    } catch {
      // Couldn't reach Stripe or the PI is gone entirely — proceed with the
      // delete rather than leave a stale reservation stuck because Stripe is
      // unreachable; there's nothing payable behind an intent that doesn't exist.
    }
  }

  // Give back any coupon use this abandoned attempt reserved, before the row
  // that tracks it is gone.
  await releasePendingCoupon(db, { id: pendingId });

  const { error } = await db
    .from('pending_registrations')
    .delete()
    .eq('id', pendingId)
    .eq('tournament_id', tournamentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
