import QRCode from 'qrcode';

export type AssetKind = 'flyer' | 'instagram_post' | 'instagram_story';

export interface AssetSpec {
  width: number;
  height: number;
  label: string;
  blurb: string;
  filenameSuffix: string;
}

export const ASSET_SPECS: Record<AssetKind, AssetSpec> = {
  flyer: {
    width: 1700,
    height: 2200,
    label: 'Printable Flyer',
    blurb: '8.5×11" · print at a copy shop or the front office',
    filenameSuffix: 'flyer',
  },
  instagram_post: {
    width: 1080,
    height: 1080,
    label: 'Instagram Post',
    blurb: 'Square feed post',
    filenameSuffix: 'ig-post',
  },
  instagram_story: {
    width: 1080,
    height: 1920,
    label: 'Instagram Story',
    blurb: 'Full-screen story or reel cover',
    filenameSuffix: 'ig-story',
  },
};

export const ASSET_KIND_ORDER: AssetKind[] = ['flyer', 'instagram_post', 'instagram_story'];

export interface AssetBranding {
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  tenantName: string;
}

export interface AssetContent {
  eyebrow: string;
  headline: string;
  dateLabel: string;
  locationLabel: string;
  entryFeeLabel: string;
  prizeLabel: string;
  ctaText: string;
  registrationUrl: string;
  hashtag: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const safeColor = (c: string, fallback: string) => (HEX_RE.test(c) ? c : fallback);

function resolveFontStack(cssVar: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return raw || fallback;
}

async function ensureFontsLoaded(specs: { weight: string; size: number; family: string }[]) {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.all(specs.map((s) => document.fonts.load(`${s.weight} ${s.size}px ${s.family}`)));
    await document.fonts.ready;
  } catch {
    // Canvas falls back to the browser default font — still legible, just less on-brand.
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('logo failed to load'));
    img.src = url;
  });
}

/** Draws text letter-by-letter so we get real tracking without relying on
 *  browser support for the canvas `letterSpacing` property. */
function fillTextTracked(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let x = cx - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    x += widths[i] + spacing;
  });
  ctx.textAlign = align;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, primary: string, secondary: string) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, primary);
  grad.addColorStop(0.55, primary);
  grad.addColorStop(1, secondary);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Soft brand-colored glows for depth, echoing the web hero.
  ctx.save();
  ctx.filter = `blur(${Math.round(w * 0.08)}px)`;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = secondary;
  ctx.beginPath();
  ctx.arc(w * 0.88, h * 0.06, w * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(w * 0.05, h * 0.95, w * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

async function drawLogoBadge(
  ctx: CanvasRenderingContext2D,
  logoUrl: string | undefined,
  cx: number,
  cy: number,
  size: number,
) {
  const r = size / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = size * 0.12;
  ctx.shadowOffsetY = size * 0.04;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(cx - r, cy - r, size, size, size * 0.28);
  ctx.fill();
  ctx.restore();

  if (!logoUrl) return;
  try {
    const img = await loadImage(logoUrl);
    const pad = size * 0.16;
    const inner = size - pad * 2;
    const scale = Math.min(inner / img.width, inner / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.save();
    roundRectPath(ctx, cx - r, cy - r, size, size, size * 0.28);
    ctx.clip();
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.restore();
  } catch {
    // No usable logo (missing, or blocked by CORS) — the white badge still reads fine on its own.
  }
}

async function drawQrCard(
  ctx: CanvasRenderingContext2D,
  url: string,
  x: number,
  y: number,
  size: number,
  primary: string,
) {
  const pad = size * 0.14;
  const card = size + pad * 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = size * 0.1;
  ctx.fillStyle = '#ffffff';
  roundRectPath(ctx, x, y, card, card, card * 0.12);
  ctx.fill();
  ctx.restore();

  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, url, {
    width: Math.round(size),
    margin: 0,
    color: { dark: '#0f172a', light: '#ffffff00' },
  });
  ctx.drawImage(qrCanvas, x + pad, y + pad, size, size);
  void primary;
  return card;
}

interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  primary: string;
  secondary: string;
}

function pill(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, fontSize: number, family: string) {
  ctx.font = `700 ${fontSize}px ${family}`;
  const padX = fontSize * 0.9;
  const textW = ctx.measureText(text).width;
  const boxW = textW + padX * 2;
  const boxH = fontSize * 2.1;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, fontSize * 0.04);
  roundRectPath(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, boxH / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + fontSize * 0.04);
  ctx.restore();
  return boxW;
}

