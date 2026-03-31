'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function WorkflowsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const redirect = async () => {
      try {
        const res = await fetch('/api/workflows', { cache: 'no-store' });
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const sorted = [...data].sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );
          router.replace(`/workflows/${sorted[0].id}`);
          return;
        }
      } catch {
        // ignore
      }
      router.replace('/');
    };

    redirect();
  }, [router]);

  return <main className="layout-shell">로딩 중...</main>;
}
