import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { email, name, school, role, notes, title, sport, program } = body as unknown as {
    email: string;
    name?: string;
    school?: string;
    role?: string;
    notes?: string;
    title?: string;
    sport?: string;
    program?: string;
  };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if ((name?.length ?? 0) > 200 || (school?.length ?? 0) > 200 || (notes?.length ?? 0) > 2000 ||
      (title?.length ?? 0) > 200 || (sport?.length ?? 0) > 100 || (program?.length ?? 0) > 200) {
    return NextResponse.json({ error: 'Input too long' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from('waitlist').insert({
    email: email.toLowerCase().trim(),
    name: name?.trim() || null,
    school: school?.trim() || null,
    role: ['coach', 'director', 'player', 'admin', 'other'].includes(role ?? '') ? role : 'coach',
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

  // Notify team — fire and forget, never block the user response
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    const from = process.env.RESEND_FROM_EMAIL ?? 'noreply@onepointbowl.com';
    const lines = [
      `<b>Name:</b> ${name?.trim() ?? '—'}`,
      `<b>Email:</b> ${email}`,
      `<b>School:</b> ${school?.trim() ?? '—'}`,
      `<b>Title:</b> ${title?.trim() ?? '—'}`,
      `<b>Sport:</b> ${sport?.trim() ?? '—'}`,
      `<b>Program:</b> ${program?.trim() ?? '—'}`,
    ].join('<br>');
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from,
        to: ['Hal@onepointbowl.com', 'Filip@onepointbowl.com'],
        subject: `New waitlist signup: ${name?.trim() ?? email}`,
        html: `<p>Someone just joined the waitlist.</p><p>${lines}</p>`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
