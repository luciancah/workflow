'use client';

import { type MouseEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ReactFlow,
  addEdge,
  Background,
  BaseEdge,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  type EdgeProps,
  EdgeText,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type OnConnect,
  Handle,
  Position,
  type NodeTypes,
  getBezierPath,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { WorkflowRecord } from '@/lib/types';
import type { NodeData } from '@/lib/types';

type RunStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'TERMINATED'
  | 'FAILED_WITH_TERMINAL_ERROR'
  | 'CANCELED'
  | 'CANCELLED'
  | string;

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

type ViewTab = 'properties' | 'code' | 'runs';

const terminalStatuses = new Set([
  'COMPLETED',
  'FAILED',
  'TERMINATED',
  'FAILED_WITH_TERMINAL_ERROR',
  'CANCELED',
  'CANCELLED',
]);

const paletteItems: Array<{
  type: NodeData['type'];
  label: string;
  description: string;
  icon: string;
}> = [
  { type: 'start', label: 'Start', description: '워크플로우 시작점', icon: '◉' },
  { type: 'ai', label: 'AI', description: 'ai_mock SIMPLE 태스크', icon: 'AI' },
  { type: 'teams', label: 'Teams', description: 'teams_mock SIMPLE 태스크', icon: 'MS' },
  { type: 'branch', label: 'Branch', description: '분기(SWITCH)', icon: '⤵' },
  { type: 'wait', label: 'Wait', description: 'WAIT', icon: '⌛' },
  { type: 'terminate', label: 'Terminate', description: 'TERMINATE', icon: '■' },
  { type: 'script', label: 'Script', description: 'INLINE', icon: '⎘' },
  { type: 'fork', label: 'Fork', description: 'FORK', icon: '⎘' },
  { type: 'join', label: 'Join', description: 'JOIN', icon: '⎙' },
];

const defaultNodeMeta = (type: NodeData['type']): NodeData => {
  switch (type) {
    case 'start':
      return { type: 'start', label: 'Start' };
    case 'ai':
      return {
        type: 'ai',
        label: 'AI',
        prompt: '프롬프트를 입력하세요',
        channel: 'default',
        retryCount: 3,
        retryDelaySeconds: 60,
      };
    case 'teams':
      return {
        type: 'teams',
        label: 'Teams',
        message: '메시지 템플릿',
        channel: 'default',
        retryCount: 3,
        retryDelaySeconds: 60,
      };
    case 'branch':
      return { type: 'branch', label: 'Branch', switchParam: 'branchValue' };
    case 'wait':
      return { type: 'wait', label: 'Wait', waitMs: 1000 };
    case 'terminate':
      return {
        type: 'terminate',
        label: 'Terminate',
        terminateType: 'SUCCESS',
        terminateMessage: 'Terminate',
      };
    case 'script':
      return {
        type: 'script',
        label: 'Script',
        script: 'return { ok: true };',
      };
    case 'fork':
      return { type: 'fork', label: 'Fork' };
    case 'join':
      return { type: 'join', label: 'Join' };
    default:
      return { type: 'start', label: 'Node' };
  }
};

const paletteColor = (
  type: NodeData['type'],
): { accent: string; badge: string } => {
  switch (type) {
    case 'start':
      return { accent: '#22d3ee', badge: '#0284c7' };
    case 'ai':
      return { accent: '#38bdf8', badge: '#0ea5e9' };
    case 'teams':
      return { accent: '#c084fc', badge: '#8b5cf6' };
    case 'branch':
      return { accent: '#fbbf24', badge: '#f59e0b' };
    case 'wait':
      return { accent: '#2dd4bf', badge: '#14b8a6' };
    case 'terminate':
      return { accent: '#fb7185', badge: '#ef4444' };
    case 'script':
      return { accent: '#4ade80', badge: '#22c55e' };
    case 'fork':
      return { accent: '#f472b6', badge: '#ec4899' };
    case 'join':
      return { accent: '#d8b4fe', badge: '#a855f7' };
    default:
      return { accent: '#64748b', badge: '#475569' };
  }
};

type WorkflowNodeType = 'workflowNode';
type WorkflowNodeShape = Node<NodeData, WorkflowNodeType>;

function WorkflowNode({ data, selected }: NodeProps<WorkflowNodeShape>) {
  const { accent } = paletteColor(data.type);
  return (
    <div className={`wf-node-card${selected ? ' wf-node-selected' : ''}`} style={{ borderLeftColor: accent }}>
      <Handle id="left" type="target" position={Position.Left} />
      <Handle id="right" type="source" position={Position.Right} />
      <div className="wf-node-card__head">
        <div className="wf-node-card__title">
          {paletteItems.find((item) => item.type === data.type)?.label || 'Node'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{data.label || 'unnamed'}</div>
      </div>
      <div className="wf-node-card__body">
        <div className="wf-node-card__desc">{data.type === 'ai' ? (data.prompt || '-') : data.type === 'teams' ? (data.message || '-') : data.type === 'wait' ? `${data.waitMs || 1000}ms` : data.type === 'branch' ? `switch: ${data.switchParam || 'branchValue'}` : data.type === 'terminate' ? `${data.terminateType || 'SUCCESS'}` : data.type === 'script' ? 'script task' : '-'}</div>
      </div>
      <span className={`wf-node-status`} style={{ background: data.type === 'start' ? 'transparent' : 'var(--card)' }}>
        {data.type === 'start' ? 'S' : data.type.toUpperCase().slice(0, 2)}
      </span>
    </div>
  );
}

function workflowNodeLabelClassName(type: NodeData['type']) {
  return `wf-node-${type}`;
}

function AnimatedWorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label,
  selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: selected ? 'var(--primary)' : 'var(--muted-foreground)',
          strokeWidth: 1.8,
          strokeDasharray: '5 6',
        }}
      />
      {label ? (
        <EdgeText
          x={labelX}
          y={labelY - 8}
          label={label}
          labelStyle={{ fill: 'var(--foreground)', fontSize: 11 }}
          labelBgStyle={{ fill: 'var(--popover)', fillOpacity: 0.8 }}
          labelBgPadding={[4, 6]}
          labelBgBorderRadius={4}
        />
      ) : null}
    </>
  );
}

