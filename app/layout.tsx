import type { Metadata } from 'next';
import './globals.css';
import { ReactFlowProvider } from '@xyflow/react';
import { PersistentCanvas } from '@/components/workflow/persistent-canvas';

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
      <body>
        <ReactFlowProvider>
          <PersistentCanvas />
          <div className="layout-shell">{children}</div>
        </ReactFlowProvider>
      </body>
    </html>
  );
}
