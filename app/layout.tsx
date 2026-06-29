import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Find IONIQ 5 — Hidden Car Game',
  description: 'A Where’s Waldo-style browser game: find the Hyundai IONIQ 5 among colourful cars and post your time to the leaderboard.',
  openGraph: {
    title: 'Find IONIQ 5',
    description: 'Find the hidden IONIQ 5 among a swarm of colourful cars.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