function formatDate(value: string | undefined | null) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' });
}

function hasValidWorkflowShape(value: unknown): value is { nodes: unknown[]; edges: unknown[] } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { nodes?: unknown; edges?: unknown };
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
}

function sanitizeWorkflowGraph(raw: unknown): {
  nodes: WorkflowNodeShape[];
  edges: Edge[];
} {
  if (!hasValidWorkflowShape(raw)) {
    return { nodes: [], edges: [] };
  }

  const nodes = raw.nodes
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const node = item as {
        id?: unknown;
        type?: unknown;
        position?: unknown;
        data?: unknown;
      };
      if (typeof node.id !== 'string') return null;
      const data = node.data as NodeData;
      if (!data || typeof data.type !== 'string') return null;
      if (!paletteItems.some((p) => p.type === data.type)) return null;
      const position = (node.position || {}) as { x?: number; y?: number };

      return {
        id: node.id,
        type: 'workflowNode' as const,
        position: {
          x: typeof position.x === 'number' ? position.x : 80,
          y: typeof position.y === 'number' ? position.y : 80,
        },
        data: {
          ...defaultNodeMeta(data.type),
          ...(data || {}),
        },
      } satisfies WorkflowNodeShape;
    })
    .filter(Boolean) as WorkflowNodeShape[];

  const edges = raw.edges
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const edge = item as {
        id?: string;
        source?: unknown;
        target?: unknown;
        label?: unknown;
      };
      if (typeof edge.source !== 'string' || typeof edge.target !== 'string') return null;
      return {
        id: typeof edge.id === 'string' ? edge.id : `e-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        source: edge.source,
        target: edge.target,
        label: typeof edge.label === 'string' ? edge.label : undefined,
        type: 'wf-edge',
      } satisfies Edge;
    })
    .filter(Boolean) as Edge[];

  return {
    nodes,
    edges,
  };
}

export default function WorkflowBuilderPage({ workflowId }: { workflowId: number }) {
  const [loading, setLoading] = useState(true);
  const [workflow, setWorkflow] = useState<WorkflowRecord | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeShape>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>('properties');
  const [graphJson, setGraphJson] = useState('{\n  "nodes": [],\n  "edges": []\n}');
  const [graphApplyError, setGraphApplyError] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<number | null>(null);
  const [runDetails, setRunDetails] = useState<{
    run?: Run;
    steps: RunStep[];
    conductorExecution?: Record<string, unknown> | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    type: 'canvas' | 'node' | 'edge';
    x: number;
    y: number;
    id?: string;
  } | null>(null);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  const nodePaletteByType = useMemo(
    () => paletteItems,
    [],
  );

  const nodeTypes: NodeTypes = {
    workflowNode: WorkflowNode,
  };

  const edgeTypes: EdgeTypes = {
    'wf-edge': AnimatedWorkflowEdge,
  };

  const syncCodeFromCanvas = (nextNodes: WorkflowNodeShape[], nextEdges: Edge[]) => {
    const payload = {
      nodes: nextNodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
      })),
      edges: nextEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
      })),
    };
    setGraphJson(JSON.stringify(payload, null, 2));
  };

  const loadRuns = async () => {
    const res = await fetch(`/api/workflows/${workflowId}/executions`, { cache: 'no-store' });
    if (!res.ok) {
      return;
    }
    const data = await res.json();
    setRuns(Array.isArray(data) ? data : []);
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
    const { nodes: nextNodes, edges: nextEdges } = sanitizeWorkflowGraph(record.reactFlowJson);

    setWorkflow(record);
    setName(record.name);
    setDescription(record.description);
    setNodes(nextNodes);
    setEdges(nextEdges);
    syncCodeFromCanvas(nextNodes, nextEdges);
    setGraphApplyError('');
    setLoading(false);
  };

  const addNode = (type: NodeData['type']) => {
    const nextIndex = nodes.length + 1;
    const node: WorkflowNodeShape = {
      id: `${type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: 'workflowNode',
      position: {
        x: 120 + nextIndex * 160,
        y: 120 + (nextIndex % 8) * 72,
      },
      data: defaultNodeMeta(type),
    };
    const nextNodes = [...nodes, node];
    setNodes(nextNodes);
    syncCodeFromCanvas(nextNodes, edges);
    setSelectedNodeId(node.id);
    setActiveTab('properties');
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    const nextNodes = nodes.filter((node) => node.id !== selectedNodeId);
    const nextEdges = edges.filter(
      (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId,
    );
    setNodes(nextNodes);
    setEdges(nextEdges);
    syncCodeFromCanvas(nextNodes, nextEdges);
    setSelectedNodeId(null);
  };

  const deleteEdge = (edgeId?: string) => {
    if (!edgeId) return;
    const nextEdges = edges.filter((edge) => edge.id !== edgeId);
    setEdges(nextEdges);
    syncCodeFromCanvas(nodes, nextEdges);
    setContextMenu(null);
  };

  const updateSelectedData = (data: NodeData) => {
    if (!selectedNodeId) return;
    const nextNodes = nodes.map((node) =>
      node.id === selectedNodeId ? { ...node, data: { ...node.data, ...data } } : node,
    );
    setNodes(nextNodes);
    syncCodeFromCanvas(nextNodes, edges);
  };

  const onNodeContextMenu = (event: MouseEvent, node: WorkflowNodeShape) => {
    event.preventDefault();
    setSelectedNodeId(node.id);
    setContextMenu({
      type: 'node',
      id: node.id,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const onPaneContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    setSelectedNodeId(null);
    setContextMenu({
      type: 'canvas',
      x: event.clientX,
      y: event.clientY,
    });
  };

  const onEdgeContextMenu = (event: MouseEvent, edge: Edge) => {
    event.preventDefault();
    setContextMenu({
      type: 'edge',
      id: edge.id,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const onConnect: OnConnect = (connection: Connection) => {
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const requireLabel = sourceNode?.data?.type === 'branch';

    if (requireLabel) {
      const label = window.prompt('브랜치 라벨을 입력하세요. 예: success / fail / default');
      if (!label || !label.trim()) {
        return;
      }
      connection = { ...connection, label: label.trim() } as Connection & { label: string };
    }

    const next = {
      ...connection,
      type: 'wf-edge',
      id: `e-${Date.now()}`,
      markerEnd: { type: 'arrow' },
    } as Edge;

    setEdges((current) => {
      const nextEdges = addEdge(next, current);
      syncCodeFromCanvas(nodes, nextEdges);
      return nextEdges;
    });
  };

  const loadRunDetails = async (runId: number) => {
    const res = await fetch(`/api/executions/${runId}`, { cache: 'no-store' });
    if (!res.ok) {
      return;
    }
    const payload = await res.json();
    setRunDetails({
      run: payload.run as Run,
      steps: payload.steps || [],
      conductorExecution: payload.conductorExecution || null,
    });
    setActiveRun(runId);
  };

  const updateRunPolling = async () => {
    if (!activeRun) return;
    await loadRunDetails(activeRun);
    await loadRuns();
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
    await loadRunDetails(result.id);
    setExecuting(false);
  };

  const applyGraphFromCode = () => {
    try {
      const parsed = JSON.parse(graphJson);
      if (!hasValidWorkflowShape(parsed)) {
        setGraphApplyError('nodes/edges 구조가 올바르지 않습니다.');
        return;
      }
      const next = sanitizeWorkflowGraph(parsed);
      setNodes(next.nodes);
      setEdges(next.edges);
      syncCodeFromCanvas(next.nodes, next.edges);
      setGraphApplyError('');
      alert('JSON 반영 완료');
    } catch {
      setGraphApplyError('JSON 형식이 유효하지 않습니다.');
    }
  };

  const renderNodeFields = () => {
    if (!selectedNode) {
      return <p className="wf-muted">노드를 클릭해서 노드 속성을 편집하세요.</p>;
    }

    const data = selectedNode.data;
    const updateField = (key: keyof NodeData, value: unknown) => {
      updateSelectedData({ ...data, [key]: value } as NodeData);
    };

    if (data.type === 'start') {
      return <p className="wf-muted">Start 노드는 라벨만 편집 가능합니다.</p>;
    }

    if (data.type === 'ai') {
      return (
        <div className="wf-grid">
          <label className="wf-field">
            <span>라벨</span>
            <input value={data.label || ''} onChange={(event) => updateField('label', event.target.value)} />
          </label>
          <label className="wf-field">
            <span>프롬프트</span>
            <textarea rows={5} value={data.prompt || ''} onChange={(event) => updateField('prompt', event.target.value)} />
          </label>
          <label className="wf-field">
            <span>채널</span>
            <input value={data.channel || ''} onChange={(event) => updateField('channel', event.target.value)} />
          </label>
          <label className="wf-field">
            <span>재시도 횟수</span>
            <input type="number" value={data.retryCount ?? 3} onChange={(event) => updateField('retryCount', Number(event.target.value))} />
          </label>
          <label className="wf-field">
            <span>재시도 간격(초)</span>
            <input type="number" value={data.retryDelaySeconds ?? 60} onChange={(event) => updateField('retryDelaySeconds', Number(event.target.value))} />
          </label>
        </div>
      );
    }

    if (data.type === 'teams') {
      return (
        <div className="wf-grid">
          <label className="wf-field">
            <span>라벨</span>
            <input value={data.label || ''} onChange={(event) => updateField('label', event.target.value)} />
          </label>
          <label className="wf-field">
            <span>메시지</span>
            <textarea rows={5} value={data.message || ''} onChange={(event) => updateField('message', event.target.value)} />
          </label>
          <label className="wf-field">
            <span>채널</span>
            <input value={data.channel || ''} onChange={(event) => updateField('channel', event.target.value)} />
          </label>
          <label className="wf-field">
            <span>재시도 횟수</span>
            <input type="number" value={data.retryCount ?? 3} onChange={(event) => updateField('retryCount', Number(event.target.value))} />
          </label>
          <label className="wf-field">
            <span>재시도 간격(초)</span>
            <input type="number" value={data.retryDelaySeconds ?? 60} onChange={(event) => updateField('retryDelaySeconds', Number(event.target.value))} />
          </label>
        </div>
      );
    }

    if (data.type === 'branch') {
      return (
        <div className="wf-grid">
          <label className="wf-field">
            <span>라벨</span>
            <input value={data.label || ''} onChange={(event) => updateField('label', event.target.value)} />
          </label>
          <label className="wf-field">
            <span>분기 변수</span>
            <input value={data.switchParam || ''} onChange={(event) => updateField('switchParam', event.target.value)} placeholder="workflow input key" />
          </label>
          <p className="wf-muted">분기 노드 연결은 라벨이 필수입니다.</p>
        </div>
      );
    }

    if (data.type === 'wait') {
      return (
        <div className="wf-grid">
          <label className="wf-field">
            <span>라벨</span>
            <input value={data.label || ''} onChange={(event) => updateField('label', event.target.value)} />
          </label>
          <label className="wf-field">
            <span>밀리초</span>
            <input type="number" value={data.waitMs ?? 1000} onChange={(event) => updateField('waitMs', Number(event.target.value))} />
          </label>
        </div>
      );
    }

    if (data.type === 'terminate') {
      return (
        <div className="wf-grid">
          <label className="wf-field">
            <span>라벨</span>
            <input value={data.label || ''} onChange={(event) => updateField('label', event.target.value)} />
          </label>
          <label className="wf-field">
            <span>종료 유형</span>
            <select value={data.terminateType || 'SUCCESS'} onChange={(event) => updateField('terminateType', event.target.value)}>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILURE">FAILURE</option>
              <option value="TERMINATED">TERMINATED</option>
            </select>
          </label>
          <label className="wf-field">
            <span>종료 메시지</span>
            <textarea rows={2} value={data.terminateMessage || ''} onChange={(event) => updateField('terminateMessage', event.target.value)} />
          </label>
        </div>
      );
    }

    return (
      <div className="wf-grid">
        <label className="wf-field">
          <span>라벨</span>
          <input value={data.label || ''} onChange={(event) => updateField('label', event.target.value)} />
        </label>
        <label className="wf-field">
          <span>스크립트</span>
          <textarea rows={4} value={data.script || ''} onChange={(event) => updateField('script', event.target.value)} />
        </label>
      </div>
    );
  };

  const runStatusLabel = useMemo(() => {
    const latest = runs[0];
    if (!latest) return 'No runs';
    return `${latest.status} / ${latest.id}`;
  }, [runs]);

  useEffect(() => {
    loadWorkflow();
    loadRuns();
  }, [workflowId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!activeRun) return;
      void updateRunPolling();
    }, 2500);
    return () => clearInterval(timer);
  }, [activeRun]);

  useEffect(() => {
    if (!nodes.length && !edges.length) return;
    syncCodeFromCanvas(nodes, edges);
  }, [nodes, edges]);

  useEffect(() => {
    if (!activeRun) {
      return;
    }
    const latest = runs.find((run) => run.id === activeRun);
    if (!latest || terminalStatuses.has(latest.status)) {
      return;
    }
    const timeout = setInterval(() => {
      void updateRunPolling();
    }, 2000);
    return () => clearInterval(timeout);
  }, [activeRun, runs]);

  return (
    <main className="wf-shell">
      <div className="wf-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong>Workflow Builder</strong>
          <Link href="/workflows/list">목록</Link>
          <span className="wf-muted">ID {workflowId}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="wf-btn" onClick={handleExecute} disabled={executing || saving}>
            {executing ? 'Running...' : 'Run'}
          </button>
          <button className="wf-btn primary" onClick={handleSave} disabled={saving || executing}>
            {saving ? '저장 중...' : 'Save'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="wf-layout" style={{ padding: 20 }}>
          로딩 중...
        </div>
      ) : (
        <section className="wf-main">
          <div className="wf-canvas-wrap">
            <div className="wf-canvas-shell">
              <div className="wf-meta-edit">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="워크플로우 이름"
                  className="wf-input"
                />
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="설명"
                  rows={2}
                  className="wf-input"
                />
              </div>
              <div className="wf-canvas-toolbar">
                {nodePaletteByType.map((item) => (
                  <button
                    key={item.type}
                    className="wf-palette-button"
                    onClick={() => addNode(item.type)}
                    style={{
                      borderColor: paletteColor(item.type).badge,
                    }}
                  >
                    <strong>{item.icon}</strong>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
              <div className="wf-canvas">
                <ReactFlow<WorkflowNodeShape, Edge>
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  onNodeContextMenu={(event, node) => onNodeContextMenu(event as MouseEvent, node as WorkflowNodeShape)}
                  onEdgeContextMenu={(event, edge) => onEdgeContextMenu(event as MouseEvent, edge as Edge)}
                  onPaneContextMenu={(event) => onPaneContextMenu(event as MouseEvent)}
                  defaultEdgeOptions={{
                    type: 'wf-edge',
                  }}
                  onSelectionDragStart={() => setContextMenu(null)}
                  fitView
                  fitViewOptions={{ padding: 0.3 }}
                  style={{ background: 'transparent' }}
                  nodesDraggable
                  panOnDrag
                  panOnScroll
                  zoomOnScroll
                >
                  <MiniMap nodeStrokeWidth={3} pannable zoomable />
                  <Controls />
                  <Background gap={24} size={2} />
                </ReactFlow>
              </div>
              {contextMenu ? (
                <div
                  className="wf-context-menu"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                  onMouseLeave={() => setContextMenu(null)}
                >
                  {contextMenu.type === 'node' ? (
                    <>
                      <button onClick={() => setActiveTab('properties')}>속성 탭으로</button>
                      <button onClick={() => deleteSelectedNode()}>노드 삭제</button>
                      <button onClick={() => setContextMenu(null)}>닫기</button>
                    </>
                  ) : null}
                  {contextMenu.type === 'edge' ? (
                    <>
                      <button onClick={() => deleteEdge(contextMenu.id)}>간선 삭제</button>
                      <button onClick={() => setContextMenu(null)}>닫기</button>
                    </>
                  ) : null}
                  {contextMenu.type === 'canvas' ? (
                    <>
                      <button
                        onClick={() => {
                          setContextMenu(null);
                          setActiveTab('code');
                        }}
                      >
                        코드 탭으로 이동
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="wf-right">
            <div className="wf-tabs">
              <button
                className={activeTab === 'properties' ? 'wf-tab active' : 'wf-tab'}
                onClick={() => setActiveTab('properties')}
              >
                Properties
              </button>
              <button
                className={activeTab === 'code' ? 'wf-tab active' : 'wf-tab'}
                onClick={() => setActiveTab('code')}
              >
                Code
              </button>
              <button
                className={activeTab === 'runs' ? 'wf-tab active' : 'wf-tab'}
                onClick={() => setActiveTab('runs')}
              >
                Runs
              </button>
            </div>

            <div className="wf-panel-body">
              {activeTab === 'properties' ? (
                <div className="wf-grid">
                  <h3 className="wf-section-title">Node Configuration</h3>
                  <div className="wf-field">
                    <span>최근 실행 상태</span>
                    <div className="wf-muted">{runStatusLabel}</div>
                  </div>
                  <div className="wf-field">
                    <span>선택 노드</span>
                    <div className={workflowNodeLabelClassName(selectedNode?.data.type || 'start')}>
                      {selectedNode ? `${selectedNode.id} (${selectedNode.data.type})` : '선택 없음'}
                    </div>
                  </div>
                  {renderNodeFields()}
                  {selectedNode?.data.type === 'start' ? <p className="wf-muted">Start 노드는 삭제할 수 없습니다.</p> : null}
                </div>
              ) : null}

              {activeTab === 'code' ? (
                <div className="wf-grid">
                  <h3 className="wf-section-title">Workflow Graph JSON</h3>
                  <textarea
                    className="wf-code wf-textarea"
                    rows={18}
                    value={graphJson}
                    onChange={(event) => setGraphJson(event.target.value)}
                    placeholder="reactFlow json"
                  />
                  {graphApplyError ? <p className="wf-muted" style={{ color: '#ef4444' }}>{graphApplyError}</p> : null}
                  <button className="wf-btn primary" onClick={applyGraphFromCode}>
                    JSON 반영
                  </button>
                  <p className="wf-muted" style={{ fontSize: 12 }}>
                    노드/엣지 구조를 바꾼 뒤에는 저장 버튼을 눌러 Conductor 동기화를 갱신해야 실행 가능합니다.
                  </p>
                </div>
              ) : null}

              {activeTab === 'runs' ? (
                <div className="wf-grid">
                  <h3 className="wf-section-title">Executions</h3>
                  <div className="wf-grid" style={{ gap: 6 }}>
                    {runs.map((run) => (
                      <button
                        key={run.id}
                        className={run.id === activeRun ? 'wf-run-item active' : 'wf-run-item'}
                        onClick={() => loadRunDetails(run.id)}
                      >
                        <strong>#{run.id}</strong>
                        <div className="wf-muted" style={{ marginTop: 2 }}>
                          {run.status} · {formatDate(run.startedAt)}
                        </div>
                      </button>
                    ))}
                    {!runs.length ? <p className="wf-muted">실행 이력이 없습니다.</p> : null}
                  </div>

                  {runDetails ? (
                    <div className="wf-grid">
                      <h4 className="wf-section-title" style={{ marginTop: 8 }}>Selected Run</h4>
                      <div className="wf-muted">Conductor Run ID: {runDetails.run?.conductorWorkflowId}</div>
                      <pre className="wf-code">
                        {JSON.stringify(runDetails.conductorExecution || runDetails.run || {}, null, 2)}
                      </pre>
                      <div className="wf-grid" style={{ marginTop: 6 }}>
                        {runDetails.steps.length ? (
                          runDetails.steps.map((step) => (
                            <div key={step.id} className="wf-run-item">
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{step.taskRefName || step.conductorTaskId || step.id}</span>
                                <span>{step.status || '-'}</span>
                              </div>
                              <div className="wf-muted" style={{ fontSize: 12 }}>
                                {step.taskType || '-'} / {formatDate(step.startedAt)} → {formatDate(step.endedAt)}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="wf-muted">실행 상세 로그가 아직 없습니다.</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
