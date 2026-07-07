import type { Metadata } from 'next';
import DemoClient from './DemoClient';

export const metadata: Metadata = {
  title: 'Interactive Demo — One Point Bowl',
  description: 'Try every feature of One Point Bowl without creating an account. Create a tournament, generate participants, experience all user views.',
};

export default function DemoPage() {
  return <DemoClient />;
}
