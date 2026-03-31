'use client';

import { usePathname } from 'next/navigation';

export function PersistentCanvas() {
  const pathname = usePathname();

  const showCanvas = pathname === '/' || pathname.startsWith('/workflows');
  if (!showCanvas) {
    return null;
  }

  return <div className="workflow-persistent-canvas" aria-hidden="true" />;
}
