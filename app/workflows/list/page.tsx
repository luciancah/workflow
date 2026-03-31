'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type WorkflowListItem = {
  id: number;
  name: string;
  description: string;
  updatedAt: string;
  lastStatus?: string | null;
  lastRunAt?: string | null;
};

export default function WorkflowsListPage() {
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/workflows', { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data)) {
        setWorkflows(data);
      }
    })();
  }, []);

  return (
    <main className="wf-shell">
      <div className="wf-toolbar">
        <strong>워크플로우 목록</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/">새 워크플로우</Link>
          <Link href="/workflows">최신 워크플로우 열기</Link>
        </div>
      </div>

      <section className="wf-layout">
        <div className="wf-list-grid">
          {workflows.length === 0 ? (
            <p className="wf-muted">저장된 워크플로우가 없습니다.</p>
          ) : (
            workflows.map((workflow) => (
              <div key={workflow.id} className="wf-list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong>
                    <Link href={`/workflows/${workflow.id}`}>{workflow.name}</Link>
                  </strong>
                  <span className="wf-muted" style={{ fontSize: 12 }}>
                    #{workflow.id}
                  </span>
                </div>
                <p className="wf-muted" style={{ margin: '6px 0' }}>
                  {workflow.description}
                </p>
                <div className="wf-muted" style={{ fontSize: 12 }}>
                  마지막 실행: {workflow.lastStatus || '없음'} / {workflow.lastRunAt || '미실행'}
                </div>
                <div className="wf-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  수정: {new Date(workflow.updatedAt).toLocaleString('en-US', { timeZone: 'Asia/Seoul' })}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
