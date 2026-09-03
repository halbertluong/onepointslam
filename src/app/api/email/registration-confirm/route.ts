import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { formatCurrency } from '@/lib/pricing';

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(req: NextRequest) {
  // Only accept calls from our own server (registrations route passes this header)
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (internalSecret && req.headers.get('x-internal-secret') !== internalSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return NextResponse.json({ sent: false, reason: 'RESEND_API_KEY not configured' });
  }

  let parsed: { to?: string; tournamentId?: string; playerId?: string };
  try { parsed = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { to, tournamentId, playerId } = parsed;

  if (!to || !tournamentId || !playerId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Pull player + tournament + tenant names from DB — never trust caller-supplied display strings
  const { data: player } = await admin
    .from('players')
    .select('id, full_name, last_confirmation_sent_at, payment_status, stripe_payment_intent_id, tournaments(name, tenants(display_name))')
    .eq('tournament_id', tournamentId)
    .eq('email', to.toLowerCase())
    .maybeSingle();

  if (!player) {
    return NextResponse.json({ error: 'Player not found for this tournament' }, { status: 403 });
  }

  // Verify the caller knows the player's UUID (unguessable — proves they just inserted this row)
  if (player.id !== playerId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // DB-backed rate-limit: at most one confirmation email per player per 5 minutes
  if (player.last_confirmation_sent_at) {
    const elapsed = Date.now() - new Date(player.last_confirmation_sent_at).getTime();
    if (elapsed < COOLDOWN_MS) {
      return NextResponse.json({ sent: false, reason: 'Email recently sent — please wait before retrying' });
    }
  }
  await admin.from('players').update({ last_confirmation_sent_at: new Date().toISOString() }).eq('id', player.id);

  // Use DB-sourced values — ignore any caller-supplied playerName/tournamentName/tenantName
  const t = player.tournaments as unknown as { name: string; tenants: { display_name: string } } | null;
  const resolvedPlayerName = player.full_name ?? 'Player';
  const resolvedTournamentName = t?.name ?? 'the tournament';
  const resolvedOrgName = t?.tenants?.display_name ?? 'One Point Bowl';
  const isPaid = player.payment_status === 'paid';

  // payment_status is only ever 'paid' once Stripe itself reported the charge
  // succeeded (see promotePendingRegistration / the director's markPaid entry),
  // so it's already safe to confirm the payment here — retrieving the
  // PaymentIntent is just to quote the exact amount. If that lookup fails,
  // the paid confirmation still goes out, just without a dollar figure.
  let amountPaid: string | null = null;
  if (isPaid && player.stripe_payment_intent_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const { createStripeClient } = await import('@/lib/stripe');
      const stripe = await createStripeClient(process.env.STRIPE_SECRET_KEY);
      const pi = await stripe.paymentIntents.retrieve(player.stripe_payment_intent_id);
      amountPaid = formatCurrency(pi.amount / 100);
    } catch (err) {
      console.error('[registration-confirm] Could not retrieve payment amount:', err);
    }
  }

  const from = process.env.RESEND_FROM_EMAIL ?? 'noreply@onepointbowl.com';
  const orgName = resolvedOrgName;

  function escHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const safePlayerName = escHtml(resolvedPlayerName);
  const safeTournamentName = escHtml(resolvedTournamentName);
  const safeOrgName = escHtml(orgName);

  const subject = isPaid
    ? `You're registered and paid for ${safeTournamentName}`
    : `You're registered for ${safeTournamentName}`;

  const paymentHtml = isPaid
    ? `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-top:16px">
              <p style="color:#166534;font-size:14px;font-weight:700;margin:0">
                Payment received${amountPaid ? `: ${amountPaid}` : ''}
              </p>
              <p style="color:#166534;font-size:13px;margin:4px 0 0">
                Your entry fee has been charged successfully. Consider this email your receipt.
              </p>
            </div>`
    : '';
  const paymentText = isPaid
    ? `\n\nPayment received${amountPaid ? `: ${amountPaid}` : ''}. Your entry fee has been charged successfully. Consider this email your receipt.`
    : '';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: `${orgName} via One Point Bowl <${from}>`,
        to: [to],
        subject,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
            <h1 style="font-size:22px;font-weight:900;color:#1a2033;margin-bottom:8px">
              You&rsquo;re in, ${safePlayerName}!
            </h1>
            <p style="color:#6b7590;font-size:15px;line-height:1.6">
              Your registration for <strong style="color:#1a2033">${safeTournamentName}</strong>
              hosted by <strong style="color:#1a2033">${safeOrgName}</strong> is confirmed.
            </p>${paymentHtml}
            <p style="color:#6b7590;font-size:15px;line-height:1.6;margin-top:16px">
              The organizer will be in touch with event details, court assignments, and schedule.
              Check back on the tournament page for live bracket updates on match day.
            </p>
            <hr style="border:none;border-top:1px solid #dde1e9;margin:24px 0"/>
            <p style="color:#9ba8c0;font-size:12px">
              Sent by ${safeOrgName} via One Point Bowl
            </p>
          </div>
        `,
        text: `Hi ${resolvedPlayerName},\n\nYour registration for ${resolvedTournamentName} hosted by ${orgName} is confirmed.${paymentText}\n\nThe organizer will be in touch with event details soon.\n\n—\nSent by ${orgName} via One Point Bowl`,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[registration-confirm] Resend error:', body);
      return NextResponse.json({ sent: false, reason: 'Resend API error' });
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error('[registration-confirm] Fetch error:', err);
    return NextResponse.json({ sent: false, reason: 'Network error' });
  }
}
