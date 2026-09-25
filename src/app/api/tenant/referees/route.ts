import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/siteUrl';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Resolves which tenant the caller may manage referees for, or null if they can't manage any. */
async function resolveTenantId(req: NextRequest): Promise<
  | { tenantId: string; userId: string }
  | { error: string; status: number }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 };

  const { data: appUser } = await supabase
    .from('users').select('role, assigned_tenant_ids').eq('id', user.id).single();
  if (!appUser) return { error: 'Unauthorized', status: 401 };

  if (appUser.role === 'tenant_admin') {
    const tenantId = appUser.assigned_tenant_ids?.[0];
    if (!tenantId) return { error: 'No program assigned to this account', status: 403 };
    return { tenantId, userId: user.id };
  }

  if (appUser.role === 'super_admin') {
    const tenantId = new URL(req.url).searchParams.get('tenantId');
    if (!tenantId) return { error: 'tenantId is required', status: 400 };
    return { tenantId, userId: user.id };
  }

  return { error: 'Forbidden', status: 403 };
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const resolved = await resolveTenantId(req);
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const admin = adminClient();
  const { data, error } = await admin
    .from('users')
    .select('id, email, role, created_at')
    .eq('role', 'referee')
    .contains('assigned_tenant_ids', [resolved.tenantId])
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ referees: data ?? [] });
}

export async function POST(req: NextRequest) {
  const resolved = await resolveTenantId(req);
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { tenantId } = resolved;

  let parsed: { email?: string };
  try { parsed = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const email = parsed.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  }

  const admin = adminClient();

  const { data: tenant } = await admin.from('tenants').select('display_name').eq('id', tenantId).single();
  if (!tenant) return NextResponse.json({ error: 'Program not found' }, { status: 404 });

  const { data: existing } = await admin
    .from('users').select('id, role, assigned_tenant_ids').eq('email', email).maybeSingle();

  let created = false;

  if (existing) {
    if (existing.role === 'tenant_admin' || existing.role === 'super_admin') {
      return NextResponse.json({
        error: 'This person already has a director or admin account. Ask a super admin to change their role.',
      }, { status: 409 });
    }
    const tenantIds = new Set(existing.assigned_tenant_ids ?? []);
    tenantIds.add(tenantId);
    const { error: updateError } = await admin
      .from('users')
      .update({ role: 'referee', assigned_tenant_ids: [...tenantIds] })
      .eq('id', existing.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  } else {
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${getSiteUrl()}/auth/confirm?next=/referee` },
    });
    if (linkError || !linkData?.user) {
      return NextResponse.json({ error: linkError?.message ?? 'Failed to create account' }, { status: 500 });
    }
    created = true;

    const { error: updateError } = await admin
      .from('users')
      .update({ role: 'referee', assigned_tenant_ids: [tenantId] })
      .eq('id', linkData.user.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const actionLink = linkData.properties?.action_link;
    if (actionLink) {
      await sendInviteEmail(email, tenant.display_name, actionLink);
    }
  }

  return NextResponse.json({ success: true, created });
}

export async function DELETE(req: NextRequest) {
  const resolved = await resolveTenantId(req);
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { tenantId } = resolved;

  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  const admin = adminClient();
  const { data: target } = await admin
    .from('users').select('role, assigned_tenant_ids').eq('id', userId).single();
  if (!target || target.role !== 'referee') return NextResponse.json({ error: 'Referee not found' }, { status: 404 });

  const remaining = (target.assigned_tenant_ids ?? []).filter((id: string) => id !== tenantId);
  const { error } = await admin
    .from('users')
    .update({
      assigned_tenant_ids: remaining,
      role: remaining.length === 0 ? 'player' : 'referee',
    })
    .eq('id', userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

async function sendInviteEmail(email: string, tenantName: string, actionLink: string) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? 'noreply@onepointbowl.com';

  if (!resendApiKey) {
    console.log('[referee-invite] RESEND_API_KEY not set — invite link:', actionLink);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
    body: JSON.stringify({
      from: `One Point Bowl <${from}>`,
      to: [email],
      subject: `You've been added as a referee for ${tenantName}`,
      html: `<p>You've been added as a referee for <strong>${tenantName}</strong> on One Point Bowl.</p><p><a href="${actionLink}">Set up your account</a> to start officiating matches.</p>`,
      text: `You've been added as a referee for ${tenantName} on One Point Bowl.\n\nSet up your account:\n${actionLink}`,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('[referee-invite] Resend error:', body);
  }
}
