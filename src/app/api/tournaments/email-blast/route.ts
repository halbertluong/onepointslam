import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!['super_admin', 'tenant_admin'].includes(appUser?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { tournamentId, subject, body: message, recipientEmails } = body as {
    tournamentId: string;
    subject: string;
    body: string;
    recipientEmails: string[];
  };

  if (!tournamentId || !subject || !message || !recipientEmails?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify the tournament belongs to a tenant the user manages
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, tenant_id, tenants(display_name)')
    .eq('id', tournamentId)
    .single();

  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });

  if (appUser?.role !== 'super_admin') {
    const { data: me } = await supabase.from('users').select('assigned_tenant_ids').eq('id', user.id).single();
    const assigned: string[] = me?.assigned_tenant_ids ?? [];
    if (!assigned.includes(tournament.tenant_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const tenantRaw = tournament.tenants as unknown;
  const tenantName = (tenantRaw && typeof tenantRaw === 'object' && 'display_name' in tenantRaw)
    ? (tenantRaw as { display_name: string }).display_name
    : 'One Point Bowl';

  // Use Supabase Auth to send emails via their built-in SMTP
  // (or fall back to logging if no email provider configured)
  const resendApiKey = process.env.RESEND_API_KEY;

  if (resendApiKey) {
    // Send via Resend
    const results = await Promise.allSettled(
      recipientEmails.map((email) =>
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: `${tenantName} via One Point Bowl <noreply@onepointbowl.com>`,
            to: [email],
            subject,
            text: `${message}\n\n---\nSent by ${tenantName} via One Point Bowl`,
            html: `<p>${message.replace(/\n/g, '<br/>')}</p><hr/><p style="color:#888;font-size:12px">Sent by ${tenantName} via One Point Bowl</p>`,
          }),
        })
      )
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      return NextResponse.json({ error: `${failed} of ${recipientEmails.length} emails failed to send` }, { status: 500 });
    }
    return NextResponse.json({ sent: recipientEmails.length });
  }

  // No email provider — log and return a clear message for now
  console.log(`[email-blast] Would send to ${recipientEmails.length} recipients:`, { subject, message, recipientEmails });
  return NextResponse.json({
    sent: 0,
    warning: 'No email provider configured. Set RESEND_API_KEY in environment variables to enable sending. Recipients logged to server console.',
  });
}
