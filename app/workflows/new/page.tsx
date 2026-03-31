'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const initialNodes = {
  nodes: [
    {
      id: 'start',
      type: 'workflowNode',
      position: { x: 40, y: 80 },
      data: { type: 'start', label: 'Start' },
    },
    {
      id: 'ai-1',
      type: 'workflowNode',
      position: { x: 280, y: 80 },
      data: { type: 'ai', label: 'AI Mock', prompt: '안녕하세요. 메시지를 생성해 주세요.' },
    },
  ],
  edges: [
    { id: 'e-start-ai', source: 'start', target: 'ai-1' },
  ],
};

export default function NewWorkflowPage() {
  const router = useRouter();
  const [name, setName] = useState('새 워크플로우');
  const [description, setDescription] = useState('AI/Teams 기반 예시 워크플로우');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    setSaving(true);
    const res = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        reactFlowJson: initialNodes,
      }),
    });
    const result = await res.json();
    setSaving(false);
    if (res.ok) {
      router.push(`/workflows/${result.id}`);
    } else {
      alert(result.error || '워크플로우 생성 실패');
    }
  };

  return (
    <main className="wf-layout">
      <div className="wf-home-panel" style={{ margin: '0 auto', maxWidth: 640 }}>
        <h1>새 워크플로우 생성</h1>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>
            이름
            <input
              className="wf-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', marginTop: 6 }}
            />
          </label>
          <label>
            설명
            <textarea
              className="wf-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              style={{ width: '100%', marginTop: 6 }}
            />
          </label>
          <button className="wf-btn primary" disabled={saving || !name.trim()} onClick={create}>
            {saving ? '생성 중...' : '워크플로우 생성'}
          </button>
        </div>
      </div>
    </main>
  );
}
