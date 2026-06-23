import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SuddenSlam',
  description: 'Single Point Showdown — high-speed single-elimination tennis tournament platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