async function renderPortrait({ ctx, w, h, primary, secondary }: DrawCtx, branding: AssetBranding, content: AssetContent) {
  const display = resolveFontStack('--font-display', "'Arial Black', system-ui, sans-serif");
  const body = resolveFontStack('--font-body', 'system-ui, sans-serif');
  await ensureFontsLoaded([
    { weight: '800', size: w * 0.075, family: display },
    { weight: '900', size: w * 0.11, family: display },
    { weight: '700', size: w * 0.03, family: body },
    { weight: '600', size: w * 0.026, family: body },
  ]);

  drawBackground(ctx, w, h, primary, secondary);

  const cx = w / 2;
  let y = h * 0.1;

  await drawLogoBadge(ctx, branding.logoUrl, cx, y, w * 0.16);
  y += w * 0.16;

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `700 ${Math.round(w * 0.032)}px ${body}`;
  ctx.textBaseline = 'alphabetic';
  fillTextTracked(ctx, content.eyebrow.toUpperCase(), cx, y + w * 0.075, w * 0.006);
  y += w * 0.11;

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `900 ${Math.round(w * 0.1)}px ${display}`;
  const lines = wrapLines(ctx, content.headline, w * 0.86);
  const lineH = w * 0.108;
  for (const line of lines) {
    y += lineH;
    ctx.fillText(line, cx, y);
  }
  y += w * 0.05;

  // Facts row
  const facts = [content.dateLabel, content.locationLabel].filter(Boolean);
  ctx.font = `600 ${Math.round(w * 0.032)}px ${body}`;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (const fact of facts) {
    y += w * 0.05;
    ctx.fillText(fact, cx, y);
  }

  y += w * 0.06;
  const pillGap = w * 0.03;
  const pillFontSize = w * 0.028;
  const pillTexts = [content.entryFeeLabel, content.prizeLabel].filter(Boolean);
  if (pillTexts.length) {
    const widths = pillTexts.map((t) => {
      ctx.font = `700 ${pillFontSize}px ${body}`;
      return ctx.measureText(t).width + pillFontSize * 1.8;
    });
    const totalW = widths.reduce((a, b) => a + b, 0) + pillGap * (pillTexts.length - 1);
    let px = cx - totalW / 2;
    for (let i = 0; i < pillTexts.length; i++) {
      const bw = pill(ctx, pillTexts[i], px + widths[i] / 2, y, pillFontSize, body);
      px += bw + pillGap;
    }
    y += pillFontSize * 2.4;
  }

  // Bottom CTA card: QR + register + tenant footer
  const cardH = h * 0.24;
  const cardY = h - cardH - h * 0.045;
  const cardX = w * 0.08;
  const cardW = w * 0.84;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  roundRectPath(ctx, cardX, cardY, cardW, cardH, cardH * 0.16);
  ctx.fill();
  ctx.restore();

  const qrSize = cardH * 0.62;
  const qrX = cardX + cardH * 0.22;
  const qrY = cardY + (cardH - (qrSize + qrSize * 0.28)) / 2;
  await drawQrCard(ctx, content.registrationUrl, qrX, qrY, qrSize, primary);

  const textX = qrX + qrSize + qrSize * 0.28 + cardH * 0.18;
  ctx.textAlign = 'left';
  ctx.fillStyle = primary;
  ctx.font = `900 ${Math.round(cardH * 0.2)}px ${display}`;
  ctx.fillText(content.ctaText, textX, cardY + cardH * 0.42);
  ctx.fillStyle = '#475569';
  ctx.font = `600 ${Math.round(cardH * 0.1)}px ${body}`;
  ctx.fillText('Scan the QR code to sign up', textX, cardY + cardH * 0.6);
  if (content.hashtag) {
    ctx.fillStyle = secondary;
    ctx.font = `700 ${Math.round(cardH * 0.1)}px ${body}`;
    ctx.fillText(content.hashtag, textX, cardY + cardH * 0.78);
  }
}

