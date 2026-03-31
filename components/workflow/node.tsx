'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { CSSProperties } from 'react';
import type { NodeData } from '@/lib/types';

type WorkflowNodeShape = Node<NodeData, 'workflowNode'>;

const NODE_CONFIG: Record<
  NodeData['type'],
  { icon: string; tone: string; description: string }
> = {
  start: { icon: '◉', tone: '#22d3ee', description: 'Workflow trigger' },
  ai: { icon: 'AI', tone: '#38bdf8', description: 'AI assistant mock' },
  teams: { icon: 'MS', tone: '#c084fc', description: 'Teams 메시지 mock' },
  branch: { icon: '⤵', tone: '#fbbf24', description: 'Switch branch 조건' },
  wait: { icon: '⌛', tone: '#2dd4bf', description: 'Delay' },
  terminate: { icon: '■', tone: '#fb7185', description: 'Workflow 종료' },
  script: { icon: '⚙', tone: '#4ade80', description: 'Data transform' },
  fork: { icon: '↖', tone: '#f472b6', description: '병렬 실행 분기' },
  join: { icon: '↘', tone: '#d8b4fe', description: '병렬 병합' },
};

const labelFromType = (type: NodeData['type']) => {
  switch (type) {
    case 'start':
      return 'Start';
    case 'ai':
      return 'AI';
    case 'teams':
      return 'Teams';
    case 'branch':
      return 'Branch';
    case 'wait':
      return 'Wait';
    case 'terminate':
      return 'Terminate';
    case 'script':
      return 'Script';
    case 'fork':
      return 'Fork';
    case 'join':
      return 'Join';
    default:
      return 'Node';
  }
};

const formatNodeSummary = (data: NodeData) => {
  switch (data.type) {
    case 'ai':
      return data.prompt || 'AI prompt';
    case 'teams':
      return data.message || 'Teams message';
    case 'wait':
      return `${data.waitMs ?? 1000} ms`;
    case 'branch':
      return `switch: ${data.switchParam || 'branchValue'}`;
    case 'terminate':
      return data.terminateType || 'SUCCESS';
    case 'script':
      return data.script ? 'script task' : 'edit script';
    default:
      return data.label || 'Node';
  }
};

export const WorkflowNode = ({ data, selected }: NodeProps<WorkflowNodeShape>) => {
  const config = NODE_CONFIG[data.type];
  const title = data.label || labelFromType(data.type);
  const summary = formatNodeSummary(data);
  const hasTarget = data.type !== 'start';
  const canSource = data.type !== 'join';

  return (
    <div
      className={`wf-node-card wf-node-card--${data.type} ${selected ? 'wf-node-card--selected' : ''}`}
      style={{ '--wf-node-tone': config?.tone } as CSSProperties}
    >
      {hasTarget ? <Handle id="left" type="target" position={Position.Left} /> : null}
      {canSource ? <Handle id="right" type="source" position={Position.Right} /> : null}

      <div className="wf-node-card__badge">{config?.icon}</div>
      <div className="wf-node-card__head">
        <div className="wf-node-card__label">{title}</div>
        <div className="wf-node-card__desc">
          {config?.description ?? 'node'}
        </div>
      </div>
      <div className="wf-node-card__summary">{summary}</div>
    </div>
  );
};
