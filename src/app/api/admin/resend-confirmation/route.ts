import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  // Only super_admins may resend confirmation emails
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: appUser } = await adminClient.from('users').select('role').eq('id', user.id).single();
  if (appUser?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email } = await req.json() as { email?: string };

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const { data: linkData, error } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/auth/confirm`,
    },
  });

  if (error || !linkData?.properties?.action_link) {
    return NextResponse.json({ error: error?.message ?? 'Failed to generate link' }, { status: 500 });
  }

  const magicLink = linkData.properties.action_link;
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? 'noreply@onepointbowl.com';

  if (resendApiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: `One Point Bowl <${from}>`,
        to: [email],
        subject: 'Sign in to One Point Bowl',
        html: `<p>Click the link below to sign in to One Point Bowl. This link expires in 1 hour.</p><p><a href="${magicLink}">Sign in</a></p>`,
        text: `Sign in to One Point Bowl:\n\n${magicLink}\n\nThis link expires in 1 hour.`,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[resend-confirmation] Resend error:', body);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }
  } else {
    console.log('[resend-confirmation] RESEND_API_KEY not set — magic link:', magicLink);
  }

  return NextResponse.json({ success: true });
}
