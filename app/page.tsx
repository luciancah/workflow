 'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReactFlow, Background } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

type QuickNode = {
  id: string;
  type: 'trigger';
  position: { x: number; y: number };
  data: {
    type: 'add';
    onCreate?: () => void;
  };
  draggable: boolean;
  selectable: boolean;
};

const starterFlowNodes: QuickNode[] = [
  {
    id: 'start-hint',
    type: 'trigger',
    position: { x: -120, y: 0 },
    data: { type: 'add' },
    draggable: false,
    selectable: false,
  },
];

export default function HomePage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('새 워크플로우');
  const [description, setDescription] = useState('AI/Teams 기반 템플릿');

  const initialNodes = useMemo(
    () => starterFlowNodes,
    [],
  );
  const [nodes] = useState(initialNodes);

  useEffect(() => {
    const fallback = localStorage.getItem('wf_name');
    if (fallback) setName(fallback);
  }, []);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    const defaultPayload = {
      name: name.trim() || '새 워크플로우',
      description,
      reactFlowJson: {
        nodes: [
          {
            id: 'start-1',
            type: 'workflowNode',
            position: { x: 40, y: 80 },
            data: { type: 'start', label: 'Start' },
          },
          {
            id: 'ai-1',
            type: 'workflowNode',
            position: { x: 320, y: 80 },
            data: {
              type: 'ai',
              label: 'AI',
              prompt: '안녕하세요. 메시지를 생성해 주세요.',
            },
          },
        ],
        edges: [
          {
            id: 'e-start-ai',
            source: 'start-1',
            target: 'ai-1',
            type: 'animated',
          },
        ],
      },
    };

    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(defaultPayload),
    });
    const result = await res.json();
    if (res.ok) {
      localStorage.setItem('wf_name', name || '새 워크플로우');
      router.replace(`/workflows/${result.id}`);
    } else {
      setCreating(false);
      alert(result.error || '워크플로우 생성 실패');
    }
  };

  return (
    <main style={{ position: 'fixed', inset: 0, background: 'transparent' }}>
      <div className="wf-layout">
        <div
          style={{
            position: 'absolute',
            inset: 12,
            border: '1px solid var(--border)',
            borderRadius: 12,
            background: 'var(--sidebar)',
            overflow: 'hidden',
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={[]}
            nodeTypes={{
              trigger: () => (
                <div className="wf-add-node">
                  <div>
                    <h1 style={{ margin: 0, fontSize: 28 }}>
                      AI Workflow Builder
                    </h1>
                    <p style={{ color: 'var(--muted-foreground)' }}>
                      시작 화면입니다. 새 워크플로우 버튼으로 바로 편집기로 이동합니다.
                    </p>
                    <button className="wf-btn primary" onClick={handleCreate} disabled={creating}>
                      {creating ? '생성 중...' : '새 워크플로우 시작'}
                    </button>
                  </div>
                </div>
              ),
            }}
            fitView
            panOnScroll
          >
            <Background />
          </ReactFlow>
          <div
            style={{
              position: 'absolute',
              left: 24,
              top: 24,
              right: 24,
              display: 'grid',
              gap: 8,
              width: 360,
              zIndex: 20,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20 }}>시작하기</h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="워크플로우 이름"
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                background: '#0b1220',
                border: '1px solid var(--border)',
              }}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={240}
              placeholder="설명"
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                background: '#0b1220',
                border: '1px solid var(--border)',
              }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
