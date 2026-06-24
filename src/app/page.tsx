import Link from 'next/link';
import OnePointBowlLogo from '@/components/OnePointBowlLogo';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center bg-gradient-to-br from-white via-slate-50 to-slate-100">
        <div className="max-w-3xl mx-auto space-y-6">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold text-white mb-2"
            style={{ backgroundColor: 'var(--tenant-primary)' }}
          >
            ⚡ Tennis Tournament Platform
          </div>
          <div className="flex items-center justify-center gap-5 mb-2">
            <OnePointBowlLogo size={72} color="var(--tenant-primary)" />
          </div>
          <h1 className="text-5xl sm:text-7xl font-black text-slate-900 leading-none tracking-tight">
            Sudden<span style={{ color: 'var(--tenant-primary)' }}>Slam</span>
          </h1>
          <p className="text-lg text-slate-500 font-semibold tracking-wide uppercase">
            Tennis Tournament Platform
          </p>
          <p className="text-xl text-slate-600 max-w-xl mx-auto leading-relaxed">
            Run a 32-player single-elimination tennis tournament in under 45 minutes.
            The ultimate fundraising event for university clubs and schools.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Link
              href="/auth/login"
              className="btn-primary px-8 py-4 rounded-2xl font-bold text-base inline-block"
            >
              Organize a Tournament
            </Link>
            <Link
              href="#how-it-works"
              className="px-8 py-4 rounded-2xl font-bold text-base border-2 border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors inline-block"
            >
              How It Works
            </Link>
          </div>
        </div>
      </main>

      {/* Features */}
      <section id="how-it-works" className="bg-white py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-center text-slate-900 mb-12">
            Built for Speed &amp; Fundraising
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                emoji: '⚡',
                title: '45 Minutes',
                desc: 'A full 32-player bracket runs start to finish in under an hour on a single court.',
              },
              {
                emoji: '💰',
                title: 'Zero Cost to Schools',
                desc: 'Schools keep 100% of ticket revenue. Platform fee is transparently added per player.',
              },
              {
                emoji: '📱',
                title: 'Mobile Referee Console',
                desc: 'Giant tap targets, animated coin toss, instant bracket updates. Built for courtside.',
              },
            ].map((f) => (
              <div key={f.title} className="text-center p-6 rounded-2xl border border-slate-100 hover:border-slate-200 transition-colors">
                <div className="text-4xl mb-4">{f.emoji}</div>
                <h3 className="font-bold text-xl text-slate-800 mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center">
        <p className="text-sm text-slate-400">
          © {new Date().getFullYear()} One Point Bowl. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
