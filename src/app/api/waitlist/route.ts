import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, name, school, role, notes, title } = body as {
    email: string;
    name?: string;
    school?: string;
    role?: string;
    notes?: string;
    title?: string;
  };

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from('waitlist').insert({
    email: email.toLowerCase().trim(),
    name: name?.trim() || null,
    school: school?.trim() || null,
    role: role || 'coach',
    notes: notes?.trim() || null,
    title: title?.trim() || null,
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'already_on_waitlist' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
