'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  useEdgesState,
  useNodesState,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { WorkflowRecord } from '@/lib/types';
import type { NodeData } from '@/lib/types';

type RunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TERMINATED' | string;

type Run = {
  id: number;
  workflowId: number;
  conductorWorkflowId: string;
  status: RunStatus;
  startedAt: string;
  endedAt?: string | null;
  input: unknown;
  output: unknown;
};

type RunStep = {
  id: number;
  conductorTaskId: string | null;
  taskRefName: string | null;
  status: string | null;
  taskType: string | null;
  startedAt: string | null;
  endedAt: string | null;
  input: unknown;
  output: unknown;
  attempt: number | null;
  logs: string | null;
  error: string | null;
};

const nodePalette: { type: NodeData['type']; label: string; description: string; required?: boolean }[] = [
  { type: 'start', label: 'Start', description: '진입 노드', required: true },
  { type: 'ai', label: 'AI', description: 'ai_mock SIMPLE task' },
  { type: 'teams', label: 'Teams', description: 'teams_mock SIMPLE task' },
  { type: 'branch', label: 'Branch', description: 'SWITCH 노드' },
  { type: 'wait', label: 'Wait', description: '대기' },
  { type: 'terminate', label: 'Terminate', description: '종료' },
  { type: 'script', label: 'Script', description: 'INLINE task' },
  { type: 'fork', label: 'Fork', description: 'FORK (실험 단계)', },
  { type: 'join', label: 'Join', description: 'JOIN (실험 단계)' },
];

const terminal = new Set(['COMPLETED', 'FAILED', 'FAILED_WITH_TERMINAL_ERROR', 'TERMINATED', 'CANCELED', 'CANCELLED']);

const defaultNodeMeta = (type: NodeData['type']): NodeData => {
  switch (type) {
    case 'start':
      return { type: 'start', label: 'Start' };
    case 'ai':
      return { type: 'ai', label: 'AI', prompt: '프롬프트를 입력하세요', channel: 'default' };
    case 'teams':
      return { type: 'teams', label: 'Teams', message: '메시지 템플릿' };
    case 'branch':
      return { type: 'branch', label: 'Branch', switchParam: 'branchValue' };
    case 'wait':
      return { type: 'wait', label: 'Wait', waitMs: 1000 };
    case 'terminate':
      return { type: 'terminate', label: 'Terminate', terminateType: 'SUCCESS', terminateMessage: 'Terminate' };
    case 'script':
      return { type: 'script', label: 'Script', script: 'return { ok: true };' };
    case 'fork':
      return { type: 'fork', label: 'Fork' };
    case 'join':
      return { type: 'join', label: 'Join' };
    default:
      return { type: 'start', label: 'Node' };
  }
};

const paletteColor: Record<NodeData['type'], string> = {
  start: '#14b8a6',
  ai: '#0ea5e9',
  teams: '#8b5cf6',
  branch: '#f59e0b',
  wait: '#06b6d4',
  terminate: '#ef4444',
  script: '#22c55e',
  fork: '#ec4899',
  join: '#d946ef',
};

function WorkflowNode({ data }: NodeProps<NodeData>) {
  return (
    <div style={{ padding: 8, minWidth: 150, background: '#0f172a', border: '1px solid #334155', borderRadius: 10 }}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div style={{ fontWeight: 700, color: paletteColor[data.type] }}>{data.label}</div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>{data.type}</div>
      {data.prompt && <div style={{ marginTop: 6, fontSize: 11 }}>{data.prompt}</div>}
      {data.message && <div style={{ marginTop: 6, fontSize: 11 }}>{data.message}</div>}
    </div>
  );
}

const nodeTypes = { workflowNode: WorkflowNode };

function isTerminalStatus(status: string) {
  return terminal.has(status);
}

