import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'One Point Bowl — D1 Tennis Fundraising Platform',
  description: 'Run high-energy single-elimination tennis tournaments that grow your donor base. Built for D1 collegiate tennis programs.',
  openGraph: {
    title: 'One Point Bowl',
    description: 'The fundraising tournament platform for D1 tennis programs.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
