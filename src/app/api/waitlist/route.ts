import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, name, school, role, notes, title, sport, program } = body as {
    email: string;
    name?: string;
    school?: string;
    role?: string;
    notes?: string;
    title?: string;
    sport?: string;
    program?: string;
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
    sport: sport?.trim() || null,
    program: program?.trim() || null,
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'already_on_waitlist' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
