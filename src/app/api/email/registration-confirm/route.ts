import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // Require an internal secret so this endpoint can't be used as an open email relay
  const secret = process.env.INTERNAL_API_SECRET;
  if (secret && req.headers.get('x-internal-secret') !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    // No-op — email not configured. Registration still succeeds.
    return NextResponse.json({ sent: false, reason: 'RESEND_API_KEY not configured' });
  }

  const { to, playerName, tournamentName, tenantName } = await req.json() as {
    to?: string;
    playerName?: string;
    tournamentName?: string;
    tenantName?: string;
  };

  if (!to || !playerName || !tournamentName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const from = process.env.RESEND_FROM_EMAIL ?? 'noreply@onepointbowl.com';
  const orgName = tenantName ?? 'One Point Bowl';

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
        subject: `You're registered for ${tournamentName}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
            <h1 style="font-size:22px;font-weight:900;color:#1a2033;margin-bottom:8px">
              You&rsquo;re in, ${playerName}!
            </h1>
            <p style="color:#6b7590;font-size:15px;line-height:1.6">
              Your registration for <strong style="color:#1a2033">${tournamentName}</strong>
              hosted by <strong style="color:#1a2033">${orgName}</strong> is confirmed.
            </p>
            <p style="color:#6b7590;font-size:15px;line-height:1.6;margin-top:16px">
              The organizer will be in touch with event details, court assignments, and schedule.
              Check back on the tournament page for live bracket updates on match day.
            </p>
            <hr style="border:none;border-top:1px solid #dde1e9;margin:24px 0"/>
            <p style="color:#9ba8c0;font-size:12px">
              Sent by ${orgName} via One Point Bowl
            </p>
          </div>
        `,
        text: `Hi ${playerName},\n\nYour registration for ${tournamentName} hosted by ${orgName} is confirmed.\n\nThe organizer will be in touch with event details soon.\n\n—\nSent by ${orgName} via One Point Bowl`,
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
