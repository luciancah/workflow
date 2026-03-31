'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type WorkflowListItem = {
  id: number;
  name: string;
  description: string;
  updatedAt: string;
  conductorName: string;
  lastStatus?: string | null;
  lastRunAt?: string | null;
};

export default function WorkflowListPage() {
  const [rows, setRows] = useState<WorkflowListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/workflows', { cache: 'no-store' });
    const data = await res.json();
    setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const emptyText = useMemo(
    () =>
      rows.length === 0
        ? '아직 워크플로우가 없습니다. 새로 만들어보세요.'
        : '',
    [rows.length],
  );

  return (
    <main className="layout">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h1 style={{ margin: 0 }}>Workflow Builder</h1>
          <Link href="/workflows/new">
            <button>+ 새 워크플로우</button>
          </Link>
        </div>
        {loading && <p>불러오는 중...</p>}
        {!loading && emptyText && <p>{emptyText}</p>}
        {!loading && rows.length > 0 && (
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            {rows.map((workflow) => (
              <div key={workflow.id} className="panel" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{workflow.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {workflow.description || '설명 없음'}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                      Conductor: {workflow.conductorName}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      최근 실행: {workflow.lastRunAt ? new Date(workflow.lastRunAt).toLocaleString() : '없음'}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      상태:{' '}
                      <span style={{ color: workflow.lastStatus === 'COMPLETED' ? '#14b8a6' : '#f59e0b' }}>
                        {workflow.lastStatus || '미실행'}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <Link href={`/workflows/${workflow.id}`}>
                    <button>열기</button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