export default function WorkflowBuilderPage({ workflowId }: { workflowId: number }) {
  const [loading, setLoading] = useState(true);
  const [workflow, setWorkflow] = useState<WorkflowRecord | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeTab, setNodeTab] = useState<'json' | 'form' | null>(null);
  const [jsonNodeText, setJsonNodeText] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<number | null>(null);
  const [runDetails, setRunDetails] = useState<{
    run?: Run;
    steps: RunStep[];
    conductorExecution?: Record<string, unknown> | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  const loadRuns = async () => {
    const res = await fetch(`/api/workflows/${workflowId}/executions`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setRuns(data || []);
    }
  };

  const loadWorkflow = async () => {
    setLoading(true);
    const res = await fetch(`/api/workflows/${workflowId}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const record = data as WorkflowRecord;
    setWorkflow(record);
    setName(record.name);
    setDescription(record.description);
    setNodes(record.reactFlowJson.nodes as Node<NodeData>[]);
    setEdges(record.reactFlowJson.edges as Edge[]);
    setLoading(false);
  };

  const updateRunPolling = async (runId: number) => {
    const res = await fetch(`/api/executions/${runId}`, { cache: 'no-store' });
    if (!res.ok) {
      return;
    }
    const payload = await res.json();
    setRuns((current) => current.map((r) => (r.id === runId ? { ...r, ...(payload.run || {}) } : r)));
    setRunDetails({
      run: payload.run as Run,
      steps: payload.steps || [],
      conductorExecution: payload.conductorExecution,
    });
  };

  const pollActive = async () => {
    if (!activeRun) {
      return;
    }
    await updateRunPolling(activeRun);
    const active = runs.find((r) => r.id === activeRun);
    if (active && isTerminalStatus(active.status)) {
      setActiveRun(null);
    }
  };

  const loadRunStepsOnly = async (runId: number) => {
    const res = await fetch(`/api/executions/${runId}/logs`, { cache: 'no-store' });
    const payload = await res.json();
    setRunDetails({
      run: payload.execution,
      steps: payload.steps || [],
      conductorExecution: null,
    });
    setActiveRun(runId);
  };

  const onConnect: OnConnect = (connection) => {
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const label =
      sourceNode?.data.type === 'branch'
        ? window.prompt('브랜치 라벨(필수). 예: success, fail, default')
        : undefined;
    const next = {
      ...connection,
      label: label || connection.label,
    } as Edge;
    setEdges((eds) => addEdge(next, eds));
  };

  const addNode = (type: NodeData['type']) => {
    const newNode: Node<NodeData> = {
      id: `${type}-${Date.now()}`,
      type: 'workflowNode',
      position: { x: 120 + Math.random() * 420, y: 100 + nodes.length * 60 },
      data: defaultNodeMeta(type),
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const onDeleteNode = () => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    setNodeTab(null);
  };

  const updateSelectedData = (data: NodeData) => {
    if (!selectedNodeId) {
      return;
    }
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNodeId
          ? {
              ...n,
              data: { ...n.data, ...data },
            }
          : n,
      ),
    );
  };

  const parseNodeJson = () => {
    if (!selectedNode) {
      return;
    }
    try {
      const parsed = JSON.parse(jsonNodeText);
      updateSelectedData(parsed as NodeData);
      setJsonNodeText(JSON.stringify(parsed, null, 2));
      alert('노드 JSON이 반영되었습니다.');
    } catch {
      alert('JSON 형식이 올바르지 않습니다.');
    }
  };

  const handleSave = async () => {
    if (!workflow) return;
    setSaving(true);
    const payload = {
      name,
      description,
      reactFlowJson: {
        nodes: nodes.map((node) => ({ ...node, data: node.data })),
        edges,
      },
    };
    const res = await fetch(`/api/workflows/${workflowId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '저장 실패');
    } else {
      setWorkflow(result);
      alert('저장 완료');
    }
    setSaving(false);
  };

  const handleExecute = async () => {
    if (!workflow) return;
    setExecuting(true);
    const res = await fetch(`/api/workflows/${workflowId}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    });
    const result = await res.json();
    if (!res.ok) {
      alert(result.error || '실행 실패');
      setExecuting(false);
      return;
    }
    setActiveRun(result.id);
    await loadRuns();
    await loadRunStepsOnly(result.id);
    setExecuting(false);
  };

  useEffect(() => {
    loadWorkflow();
    loadRuns();
  }, [workflowId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!activeRun) return;
      pollActive();
      loadRuns();
    }, 2000);
    return () => clearInterval(timer);
  }, [activeRun, runs.length]);

  useEffect(() => {
    if (!selectedNode) {
      setJsonNodeText('');
      return;
    }
    setJsonNodeText(JSON.stringify(selectedNode.data, null, 2));
  }, [selectedNode]);

  const renderFormFields = () => {
    if (!selectedNode) {
      return <p>노드를 선택하면 폼을 편집할 수 있습니다.</p>;
    }
    const data = selectedNode.data;
    const setField = (key: keyof NodeData, value: unknown) => updateSelectedData({ ...data, [key]: value });

    if (data.type === 'ai') {
      return (
        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            라벨
            <input value={data.label || ''} onChange={(e) => setField('label', e.target.value)} />
          </label>
          <label>
            프롬프트
            <textarea
              value={data.prompt || ''}
              onChange={(e) => setField('prompt', e.target.value)}
              rows={5}
            />
          </label>
          <label>
            채널
            <input value={data.channel || ''} onChange={(e) => setField('channel', e.target.value)} />
          </label>
        </div>
      );
    }

    if (data.type === 'teams') {
      return (
        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            라벨
            <input value={data.label || ''} onChange={(e) => setField('label', e.target.value)} />
          </label>
          <label>
            메시지
            <textarea value={data.message || ''} onChange={(e) => setField('message', e.target.value)} rows={5} />
          </label>
          <label>
            채널
            <input value={data.channel || ''} onChange={(e) => setField('channel', e.target.value)} />
          </label>
        </div>
      );
    }

    if (data.type === 'branch') {
      return (
        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            라벨
            <input value={data.label || ''} onChange={(e) => setField('label', e.target.value)} />
          </label>
          <label>
            분기값 변수
            <input
              value={data.switchParam || ''}
              onChange={(e) => setField('switchParam', e.target.value)}
              placeholder="workflow input key"
            />
          </label>
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>
            SWITCH 노드에서 분기는 엣지 라벨 값과 연결됩니다.
          </p>
        </div>
      );
    }

    if (data.type === 'wait') {
      return (
        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            라벨
            <input value={data.label || ''} onChange={(e) => setField('label', e.target.value)} />
          </label>
          <label>
            밀리초
            <input
              type="number"
              value={data.waitMs ?? 1000}
              onChange={(e) => setField('waitMs', Number(e.target.value))}
            />
          </label>
        </div>
      );
    }

    if (data.type === 'terminate') {
      return (
        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            라벨
            <input value={data.label || ''} onChange={(e) => setField('label', e.target.value)} />
          </label>
          <label>
            종료 유형
            <select
              value={data.terminateType || 'SUCCESS'}
              onChange={(e) => setField('terminateType', e.target.value)}
            >
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILURE">FAILURE</option>
              <option value="TERMINATED">TERMINATED</option>
            </select>
          </label>
          <label>
            종료 메시지
            <input value={data.terminateMessage || ''} onChange={(e) => setField('terminateMessage', e.target.value)} />
          </label>
        </div>
      );
    }

    if (data.type === 'script') {
      return (
        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            라벨
            <input value={data.label || ''} onChange={(e) => setField('label', e.target.value)} />
          </label>
          <label>
            스크립트
            <textarea value={data.script || ''} onChange={(e) => setField('script', e.target.value)} rows={6} />
          </label>
        </div>
      );
    }

    return <p>스타트 노드는 폼 편집이 제한됩니다.</p>;
  };

  return (
    <main className="layout">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h1 style={{ margin: '0 0 6px' }}>워크플로우 빌더</h1>
            <div style={{ color: 'var(--muted)' }}>
              ID: {workflowId}{' '}
              <Link href="/workflows" style={{ marginLeft: 12, color: 'var(--accent)' }}>
                목록으로
              </Link>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleExecute} disabled={executing}>
              {executing ? '실행 중...' : 'Run'}
            </button>
            <button onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ marginTop: 20 }}>로딩...</p>
        ) : (
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 12 }}>
            <div className="panel" style={{ height: '78vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{ width: '50%' }}
                    placeholder="워크플로우 이름"
                  />
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{ width: '50%' }}
                    placeholder="설명"
                  />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {nodePalette.map((item) => (
                    <button key={item.type} onClick={() => addNode(item.type)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <ReactFlow
                  nodeTypes={nodeTypes}
                  nodes={nodes as unknown as Node[]}
                  edges={edges}
                  onNodesChange={onNodesChange as OnNodesChange}
                  onEdgesChange={onEdgesChange as OnEdgesChange}
                  onConnect={onConnect as OnConnect}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  onEdgesDelete={() => setSelectedNodeId(null)}
                  fitView
                >
                  <MiniMap pannable zoomable />
                  <Controls />
                  <Background />
                </ReactFlow>
              </div>
            </div>

            <div className="panel" style={{ padding: 12, height: '78vh', overflowY: 'auto' }}>
              <h2>노드 편집기</h2>
              {!selectedNode && <p>노드를 클릭해 선택하세요.</p>}
              {selectedNode && (
                <div>
                  <p>
                    선택 노드: <strong>{selectedNode.id}</strong> ({selectedNode.data.type})
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <button onClick={() => setNodeTab('form')}>폼 편집</button>
                    <button onClick={() => setNodeTab('json')}>JSON 편집</button>
                    <button onClick={onDeleteNode}>삭제</button>
                  </div>
                  {nodeTab === 'json' && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <textarea
                        value={jsonNodeText}
                        onChange={(e) => setJsonNodeText(e.target.value)}
                        rows={10}
                        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
                      />
                      <button onClick={parseNodeJson}>JSON 반영</button>
                    </div>
                  )}
                  {(nodeTab === 'form' || nodeTab === null) && (
                    <div style={{ marginTop: 10 }}>{renderFormFields()}</div>
                  )}
                </div>
              )}

              <hr style={{ borderColor: '#1f2937', margin: '16px 0' }} />
              <h2>실행 / 히스토리</h2>
              <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--muted)' }}>
                최근 상태: {runs[0]?.status || '없음'} / {runs[0]?.conductorWorkflowId || ''}
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {runs.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => loadRunStepsOnly(run.id)}
                    style={{
                      textAlign: 'left',
                      background: run.id === activeRun ? '#111827' : '#0b1220',
                    }}
                  >
                    #{run.id} | {run.status} | {new Date(run.startedAt).toLocaleString()}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 10 }}>
                <h3>선택 실행 로그</h3>
                {!runDetails && <p>실행을 선택하세요.</p>}
                {runDetails && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Conductor 실행 ID: {runDetails.run?.conductorWorkflowId}
                    </div>
                    <pre style={{ fontSize: 11, padding: 8, background: '#0b1220', overflow: 'auto' }}>
                      {JSON.stringify(runDetails.conductorExecution || runDetails.run, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12 }}>
                {runDetails?.steps?.map((step) => (
                  <div key={step.id} className="panel" style={{ padding: 8, marginBottom: 8 }}>
                    <div style={{ fontWeight: 700 }}>{step.taskRefName || step.conductorTaskId || step.id}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{step.taskType || '-'} / {step.status || '-'}</div>
                    <pre style={{ fontSize: 11, marginTop: 6 }}>{JSON.stringify(step.output || step.input, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
