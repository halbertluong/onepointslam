'use client';

import { useState } from 'react';
import Link from 'next/link';
import OnePointBowlLogo from '@/components/OnePointBowlLogo';

// ─── Waitlist Form ────────────────────────────────────────────────────────────

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
        body: JSON.stringify({ email, name, school, role: 'coach', title: resolvedTitle }),
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
        <div className="text-4xl">🎾</div>
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
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-xl px-4 py-3 text-sm text-slate-900 bg-white border border-white/20 focus:outline-none focus:ring-2"
        />
        <input
          type="text"
          required
          value={school}
          onChange={(e) => setSchool(e.target.value)}
          placeholder="University / program"
          className="w-full rounded-xl px-4 py-3 text-sm text-slate-900 bg-white border border-white/20 focus:outline-none focus:ring-2"
        />
      </div>
      <select
        required
        value={title}
        onChange={(e) => { setTitle(e.target.value); setTitleOther(''); }}
        className="w-full rounded-xl px-4 py-3 text-sm text-slate-900 bg-white border border-white/20 focus:outline-none focus:ring-2"
      >
        <option value="">Your title…</option>
        {TITLE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      {title === 'Other' && (
        <input
          type="text"
          required
          value={titleOther}
          onChange={(e) => setTitleOther(e.target.value)}
          placeholder="Please specify your title"
          className="w-full rounded-xl px-4 py-3 text-sm text-slate-900 bg-white border border-white/20 focus:outline-none focus:ring-2"
        />
      )}
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="coach@university.edu"
        className="w-full rounded-xl px-4 py-3 text-sm text-slate-900 bg-white border border-white/20 focus:outline-none focus:ring-2"
      />
      {status === 'error' && (
        <p className="text-red-300 text-xs text-center">Something went wrong — try again.</p>
      )}
      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full py-3.5 rounded-xl font-bold text-sm disabled:opacity-60 transition-all hover:opacity-90 active:scale-[0.98]"
        style={{ backgroundColor: 'var(--tenant-primary)', color: '#fff' }}
      >
        {status === 'loading' ? 'Submitting…' : 'Request Early Access →'}
      </button>
      <p className="text-white/40 text-xs text-center">
        No spam. Invite-only. D1 tennis programs only.
      </p>
    </form>
  );
}

