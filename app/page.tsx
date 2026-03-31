'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('새 워크플로우');
  const [description, setDescription] = useState('AI/Teams 기반 템플릿');

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
    <main className="wf-home">
      <section className="wf-home-panel">
        <p className="wf-home-kicker">Conductor + Workflow Builder</p>
        <h1 className="wf-home-title">AI/Teams Workflow Builder</h1>
        <p className="wf-muted">
          시작 화면에서 바로 새 워크플로우를 생성하고 편집 화면으로 이동해
          노드를 구성할 수 있습니다.
        </p>
        <div className="wf-grid">
          <label className="wf-field">
            <span>이름</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="워크플로우 이름"
            />
          </label>
          <label className="wf-field">
            <span>설명</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={240}
              placeholder="설명"
            />
          </label>
          <button className="wf-btn primary" onClick={handleCreate} disabled={creating}>
            {creating ? '생성 중...' : '새 워크플로우 시작'}
          </button>
        </div>
      </section>
    </main>
  );
}
