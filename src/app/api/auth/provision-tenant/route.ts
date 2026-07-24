import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function POST(req: NextRequest) {
  const { userId, school, sport, program, inviteCode } = await req.json() as {
    userId?: string;
    school?: string;
    sport?: string;
    program?: string;
    inviteCode?: string;
  };

  // Invite code must always be present and correct
  const validCode = process.env.DIRECTOR_INVITE_CODE;
  if (!validCode) {
    console.error('[provision-tenant] DIRECTOR_INVITE_CODE env var is not set — rejecting all requests');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  if (inviteCode !== validCode) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 401 });
  }

  // Verify the userId actually exists in auth.users (prevents hijacking other accounts)
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }
  const { data: authUser, error: authErr } = await adminClient.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 400 });
  }

  if (!school || !sport || !program) {
    return NextResponse.json({ error: 'userId, school, sport, and program are required' }, { status: 400 });
  }

  const displayName = `${school.trim()} - ${sport.trim()} - ${program.trim()}`;
  const baseSlug = toSlug(displayName);

  // Ensure slug uniqueness by appending a short random suffix if needed
  let slug = baseSlug;
  const { data: existing } = await adminClient
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // Create the tenant
  const { data: tenant, error: tenantErr } = await adminClient
    .from('tenants')
    .insert({ display_name: displayName, slug })
    .select('id')
    .single();

  if (tenantErr || !tenant) {
    return NextResponse.json({ error: tenantErr?.message ?? 'Failed to create tenant' }, { status: 500 });
  }

  // Assign the tenant and role to the user atomically
  const { error: userErr } = await adminClient
    .from('users')
    .upsert({ id: userId, role: 'tenant_admin', assigned_tenant_ids: [tenant.id] }, { onConflict: 'id' });

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, tenantId: tenant.id, slug, displayName });
}
