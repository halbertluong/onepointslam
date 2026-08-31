'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ASSET_KIND_ORDER,
  ASSET_SPECS,
  downloadCanvas,
  renderAsset,
  type AssetContent,
  type AssetKind,
} from '@/lib/assetStudio';
import { formatCurrency } from '@/lib/pricing';
import { tournamentPath } from '@/lib/slugs';
import type { Tournament } from '@/types';

interface Props {
  tournament: Tournament;
  tenantSlug: string;
  tenantName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
}

const ASSET_ICON: Record<AssetKind, string> = {
  flyer: '📄',
  instagram_post: '⬛',
  instagram_story: '📱',
};

function defaultDateLabel(tournamentDate?: string): string {
  if (!tournamentDate) return '';
  const d = new Date(tournamentDate);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function AssetStudio({ tournament, tenantSlug, tenantName, primaryColor, secondaryColor, logoUrl }: Props) {
  const settings = tournament.settings;
  const [kind, setKind] = useState<AssetKind>('flyer');
  const [eyebrow, setEyebrow] = useState(tenantName ? `${tenantName} Presents` : 'Tournament Registration');
  const [headline, setHeadline] = useState(tournament.name);
  const [dateLabel, setDateLabel] = useState(defaultDateLabel(settings?.tournamentDate));
  const [locationLabel, setLocationLabel] = useState('');
  const [entryFeeLabel, setEntryFeeLabel] = useState(
    settings?.ticketPriceForFundraiser ? `${formatCurrency(settings.ticketPriceForFundraiser)} Entry` : 'Free Entry',
  );
  const topPrize = settings?.prizePlaces?.find((p) => p.place === 1);
  const [prizeLabel, setPrizeLabel] = useState(
    topPrize ? `Top prize: ${topPrize.type === 'fixed' ? formatCurrency(topPrize.value) : `${topPrize.value}%`}` : '',
  );
  const [ctaText, setCtaText] = useState('Register Now');
  const [hashtag, setHashtag] = useState('');
  const [rendering, setRendering] = useState(false);
  const [downloadedAll, setDownloadedAll] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  // Resolved after mount (not in render) so the server-rendered markup — which
  // has no window.location — matches the client's first render and avoids a
  // hydration mismatch.
  const [registrationUrl, setRegistrationUrl] = useState('');
  useEffect(() => {
    // The readable link, not the id — this is the URL that ends up printed on a
    // flyer and encoded in the QR code, so it has to be one a person can type.
    setRegistrationUrl(`${window.location.origin}${tournamentPath(tenantSlug, tournament.slug)}/register`);
  }, [tenantSlug, tournament.slug]);

  const content: AssetContent = useMemo(
    () => ({ eyebrow, headline, dateLabel, locationLabel, entryFeeLabel, prizeLabel, ctaText, registrationUrl, hashtag }),
    [eyebrow, headline, dateLabel, locationLabel, entryFeeLabel, prizeLabel, ctaText, registrationUrl, hashtag],
  );

  const branding = useMemo(
    () => ({ primaryColor, secondaryColor, logoUrl, tenantName }),
    [primaryColor, secondaryColor, logoUrl, tenantName],
  );

  useEffect(() => {
    if (!canvasRef.current || !registrationUrl) return;
    let cancelled = false;
    setRendering(true);
    renderAsset(canvasRef.current, kind, branding, content)
      .catch(() => {})
      .finally(() => { if (!cancelled) setRendering(false); });
    return () => { cancelled = true; };
  }, [kind, branding, content, registrationUrl]);

  async function handleDownload() {
    if (!canvasRef.current) return;
    downloadCanvas(canvasRef.current, `${tournament.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${ASSET_SPECS[kind].filenameSuffix}.png`);
  }

  async function handleDownloadAll() {
    if (!offscreenRef.current) offscreenRef.current = document.createElement('canvas');
    const canvas = offscreenRef.current;
    for (const k of ASSET_KIND_ORDER) {
      await renderAsset(canvas, k, branding, content);
      downloadCanvas(canvas, `${tournament.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${ASSET_SPECS[k].filenameSuffix}.png`);
      // Give the browser a beat between triggered downloads.
      await new Promise((r) => setTimeout(r, 250));
    }
    setDownloadedAll(true);
    setTimeout(() => setDownloadedAll(false), 3000);
  }

  const caption = [
    `${headline} 🏆`,
    [dateLabel, locationLabel].filter(Boolean).join(' · '),
    entryFeeLabel,
    `Register: ${registrationUrl}`,
    hashtag,
  ].filter(Boolean).join('\n');

  const [captionCopied, setCaptionCopied] = useState(false);

  const spec = ASSET_SPECS[kind];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6">
      {/* Editable fields */}
      <div className="space-y-5">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div>
            <h2 className="font-bold text-slate-800">Event Details</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Fills the flyer, Instagram post, and story — edit once, every format updates.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Eyebrow</label>
            <input value={eyebrow} onChange={(e) => setEyebrow(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" placeholder="Stanford Club Tennis Presents" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Headline</label>
            <input value={headline} onChange={(e) => setHeadline(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" placeholder="Spring Charity Cup" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Date &amp; Time</label>
              <input value={dateLabel} onChange={(e) => setDateLabel(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" placeholder="Sat, April 18 · 9AM" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Location</label>
              <input value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" placeholder="Taube Tennis Center" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Entry line</label>
              <input value={entryFeeLabel} onChange={(e) => setEntryFeeLabel(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" placeholder="$25 Entry" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Prize line</label>
              <input value={prizeLabel} onChange={(e) => setPrizeLabel(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" placeholder="Top prize: $250" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Button text</label>
              <input value={ctaText} onChange={(e) => setCtaText(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" placeholder="Register Now" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Hashtag</label>
              <input value={hashtag} onChange={(e) => setHashtag(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" placeholder="#GoStanford" />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Every asset carries a scannable QR code that links straight to{' '}
            <span className="font-mono text-slate-500 break-all">{registrationUrl || '…'}</span>
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-800">Instagram Caption</h2>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(caption);
                setCaptionCopied(true);
                setTimeout(() => setCaptionCopied(false), 2000);
              }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {captionCopied ? '✓ Copied' : 'Copy caption'}
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-slate-600 bg-slate-50 rounded-xl p-3 font-sans">{caption}</pre>
        </div>
      </div>

      {/* Live preview + downloads */}
      <div className="space-y-4">
        <div className="flex gap-2">
          {ASSET_KIND_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors flex items-center justify-center gap-1.5 ${
                kind === k ? 'text-white border-transparent' : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-50'
              }`}
              style={kind === k ? { backgroundColor: primaryColor, borderColor: primaryColor } : {}}
            >
              <span>{ASSET_ICON[k]}</span>
              {ASSET_SPECS[k].label}
            </button>
          ))}
        </div>

        <div className="bg-slate-100 rounded-3xl border border-slate-200 p-4 sm:p-6 flex items-center justify-center">
          <div
            className="relative w-full rounded-2xl overflow-hidden shadow-2xl bg-white"
            style={{ aspectRatio: `${spec.width} / ${spec.height}`, maxWidth: spec.height > spec.width ? 320 : 480, maxHeight: 560 }}
          >
            <canvas ref={canvasRef} className="w-full h-full block" />
            {rendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/40 text-xs font-semibold text-slate-500">
                Rendering…
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400">{spec.blurb}</p>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="btn-primary flex-1 py-3 rounded-xl font-bold text-sm"
          >
            ⬇ Download {ASSET_SPECS[kind].label}
          </button>
          <button
            type="button"
            onClick={handleDownloadAll}
            className="flex-1 py-3 rounded-xl font-bold text-sm border-2 border-slate-200 text-slate-600 hover:bg-white transition-colors"
          >
            {downloadedAll ? '✓ Downloaded all 3' : 'Download all 3 sizes'}
          </button>
        </div>
      </div>
    </div>
  );
}
