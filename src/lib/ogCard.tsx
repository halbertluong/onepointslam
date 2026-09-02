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

/**
 * A school whose colours are pale (gold, cream, light grey) would drown white
 * text, so the card flips to dark ink on those. Averaged across both brand
 * colours because the background is a gradient between them.
 */
function inkFor(primary: string, secondary: string) {
  const light = (luminance(primary) + luminance(secondary)) / 2 > 0.42;
  return light
    ? { text: '#10131c', muted: 'rgba(16,19,28,0.68)', chip: 'rgba(16,19,28,0.09)', pillBg: '#10131c', pillText: '#ffffff' }
    : { text: '#ffffff', muted: 'rgba(255,255,255,0.76)', chip: 'rgba(255,255,255,0.16)', pillBg: '#ffffff', pillText: '#10131c' };
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
  const ink = inkFor(primary, secondary);
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
          background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
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