// ─── Section Components ───────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest text-white mb-4"
      style={{ backgroundColor: 'var(--tenant-primary)' }}
    >
      {children}
    </span>
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
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0 mt-0.5"
        style={{ backgroundColor: 'var(--tenant-primary)' }}
      >
        {n}
      </div>
      <div>
        <p className="font-bold text-slate-900 mb-1">{title}</p>
        <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function BestPracticeTip({ title, desc, tag }: { title: string; desc: string; tag: string }) {
  return (
    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
      <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 mb-3 inline-block">{tag}</span>
      <h4 className="font-bold text-slate-900 mb-1">{title}</h4>
      <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <OnePointBowlLogo size={28} color="var(--tenant-primary)" />
            <span className="font-black text-lg" style={{ color: 'var(--tenant-primary)' }}>One Point Bowl</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How It Works</a>
            <a href="#value" className="hover:text-slate-900 transition-colors">Value</a>
            <a href="#best-practices" className="hover:text-slate-900 transition-colors">Best Practices</a>
            <a href="#waitlist" className="hover:text-slate-900 transition-colors">Early Access</a>
            <Link
              href="/auth/register"
              className="px-4 py-2 rounded-xl text-white font-bold text-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--tenant-primary)' }}
            >
              Have an Invite Code?
            </Link>
          </div>
          <button
            className="md:hidden p-2 text-slate-600"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-100 px-6 py-4 space-y-3 text-sm font-semibold text-slate-700 bg-white">
            {['#how-it-works', '#value', '#best-practices', '#waitlist'].map((href) => (
              <a
                key={href}
                href={href}
                className="block py-1 hover:text-slate-900"
                onClick={() => setMobileMenuOpen(false)}
              >
                {href.replace('#', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </a>
            ))}
            <Link
              href="/auth/register"
              className="block py-2 text-center rounded-xl text-white font-bold"
              style={{ backgroundColor: 'var(--tenant-primary)' }}
              onClick={() => setMobileMenuOpen(false)}
            >
              Have an Invite Code?
            </Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'radial-gradient(circle at 30% 50%, var(--tenant-primary) 0%, transparent 60%), radial-gradient(circle at 80% 20%, var(--tenant-secondary, var(--tenant-primary)) 0%, transparent 50%)',
          }}
        />
        <div className="relative max-w-5xl mx-auto px-6 py-24 sm:py-36 text-center">
          <div className="flex justify-center mb-8">
            <OnePointBowlLogo size={80} color="var(--tenant-primary)" />
          </div>
          <div
            className="inline-block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6 border"
            style={{ color: 'var(--tenant-primary)', borderColor: 'var(--tenant-primary)' }}
          >
            Invite-Only · D1 Tennis Programs
          </div>
          <h1 className="text-5xl sm:text-7xl font-black leading-none tracking-tight mb-6">
            The{' '}
            <span style={{ color: 'var(--tenant-primary)' }}>One Point Bowl</span>
          </h1>
          <p className="text-xl sm:text-2xl text-white/70 font-semibold max-w-2xl mx-auto mb-4 leading-relaxed">
            A high-energy single-elimination tennis tournament that turns your court into a fundraising machine — in under two hours.
          </p>
          <p className="text-white/40 text-base max-w-xl mx-auto mb-10">
            Built for D1 collegiate tennis coaches who want to grow donor relationships, drive NIL awareness, and create unforgettable fan experiences.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="#waitlist"
              className="px-8 py-4 rounded-2xl font-bold text-base text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--tenant-primary)' }}
            >
              Request Early Access
            </a>
            <a
              href="#how-it-works"
              className="px-8 py-4 rounded-2xl font-bold text-base border border-white/20 text-white/80 hover:bg-white/5 transition-colors"
            >
              See How It Works ↓
            </a>
          </div>
        </div>
      </section>

      {/* Social proof bar */}
      <div className="bg-slate-900 text-white/50 text-xs font-semibold uppercase tracking-widest py-4">
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap justify-center gap-8">
          {['Mobile-First Referee App', 'Real-Time Bracket Updates', 'Built-In Fundraising Tracker', 'Zero Cost to Your Program', 'Launch in Under 10 Minutes'].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span style={{ color: 'var(--tenant-primary)' }}>✓</span> {t}
            </span>
          ))}
        </div>
      </div>

      {/* The Problem */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <SectionLabel>The Challenge</SectionLabel>
          <h2 className="text-4xl font-black text-slate-900 mb-6 leading-tight">
            D1 tennis programs need donors.<br />
            <span className="text-slate-400">Traditional fundraisers don&apos;t deliver.</span>
          </h2>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto leading-relaxed mb-10">
            In the era of NIL, building a donor base is more important than ever. But galas are expensive, alumni weekends are once a year, and most events don&apos;t create real connections between your program and potential supporters.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            {[
              { stat: '$0', label: 'Platform cost to your program', sub: 'Fees are transparently passed to players' },
              { stat: '2 hrs', label: 'From setup to final point', sub: 'Including registration and bracket generation' },
              { stat: '64+', label: 'Players per event', sub: 'Create an electric atmosphere at scale' },
            ].map(({ stat, label, sub }) => (
              <div key={stat} className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                <p className="text-4xl font-black mb-1" style={{ color: 'var(--tenant-primary)' }}>{stat}</p>
                <p className="font-bold text-slate-900 text-sm mb-1">{label}</p>
                <p className="text-slate-400 text-xs">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <SectionLabel>How It Works</SectionLabel>
            <h2 className="text-4xl font-black text-slate-900">Run your first Bowl in 3 steps</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
            <div className="space-y-8">
              <Step n={1} title="Set up your tournament" desc="Name it, set your draw size (up to 256 players), entry fee, and tournament date. Add prize money for top finishers if you want." />
              <Step n={2} title="Share the registration link" desc="Players register online. You see a live count, revenue, and fundraising progress in your dashboard. Close registration whenever you're ready." />
              <Step n={3} title="Run it live with your referees" desc="Your referees use the mobile scorekeeper — giant tap targets, coin toss animation, instant bracket updates. No paper. No confusion." />
            </div>
            <div className="bg-slate-900 rounded-2xl p-6 text-white space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">Live Dashboard Preview</p>
              <div className="space-y-3">
                {[
                  { label: 'Registered', value: '47 / 64', pct: 73 },
                  { label: 'Fundraising Goal', value: '$940 / $1,280', pct: 73 },
                ].map(({ label, value, pct }) => (
                  <div key={label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-white/60">{label}</span>
                      <span className="font-bold">{value}</span>
                    </div>
                    <div className="bg-white/10 rounded-full h-2">
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: 'var(--tenant-primary)' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-white/10 pt-4 grid grid-cols-2 gap-3">
                {[
                  { label: 'Status', value: '● Live Play' },
                  { label: 'Active Matches', value: '8' },
                  { label: 'Completed', value: '24 matches' },
                  { label: 'Revenue', value: '$940' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-white/30 uppercase tracking-wide">{label}</p>
                    <p className="font-bold text-sm">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Features */}
      <section id="value" className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <SectionLabel>The Platform</SectionLabel>
            <h2 className="text-4xl font-black text-slate-900">Everything you need. Nothing you don&apos;t.</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { emoji: '📱', title: 'Mobile Referee Console', desc: 'Giant tap targets, animated coin toss, instant bracket sync. Built to work courtside with one hand.' },
              { emoji: '🏆', title: 'Automated Bracket Engine', desc: 'Seeds placed at opposite ends. Byes distributed to top seeds. Single-elimination from 8 to 256 players.' },
              { emoji: '💰', title: 'Fundraising Dashboard', desc: 'Real-time revenue, goal tracking, and per-player entry fee calculations. Your program keeps every dollar of ticket revenue.' },
              { emoji: '🔗', title: 'Shareable Registration Links', desc: 'One link. Players register from their phone. You see it happen live. Close registration with one click.' },
              { emoji: '📧', title: 'Email Your Registrants', desc: 'Send updates, schedule changes, or hype to all registered players directly from your dashboard.' },
              { emoji: '🎯', title: 'Prize Money Settings', desc: 'Offer fixed prizes or a percentage of the entry pool for top finishers. Drives serious competition.' },
            ].map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </div>
      </section>

      {/* NIL / Donor Value Section */}
      <section className="py-20 px-6 bg-slate-950 text-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <SectionLabel>NIL &amp; Donor Development</SectionLabel>
            <h2 className="text-4xl font-black leading-tight mb-4">
              The best donor event is one where<br />
              <span style={{ color: 'var(--tenant-primary)' }}>people actually show up.</span>
            </h2>
            <p className="text-white/60 text-lg max-w-2xl mx-auto leading-relaxed">
              A One Point Bowl creates a live, high-energy environment around your program. That energy attracts donors, NIL sponsors, and community engagement that a gala dinner never could.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              {
                title: 'Visible NIL Opportunities',
                desc: 'Your players compete in front of real crowds. Sponsors see name, image, and likeness in action — making sponsorship conversations natural and compelling.',
                icon: '🌟',
              },
              {
                title: 'Donor Pipeline in Real Life',
                desc: 'Entry fees, spectators, and prize supporters all become warm contacts for your development office. Every Bowl is a networking event for your program.',
                icon: '🤝',
              },
              {
                title: 'Community Building',
                desc: 'Open it to your student body, alumni, and local tennis community. The wider the draw, the bigger the audience — and the bigger the fundraising opportunity.',
                icon: '🏟️',
              },
              {
                title: 'Recurring Revenue Model',
                desc: 'Run one per semester. Build a calendar event your supporters look forward to. Consistent touchpoints convert casual fans into committed donors.',
                icon: '📅',
              },
            ].map(({ title, desc, icon }) => (
              <div key={title} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="text-2xl mb-3">{icon}</div>
                <h4 className="font-bold text-white mb-2">{title}</h4>
                <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Best Practices */}
      <section id="best-practices" className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <SectionLabel>Best Practices</SectionLabel>
            <h2 className="text-4xl font-black text-slate-900 mb-4">How to run a great One Point Bowl</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              The format is simple. The execution is what makes it electric. Here&apos;s what the best events have in common.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BestPracticeTip
              tag="Pricing"
              title="Keep entry fees low"
              desc="$15–$25 per player maximizes participation. A 64-person draw at $20 generates $1,280 — and a full bracket is far more exciting than a half-empty one. Volume beats margin every time."
            />
            <BestPracticeTip
              tag="Draw Size"
              title="Go bigger than you think"
              desc="Aim for 64–128 players. Invite the student body, rec players, alumni, and staff. The more players, the bigger the crowd, the bigger the energy — and the more potential donors in the room."
            />
            <BestPracticeTip
              tag="Atmosphere"
              title="Create a fan experience"
              desc="Announce matches. Play music between points. Have a leaderboard visible to spectators. The bracket updating in real-time on a TV screen draws a crowd. Treat it like a real event, not a practice."
            />
            <BestPracticeTip
              tag="NIL"
              title="Feature your varsity players"
              desc="Seed your top players and put them in the draw. Watching a D1 player compete creates moments. Those moments become social content, NIL exposure, and donor connection opportunities."
            />
            <BestPracticeTip
              tag="Prize Money"
              title="Offer meaningful prizes"
              desc="Even $100–$200 for first place adds serious competitive drama. Consider percentage-based prizes so bigger draws automatically generate bigger payouts — self-funding the excitement."
            />
            <BestPracticeTip
              tag="Recurring"
              title="Run it every semester"
              desc="One Bowl is a fun event. Two Bowls is a tradition. Three is an institution. The more consistently you run it, the more your community plans around it — and the more donors it develops over time."
            />
          </div>
        </div>
      </section>

      {/* Explainer: The Format */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <SectionLabel>The Format Explained</SectionLabel>
            <h2 className="text-4xl font-black text-slate-900 mb-4">Why single-elimination, one point?</h2>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-8 space-y-6 text-slate-600 leading-relaxed">
            <p>
              <strong className="text-slate-900">The One Point Bowl format</strong> is deliberately designed for speed and excitement. Each match is decided by a single point — a serve, a return, a winner. There are no sets, no games. Just one point.
            </p>
            <p>
              This means a match takes about 90 seconds. A full 32-player bracket plays out in under 45 minutes. A 64-player draw wraps in 90 minutes. This is possible to run on a handful of courts simultaneously, or even a single court with rapid-fire sequencing.
            </p>
            <p>
              <strong className="text-slate-900">Single elimination</strong> keeps the stakes high. Every point matters because there&apos;s no second chance. This creates genuine pressure and genuine drama — even if the players are recreational.
            </p>
            <p>
              <strong className="text-slate-900">For fundraising</strong>, this is the key insight: a $20 entry fee across 64 players is $1,280 raised in 90 minutes, with almost zero overhead. Your players enjoy it. Your community participates. And your donors see your program in action.
            </p>
            <div
              className="rounded-xl p-5 text-white text-sm font-semibold"
              style={{ backgroundColor: 'var(--tenant-primary)' }}
            >
              💡 Pro tip from early programs: put a TV near the courts showing the live bracket. The moment spectators see it updating in real-time, they&apos;re hooked.
            </div>
          </div>
        </div>
      </section>

      {/* Waitlist CTA */}
      <section
        id="waitlist"
        className="py-24 px-6 bg-slate-900 text-white"
        style={{
          backgroundImage: 'radial-gradient(circle at 70% 50%, color-mix(in srgb, var(--tenant-primary) 15%, transparent) 0%, transparent 60%)',
        }}
      >
        <div className="max-w-xl mx-auto text-center">
          <SectionLabel>Early Access</SectionLabel>
          <h2 className="text-4xl font-black mb-4">Join the waitlist</h2>
          <p className="text-white/60 text-lg mb-10 leading-relaxed">
            We&apos;re onboarding D1 tennis programs now. Tell us about your program and we&apos;ll reach out to get you set up — free for founding programs.
          </p>
          <WaitlistForm />
          <p className="mt-8 text-white/30 text-sm">
            Already have an invite code?{' '}
            <Link href="/auth/register" className="underline hover:text-white/60 transition-colors">
              Register your account →
            </Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-white/5 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/30">
          <div className="flex items-center gap-2">
            <OnePointBowlLogo size={20} color="var(--tenant-primary)" />
            <span className="font-bold text-white/50">One Point Bowl</span>
          </div>
          <div className="flex gap-6">
            <a href="#how-it-works" className="hover:text-white/60 transition-colors">How It Works</a>
            <a href="#best-practices" className="hover:text-white/60 transition-colors">Best Practices</a>
            <Link href="/auth/login" className="hover:text-white/60 transition-colors">Sign In</Link>
          </div>
          <p>© {new Date().getFullYear()} One Point Bowl</p>
        </div>
      </footer>
    </div>
  );
}
