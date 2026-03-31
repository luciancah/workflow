export type NodeType =
  | 'start'
  | 'ai'
  | 'teams'
  | 'branch'
  | 'wait'
  | 'terminate'
  | 'script'
  | 'fork'
  | 'join';

export interface NodeData extends Record<string, unknown> {
  type: NodeType;
  label?: string;
  prompt?: string;
  message?: string;
  channel?: string;
  switchParam?: string;
  waitMs?: number;
  retryCount?: number;
  retryDelaySeconds?: number;
  terminateType?: 'SUCCESS' | 'FAILURE' | 'TERMINATED';
  terminateMessage?: string;
  script?: string;
}

export interface ReactFlowNodeShape {
  id: string;
  type: 'workflowNode';
  position: { x: number; y: number };
  data: NodeData;
}

export interface ReactFlowEdgeShape {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ReactFlowGraph {
  nodes: ReactFlowNodeShape[];
  edges: ReactFlowEdgeShape[];
}

export interface ConductorTask {
  name: string;
  taskReferenceName: string;
  type: 'SIMPLE' | 'SWITCH' | 'WAIT' | 'TERMINATE' | 'INLINE' | 'FORK' | 'JOIN';
  retryCount?: number;
  retryDelaySeconds?: number;
  responseTimeoutSeconds?: number;
  timeoutPolicy?: 'TIME_OUT_WF' | 'ALERT_ONLY';
  inputParameters?: Record<string, unknown>;
  caseExpression?: string;
  decisionCases?: Record<string, ConductorTask[]>;
  defaultCase?: ConductorTask[];
  workflowTask?: {
    name: string;
    taskReferenceName: string;
  }[];
  forkTasks?: ConductorTask[][];
  joinOn?: string[];
  evaluatorType?: string;
}

export interface WorkflowRecord {
  id: number;
  name: string;
  description: string;
  reactFlowJson: ReactFlowGraph;
  conductorCompiledJson: Record<string, unknown>;
  conductorName: string;
  version: number;
  updatedAt: string;
}
