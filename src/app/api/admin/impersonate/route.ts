import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const DEMO_PASSWORD = 'Demo1234!';

export async function POST(req: NextRequest) {
  // Verify caller is super_admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: appUser } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (appUser?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { targetEmail } = await req.json();
  if (!targetEmail) return NextResponse.json({ error: 'Missing targetEmail' }, { status: 400 });

  // Use service role if available for magic link generation
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  if (serviceRoleKey) {
    // Real impersonation via magic link (no password needed)
    const admin = createServiceClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: targetEmail,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ magicLink: data.properties?.action_link });
  }

  // Fallback: sign in with demo password (only works for demo accounts)
  const anonClient = createServiceClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: signInData, error } = await anonClient.auth.signInWithPassword({
    email: targetEmail,
    password: DEMO_PASSWORD,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ session: signInData.session });
}
