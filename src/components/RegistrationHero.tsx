'use client';

import { motion } from 'framer-motion';

interface HeroPill {
  label: string;
  value: string;
  live?: boolean;
}

interface Props {
  eyebrow?: string;
  title: string;
  logoUrl?: string;
  pills?: HeroPill[];
  compact?: boolean;
}

/**
 * Full-bleed, tenant-branded banner shared across every step of the public
 * registration flow. Reads --tenant-primary / --tenant-secondary (set by the
 * tenant layout) so a school's own colors and logo carry the whole page —
 * this is the surface a school's own designer would customize first.
 */
export default function RegistrationHero({ eyebrow, title, logoUrl, pills, compact }: Props) {
  return (
    <div className={`relative overflow-hidden tenant-gradient ${compact ? 'py-10' : 'py-14 sm:py-20'}`}>
      {/* Decorative depth — soft brand-colored glows + a faint grain texture */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-24 -right-16 w-72 h-72 rounded-full blur-3xl opacity-40"
          style={{ backgroundColor: 'var(--tenant-secondary)' }}
        />
        <div
          className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full blur-3xl opacity-30"
          style={{ backgroundColor: '#ffffff' }}
        />
        <svg className="absolute inset-0 w-full h-full opacity-[0.06]" aria-hidden>
          <filter id="hero-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#hero-grain)" />
        </svg>
      </div>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white/95 shadow-xl p-3 mb-5"
        >
          {logoUrl ? (
            <img src={logoUrl} alt="" className="w-full h-full object-contain" />
          ) : (
            <span className="text-4xl">🏆</span>
          )}
        </motion.div>

        {eyebrow && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-white/80 mb-2"
          >
            {eyebrow}
          </motion.p>
        )}

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15 }}
          className="font-display text-3xl sm:text-4xl md:text-5xl font-black text-white leading-[1.05] tracking-tight text-balance"
        >
          {title}
        </motion.h1>

        {pills && pills.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.28 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-2.5"
          >
            {pills.map((p) => (
              <span
                key={p.label}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 border border-white/25 text-white text-xs sm:text-sm font-semibold backdrop-blur-sm"
              >
                {p.live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                <span className="text-white/70 font-medium">{p.label}</span>
                <span>{p.value}</span>
              </span>
            ))}
          </motion.div>
        )}
      </div>

      {/* Soft curved transition into the page body below */}
      <svg
        className="absolute -bottom-px left-0 w-full text-slate-50"
        viewBox="0 0 1440 60"
        preserveAspectRatio="none"
        aria-hidden
        style={{ height: compact ? 28 : 40 }}
      >
        <path d="M0,32 C240,60 480,0 720,16 C960,32 1200,60 1440,24 L1440,60 L0,60 Z" fill="currentColor" />
      </svg>
    </div>
  );
}