async function renderSquare({ ctx, w, h, primary, secondary }: DrawCtx, branding: AssetBranding, content: AssetContent) {
  const display = resolveFontStack('--font-display', "'Arial Black', system-ui, sans-serif");
  const body = resolveFontStack('--font-body', 'system-ui, sans-serif');
  await ensureFontsLoaded([
    { weight: '900', size: w * 0.1, family: display },
    { weight: '700', size: w * 0.032, family: body },
  ]);

  drawBackground(ctx, w, h, primary, secondary);
  const cx = w / 2;
  let y = h * 0.12;

  await drawLogoBadge(ctx, branding.logoUrl, cx, y, w * 0.16);
  y += w * 0.155;

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `700 ${Math.round(w * 0.03)}px ${body}`;
  fillTextTracked(ctx, content.eyebrow.toUpperCase(), cx, y + w * 0.07, w * 0.006);
  y += w * 0.1;

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `900 ${Math.round(w * 0.088)}px ${display}`;
  const lines = wrapLines(ctx, content.headline, w * 0.84);
  const lineH = w * 0.096;
  for (const line of lines) {
    y += lineH;
    ctx.fillText(line, cx, y);
  }

  y += w * 0.06;
  ctx.font = `600 ${Math.round(w * 0.032)}px ${body}`;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  const facts = [content.dateLabel, [content.locationLabel, content.entryFeeLabel].filter(Boolean).join('  ·  ')].filter(Boolean);
  for (const fact of facts) {
    y += w * 0.048;
    ctx.fillText(fact, cx, y);
  }

  // Bottom CTA strip
  const stripH = h * 0.24;
  const stripY = h - stripH;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.beginPath();
  ctx.rect(0, stripY, w, stripH);
  ctx.fill();
  ctx.restore();

  const qrSize = stripH * 0.6;
  const qrY = stripY + (stripH - qrSize * 1.28) / 2;
  const qrX = w * 0.08;
  await drawQrCard(ctx, content.registrationUrl, qrX, qrY, qrSize, primary);

  const textX = qrX + qrSize * 1.28 + w * 0.05;
  ctx.textAlign = 'left';
  ctx.fillStyle = primary;
  ctx.font = `900 ${Math.round(stripH * 0.22)}px ${display}`;
  ctx.fillText(content.ctaText, textX, stripY + stripH * 0.42);
  ctx.fillStyle = '#475569';
  ctx.font = `600 ${Math.round(stripH * 0.11)}px ${body}`;
  ctx.fillText(content.hashtag || 'Scan to register', textX, stripY + stripH * 0.62);
}

async function renderStory({ ctx, w, h, primary, secondary }: DrawCtx, branding: AssetBranding, content: AssetContent) {
  const display = resolveFontStack('--font-display', "'Arial Black', system-ui, sans-serif");
  const body = resolveFontStack('--font-body', 'system-ui, sans-serif');
  await ensureFontsLoaded([
    { weight: '900', size: w * 0.135, family: display },
    { weight: '700', size: w * 0.036, family: body },
  ]);

  drawBackground(ctx, w, h, primary, secondary);
  const cx = w / 2;
  let y = h * 0.14;

  await drawLogoBadge(ctx, branding.logoUrl, cx, y, w * 0.2);
  y += w * 0.19;

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `700 ${Math.round(w * 0.034)}px ${body}`;
  fillTextTracked(ctx, content.eyebrow.toUpperCase(), cx, y + w * 0.08, w * 0.007);
  y += w * 0.13;

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `900 ${Math.round(w * 0.118)}px ${display}`;
  const lines = wrapLines(ctx, content.headline, w * 0.86);
  const lineH = w * 0.128;
  for (const line of lines) {
    y += lineH;
    ctx.fillText(line, cx, y);
  }

  y += w * 0.08;
  ctx.font = `600 ${Math.round(w * 0.038)}px ${body}`;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  const facts = [content.dateLabel, content.locationLabel, content.entryFeeLabel].filter(Boolean);
  for (const fact of facts) {
    y += w * 0.058;
    ctx.fillText(fact, cx, y);
  }

  // Centered QR block near the lower third, mirroring a story's "swipe up" zone
  const qrSize = w * 0.34;
  const qrX = cx - qrSize / 2;
  const qrY = h * 0.68;
  await drawQrCard(ctx, content.registrationUrl, qrX, qrY, qrSize, primary);

  const card = qrSize * 1.28;
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${Math.round(w * 0.05)}px ${display}`;
  ctx.textAlign = 'center';
  ctx.fillText(content.ctaText, cx, qrY + card + w * 0.06);
  if (content.hashtag) {
    ctx.font = `700 ${Math.round(w * 0.034)}px ${body}`;
    ctx.fillStyle = secondary;
    ctx.fillText(content.hashtag, cx, qrY + card + w * 0.11);
  }
}

export async function renderAsset(
  canvas: HTMLCanvasElement,
  kind: AssetKind,
  brandingIn: AssetBranding,
  content: AssetContent,
): Promise<void> {
  const spec = ASSET_SPECS[kind];
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const branding: AssetBranding = {
    ...brandingIn,
    primaryColor: safeColor(brandingIn.primaryColor, '#1d4ed8'),
    secondaryColor: safeColor(brandingIn.secondaryColor, '#7c3aed'),
  };
  const drawCtx: DrawCtx = { ctx, w: spec.width, h: spec.height, primary: branding.primaryColor, secondary: branding.secondaryColor };

  if (kind === 'flyer') await renderPortrait(drawCtx, branding, content);
  else if (kind === 'instagram_post') await renderSquare(drawCtx, branding, content);
  else await renderStory(drawCtx, branding, content);
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
