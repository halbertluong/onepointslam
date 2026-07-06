'use client';

import { useState } from 'react';
import Link from 'next/link';
import OnePointBowlLogo from '@/components/OnePointBowlLogo';
import SportsDropdown, { SportsDropdownMobile } from '@/components/SportsDropdown';

const PRIMARY = '#f97316'; // orange
const SECONDARY = '#dc2626'; // red

const TITLE_OPTIONS = ['Head Coach', 'Assistant Coach', 'Sports Administrator', 'Director of Operations', 'Other'];

function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [title, setTitle] = useState('');
  const [titleOther, setTitleOther] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'duplicate' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title) return;
    if (title === 'Other' && !titleOther.trim()) return;
    setStatus('loading');
    const resolvedTitle = title === 'Other' ? titleOther.trim() : title;
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, school, role: 'coach', title: resolvedTitle, sport: 'basketball' }),
      });
      const data = await res.json();
      if (res.ok) setStatus('success');
      else if (data.error === 'already_on_waitlist') setStatus('duplicate');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="text-center py-6 space-y-2">
        <div className="text-4xl">🏀</div>
        <p className="font-black text-xl text-white">You&apos;re on the list!</p>
        <p className="text-white/60 text-sm">We&apos;ll reach out as we onboard new programs. Expect to hear from us soon.</p>
      </div>
    );
  }

  if (status === 'duplicate') {
    return (
      <div className="text-center py-6 space-y-2">
        <div className="text-4xl">✅</div>
        <p className="font-black text-xl text-white">Already registered!</p>
        <p className="text-white/60 text-sm">You&apos;re already on our waitlist. We&apos;ll be in touch.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 w-full max-w-md mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-xl px-4 py-3 text-sm text-slate-900 bg-white border border-white/20 focus:outline-none focus:ring-2" />
        <input type="text" required value={school} onChange={(e) => setSchool(e.target.value)}
          placeholder="University / program"
          className="w-full rounded-xl px-4 py-3 text-sm text-slate-900 bg-white border border-white/20 focus:outline-none focus:ring-2" />
      </div>
      <select required value={title} onChange={(e) => { setTitle(e.target.value); setTitleOther(''); }}
        className="w-full rounded-xl px-4 py-3 text-sm text-slate-900 bg-white border border-white/20 focus:outline-none focus:ring-2">
        <option value="">Your title…</option>
        {TITLE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      {title === 'Other' && (
        <input type="text" required value={titleOther} onChange={(e) => setTitleOther(e.target.value)}
          placeholder="Please specify your title"
          className="w-full rounded-xl px-4 py-3 text-sm text-slate-900 bg-white border border-white/20 focus:outline-none focus:ring-2" />
      )}
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="coach@university.edu"
        className="w-full rounded-xl px-4 py-3 text-sm text-slate-900 bg-white border border-white/20 focus:outline-none focus:ring-2" />
      {status === 'error' && <p className="text-red-300 text-xs text-center">Something went wrong — try again.</p>}
      <button type="submit" disabled={status === 'loading'}
        className="w-full py-3.5 rounded-xl font-bold text-sm disabled:opacity-60 transition-all hover:opacity-90 active:scale-[0.98]"
        style={{ backgroundColor: PRIMARY, color: '#fff' }}>
        {status === 'loading' ? 'Submitting…' : 'Request Early Access →'}
      </button>
      <p className="text-white/40 text-xs text-center">No spam. Invite-only. D1 basketball programs only.</p>
    </form>
  );
}

function FeatureCard({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-md transition-shadow">
      <div className="text-3xl mb-3">{emoji}</div>
      <h3 className="font-bold text-slate-900 text-lg mb-2">{title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0 mt-0.5"
        style={{ backgroundColor: PRIMARY }}>{n}</div>
      <div>
        <p className="font-bold text-slate-900 mb-1">{title}</p>
        <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

export default function BasketballPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900"
      style={{ '--tenant-primary': PRIMARY, '--tenant-secondary': SECONDARY } as React.CSSProperties}>

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <OnePointBowlLogo size={28} color={PRIMARY} />
            <span className="font-black text-lg" style={{ color: PRIMARY }}>One Point Bowl</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: PRIMARY }}>Basketball</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How It Works</a>
            <a href="#value" className="hover:text-slate-900 transition-colors">Value</a>
            <a href="#waitlist" className="hover:text-slate-900 transition-colors">Early Access</a>
            <SportsDropdown current="basketball" color={PRIMARY} />
            <Link href="/auth/register"
              className="px-4 py-2 rounded-xl text-white font-bold text-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: PRIMARY }}>
              Have an Invite Code?
            </Link>
          </div>
          <button className="md:hidden p-2 text-slate-600" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-100 px-6 py-4 space-y-3 text-sm font-semibold text-slate-700 bg-white">
            {['#how-it-works', '#value', '#waitlist'].map((href) => (
              <a key={href} href={href} className="block py-1 hover:text-slate-900" onClick={() => setMobileMenuOpen(false)}>
                {href.replace('#', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </a>
            ))}
            <SportsDropdownMobile current="basketball" onNavigate={() => setMobileMenuOpen(false)} />
            <Link href="/auth/register"
              className="block py-2 text-center rounded-xl text-white font-bold"
              style={{ backgroundColor: PRIMARY }}
              onClick={() => setMobileMenuOpen(false)}>
              Have an Invite Code?
            </Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 opacity-15"
          style={{ backgroundImage: `radial-gradient(circle at 30% 50%, ${PRIMARY} 0%, transparent 60%), radial-gradient(circle at 80% 20%, ${SECONDARY} 0%, transparent 50%)` }} />
        <div className="relative max-w-5xl mx-auto px-6 py-24 sm:py-36 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6 text-white"
            style={{ backgroundColor: `${PRIMARY}33`, border: `1px solid ${PRIMARY}44` }}>
            🏀 One Point Bowl — Basketball Edition
          </div>
          <h1 className="text-5xl sm:text-7xl font-black mb-6 leading-none tracking-tight">
            One Free Throw.<br />
            <span style={{ color: PRIMARY }}>One Point.</span><br />
            One Champion.
          </h1>
          <p className="text-white/60 text-xl sm:text-2xl max-w-3xl mx-auto leading-relaxed mb-10">
            The fastest fundraising tournament format for D1 basketball programs. A single free throw decides every match. 64 players. 90 minutes. Zero overhead.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#waitlist"
              className="px-8 py-4 rounded-2xl font-black text-white text-lg transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: PRIMARY }}>
              Get Early Access →
            </a>
            <a href="#how-it-works"
              className="px-8 py-4 rounded-2xl font-bold text-white/80 text-lg bg-white/10 hover:bg-white/15 transition-colors">
              See How It Works
            </a>
          </div>
        </div>
      </section>

      {/* Social proof bar */}
      <div className="bg-slate-900 text-white/50 text-sm font-semibold py-4 px-6 overflow-hidden">
        <div className="max-w-5xl mx-auto flex flex-wrap gap-x-10 gap-y-2 justify-center items-center text-center">
          {['Single free throw decides each match', '90-second matchups', 'Full bracket in under 2 hours', 'Built for D1 programs', 'NIL-friendly fundraising'].map((t) => (
            <span key={t} className="flex items-center gap-2">
              <span style={{ color: PRIMARY }}>●</span> {t}
            </span>
          ))}
        </div>
      </div>

      {/* The Problem */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest text-white mb-4"
            style={{ backgroundColor: PRIMARY }}>
            The Problem
          </span>
          <h2 className="text-4xl font-black text-slate-900 mb-6">
            Traditional fundraising is dead.<br />Basketball can do better.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left mt-10">
            {[
              { icon: '😴', title: 'Galas are boring', desc: 'Donors sit through a 3-hour dinner. Engagement is low. Your athletes are invisible.' },
              { icon: '🎟️', title: 'Golf outings are exclusive', desc: 'High buy-in, low turnout. Half your community can\'t participate.' },
              { icon: '📋', title: 'Bake sales don\'t scale', desc: 'Hours of planning. Minimal return. Zero connection to your program\'s identity.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                <div className="text-4xl mb-3">{icon}</div>
                <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-6 bg-slate-50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest text-white mb-4"
              style={{ backgroundColor: PRIMARY }}>How It Works</span>
            <h2 className="text-4xl font-black text-slate-900 mb-4">One free throw. That&apos;s it.</h2>
            <p className="text-slate-500 text-lg">Each match is decided by a single free throw attempt. Make it — you advance. Miss — you&apos;re out. Clean, dramatic, and done in 90 seconds.</p>
          </div>
          <div className="space-y-8">
            <Step n={1} title="Players pay a small entry fee" desc="Set your entry at $20–$50. Across 64 players that's $1,280–$3,200 raised before a single free throw is taken." />
            <Step n={2} title="Draw the bracket" desc="Our platform seeds players and generates the single-elimination bracket automatically. Donors, families, and fans can watch it update live." />
            <Step n={3} title="One free throw per match" desc="Each player steps to the line. One shot. Make it, you advance. Miss, your opponent wins. The referee records the result and the bracket updates instantly." />
            <Step n={4} title="Crown the champion" desc="The whole bracket resolves in under 2 hours for 64 players. Presentation, photos, and NIL activation all happen same day." />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest text-white mb-4"
              style={{ backgroundColor: PRIMARY }}>Platform Features</span>
            <h2 className="text-4xl font-black text-slate-900 mb-4">Everything you need, nothing you don&apos;t</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard emoji="🏀" title="Free Throw Bracket Engine" desc="Automatic single-elimination seeding. Manage 8 to 256 players. BYEs handled automatically." />
            <FeatureCard emoji="📱" title="Referee Mobile App" desc="Referees score matches from their phone. No paper, no confusion, no delays." />
            <FeatureCard emoji="📺" title="Live Public Scoreboard" desc="Display the bracket on a TV courtside. Fans and families can follow on their phones — no login required." />
            <FeatureCard emoji="💰" title="Fundraising Calculator" desc="Set a goal, see the ticket price needed. Or set a price and see the projected raise. Live math." />
            <FeatureCard emoji="🎓" title="NIL-Friendly Design" desc="Built for athlete visibility. Your stars are front and center. Donors see the faces behind the program." />
            <FeatureCard emoji="⚡" title="5-Minute Setup" desc="Create a tournament, set the entry fee, share the registration link. Done before practice ends." />
          </div>
        </div>
      </section>

      {/* Value / NIL */}
      <section id="value" className="py-20 px-6" style={{ backgroundColor: `${PRIMARY}08` }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest text-white mb-4"
              style={{ backgroundColor: PRIMARY }}>NIL &amp; Donor Value</span>
            <h2 className="text-4xl font-black text-slate-900 mb-4">The age of NIL changes everything</h2>
            <p className="text-slate-500 text-xl max-w-2xl mx-auto">Your athletes are a brand. One Point Bowl gives them a stage — and gives donors a reason to show up.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              { icon: '🌟', title: 'Athlete-forward format', desc: 'Every match spotlights an individual athlete. Spectators cheer by name. That\'s NIL activation without the paperwork.' },
              { icon: '🤝', title: 'Donor experience', desc: 'Your top donors get to watch your players compete in person. That\'s a relationship moment, not just a transaction.' },
              { icon: '📸', title: 'Content goldmine', desc: 'Free throw showdowns are made for Instagram. The drama of a single shot photographs better than any gala.' },
              { icon: '🏆', title: 'Repeat fundraising', desc: 'Run it every semester. Players improve. Donors return. Community grows. It compounds over time.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex gap-4">
                <div className="text-3xl shrink-0">{icon}</div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-1">{title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Format Explainer */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest text-white mb-4"
              style={{ backgroundColor: PRIMARY }}>The Format Explained</span>
            <h2 className="text-4xl font-black text-slate-900 mb-4">Why one free throw?</h2>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-8 space-y-6 text-slate-600 leading-relaxed">
            <p>
              <strong className="text-slate-900">The One Point Bowl format for basketball</strong> distills competition to its most dramatic single moment: the free throw. It is the one skill every player has — it requires technique, composure, and focus. Under pressure, in front of a crowd, it becomes a spectacle.
            </p>
            <p>
              Each match takes 90 seconds. Two players step to the line. One shoots. Win or go home. A 64-player bracket resolves in under 2 hours on a single court — or faster across multiple courts simultaneously.
            </p>
            <p>
              <strong className="text-slate-900">Single elimination</strong> means every shot matters. There are no second chances. This creates genuine drama even among recreational players, and gives elite players a chance to demonstrate composure.
            </p>
            <p>
              <strong className="text-slate-900">For fundraising:</strong> a $25 entry fee across 64 participants is $1,600 raised in under 2 hours. Add a $5 donation from spectators per match watched, and you&apos;re well above that. The format is lean, fast, and memorable.
            </p>
            <div className="rounded-xl p-5 text-white text-sm font-semibold" style={{ backgroundColor: PRIMARY }}>
              💡 Pro tip: pair the tournament with a shooting challenge for donors ($10 to shoot a free throw, proceeds go to the program). Your athletes can coach them. It doubles the engagement.
            </div>
          </div>
        </div>
      </section>

      {/* Waitlist CTA */}
      <section id="waitlist" className="py-24 px-6 bg-slate-900 text-white"
        style={{ backgroundImage: `radial-gradient(circle at 70% 50%, ${PRIMARY}22 0%, transparent 60%)` }}>
        <div className="max-w-xl mx-auto text-center">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest text-white mb-4"
            style={{ backgroundColor: PRIMARY }}>Early Access</span>
          <h2 className="text-4xl font-black mb-4">Join the basketball waitlist</h2>
          <p className="text-white/60 text-lg mb-10 leading-relaxed">
            We&apos;re onboarding D1 basketball programs now. Tell us about your program and we&apos;ll reach out to get you set up — free for founding programs.
          </p>
          <WaitlistForm />
          <p className="mt-8 text-white/30 text-sm">
            Already have an invite code?{' '}
            <Link href="/auth/register" className="underline hover:text-white/60 transition-colors">
              Register your account →
            </Link>
          </p>
          <p className="mt-4 text-white/20 text-xs">
            Also available:{' '}
            <Link href="/" className="underline hover:text-white/40">🎾 Tennis</Link>
            {' · '}
            <Link href="/soccer" className="underline hover:text-white/40">⚽ Soccer</Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-white/5 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/30">
          <div className="flex items-center gap-2">
            <OnePointBowlLogo size={20} color={PRIMARY} />
            <span className="font-bold text-white/50">One Point Bowl</span>
            <span className="text-white/20">· Basketball</span>
          </div>
          <div className="flex gap-6">
            <Link href="/" className="hover:text-white/60 transition-colors">🎾 Tennis</Link>
            <Link href="/soccer" className="hover:text-white/60 transition-colors">⚽ Soccer</Link>
            <Link href="/auth/login" className="hover:text-white/60 transition-colors">Sign In</Link>
          </div>
          <p>© {new Date().getFullYear()} One Point Bowl</p>
        </div>
      </footer>
    </div>
  );
}
