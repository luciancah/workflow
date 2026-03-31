import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Conductor Workflow Builder',
  description: 'Conductor OSS + Next.js workflow builder',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

