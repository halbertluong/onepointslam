import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

/**
 * The link preview card for a tournament.
 *
 * This is what people see when a registration link is pasted into iMessage,
 * WhatsApp, Slack, or a group chat — for most registrants it is the first thing
 * they ever see of the tournament, so it carries the school's own colours and
 * logo rather than a generic platform banner.
 *
 * Kept as a pure function of plain data so it can be rendered and eyeballed
 * without a database (see scripts/preview-og.tsx).
 */

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * The card uses the same display face as the site. next/og only ships a single
 * regular weight, and a link preview is mostly headline, so the weights are
 * read from disk here.
 *
 * Loaded once per instance and never allowed to fail the render: a card in the
 * fallback face still says everything it needs to, whereas a throw would leave
 * a crawler with no preview at all.
 */
type ImageOptions = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>;
type LoadedFonts = ImageOptions['fonts'];
let fontsPromise: Promise<LoadedFonts> | null = null;

function loadFonts(): Promise<LoadedFonts> {
  fontsPromise ??= (async () => {
    try {
      const [medium, extraBold] = await Promise.all([
        readFile(join(process.cwd(), 'src/assets/Outfit-500.ttf')),
        readFile(join(process.cwd(), 'src/assets/Outfit-800.ttf')),
      ]);
      return [
        { name: 'Outfit', data: medium, style: 'normal' as const, weight: 500 as const },
        { name: 'Outfit', data: extraBold, style: 'normal' as const, weight: 800 as const },
      ];
    } catch {
      return undefined;
    }
  })();
  return fontsPromise;
}

export interface OgCardData {
  /** Tournament name — the headline. */
  title: string;
  /** School / program name, shown small above the headline. */
  school: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string | null;
  /** Short facts shown as chips: date, entry fee, draw size. */
  facts: string[];
  /** Call to action wording, e.g. "Register" or "Live bracket". */
  cta: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function safeColor(value: string | undefined | null, fallback: string): string {
  return value && HEX.test(value) ? value : fallback;
}

/** Relative luminance, per WCAG, for deciding light vs dark text. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** Above this, a colour needs dark ink on it; below, light ink. */
const LIGHT = 0.45;

/** Mixes a colour toward black (amount < 0) or white (amount > 0). */
function mix(hex: string, amount: number): string {
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  const part = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(v + (target - v) * t).toString(16).padStart(2, '0');
  };
  return `#${part(0)}${part(1)}${part(2)}`;
}

/**
 * Picks a background the text is guaranteed to read on.
 *
 * A school's two brand colours are often at opposite ends — Portland's are deep
 * purple and white — and a gradient spanning that range has no single ink
 * colour that works across it: white disappears at one end, dark at the other.
 * So the two stops are only used together when they sit on the same side of the
 * light/dark line. When they straddle it, the gradient is built from the
 * primary and a shaded copy of itself, and the secondary moves to the call-to-
 * action pill, where it keeps the school's second colour on the card without
 * ever having to carry body text.
 */
function palette(primary: string, secondary: string) {
  const primaryIsLight = luminance(primary) > LIGHT;
  const secondaryIsLight = luminance(secondary) > LIGHT;
  const straddles = primaryIsLight !== secondaryIsLight;

  const from = primary;
  const to = straddles ? mix(primary, primaryIsLight ? 0.28 : -0.42) : secondary;

  const ink = primaryIsLight
    ? { text: '#10131c', muted: 'rgba(16,19,28,0.66)', chip: 'rgba(16,19,28,0.10)' }
    : { text: '#ffffff', muted: 'rgba(255,255,255,0.74)', chip: 'rgba(255,255,255,0.17)' };

  // The freed-up secondary becomes the pill; otherwise the pill just inverts.
  const pillBg = straddles ? secondary : primaryIsLight ? '#10131c' : '#ffffff';
  const pillText = luminance(pillBg) > LIGHT ? '#10131c' : '#ffffff';

  return { from, to, ...ink, pillBg, pillText };
}

/** Only http(s) images can be fetched by the renderer; anything else is dropped. */
function usableLogo(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

export async function tournamentCard(data: OgCardData): Promise<ImageResponse> {
  const fonts = await loadFonts();
  const primary = safeColor(data.primaryColor, '#1a2033');
  const secondary = safeColor(data.secondaryColor, '#4f6ef7');
  const ink = palette(primary, secondary);
  const logo = usableLogo(data.logoUrl);

  // Long tournament names have to stay on the card rather than run off it.
  const titleSize = data.title.length > 46 ? 68 : data.title.length > 30 ? 84 : 100;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '68px 76px',
          background: `linear-gradient(135deg, ${ink.from} 0%, ${ink.to} 100%)`,
          color: ink.text,
          fontFamily: 'Outfit',
          fontWeight: 500,
        }}
      >
        {/* Top: school identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {logo && (
            // Rendered by satori into a PNG, not by the browser — next/image
            // has nothing to optimise here, and alt text has nowhere to go.
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img
              src={logo}
              width={76}
              height={76}
              style={{ objectFit: 'contain', borderRadius: 14 }}
            />
          )}
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: ink.muted,
            }}
          >
            {data.school}
          </div>
        </div>

        {/* Middle: the headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: -2.5,
            }}
          >
            {data.title}
          </div>

          {data.facts.length > 0 && (
            <div style={{ display: 'flex', gap: 14 }}>
              {data.facts.map((fact) => (
                <div
                  key={fact}
                  style={{
                    display: 'flex',
                    fontSize: 28,
                    padding: '12px 24px',
                    borderRadius: 999,
                    background: ink.chip,
                    color: ink.text,
                  }}
                >
                  {fact}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom: the ask, and where it lives */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 32,
              fontWeight: 800,
              padding: '18px 40px',
              borderRadius: 999,
              background: ink.pillBg,
              color: ink.pillText,
            }}
          >
            {data.cta}
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: ink.muted, letterSpacing: 0.5 }}>
            onepointbowl.com
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
