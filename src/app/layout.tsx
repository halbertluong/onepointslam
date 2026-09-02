import type { Metadata } from 'next';
import { Outfit, Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  variable: '--font-display',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

/**
 * Link previews need absolute URLs. Production is the real domain; a preview
 * deployment points at itself so a shared preview link shows its own card.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_ENV !== 'production' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://onepointbowl.com');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'One Point Bowl — D1 Tennis Fundraising Platform',
  description: 'Run high-energy single-elimination tennis tournaments that grow your donor base. Built for D1 collegiate tennis programs.',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎾</text></svg>",
  },
  openGraph: {
    title: 'One Point Bowl',
    description: 'The fundraising tournament platform for D1 tennis programs.',
    type: 'website',
    siteName: 'One Point Bowl',
  },
  twitter: {
    // Chat apps and social clients show a full-width image for this card type
    // rather than the small square thumbnail 'summary' gives.
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${outfit.variable} ${inter.variable}`}>
      <body className="min-h-full flex flex-col antialiased">
        <ImpersonationBanner />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
