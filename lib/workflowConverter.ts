import type {
  ConductorTask,
  NodeData,
  ReactFlowEdgeShape,
  ReactFlowGraph,
  ReactFlowNodeShape,
} from './types';

export interface ConversionResult {
  workflowName: string;
  workflowVersion: number;
  description: string;
  tasks: ConductorTask[];
  taskCount: number;
}

function normalizeFlowValue(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

export class FlowConversionError extends Error {}

function isBranchLabelMissing(label: unknown): boolean {
  return typeof label !== 'string' || label.trim().length === 0;
}

function nodeLabel(node: ReactFlowNodeShape): string {
  return node.data?.label || node.data?.type || node.id;
}

function toConductorInputNode(taskId: string, taskType: 'ai_mock' | 'teams_mock' | 'script_mock' | 'transform_mock' | 'http_mock', data: NodeData) {
  return {
    name: `${taskId}_task`,
    taskReferenceName: taskId,
    type: 'SIMPLE',
    inputParameters: {
      mockType: taskType,
      sourceNode: nodeLabel({
        id: taskId,
        type: 'workflowNode',
        position: { x: 0, y: 0 },
        data,
      } as ReactFlowNodeShape),
      ...(data.prompt ? { prompt: data.prompt } : {}),
      ...(data.message ? { message: data.message } : {}),
      ...(data.channel ? { channel: data.channel } : {}),
      ...(data.script ? { script: data.script } : {}),
    },
  } satisfies ConductorTask;
}

function toTask(node: ReactFlowNodeShape): ConductorTask {
  const id = node.id;
  const data = node.data || {};

  if (node.data.type === 'ai') {
    return toConductorInputNode(id, 'ai_mock', data);
  }

  if (node.data.type === 'teams') {
    return toConductorInputNode(id, 'teams_mock', data);
  }

  if (node.data.type === 'script') {
    return {
      name: `${id}_script`,
      taskReferenceName: id,
      type: 'INLINE',
      inputParameters: {
        script: data.script || 'return {};',
        language: 'javascript',
      },
    };
  }

  if (node.data.type === 'wait') {
    return {
      name: `${id}_wait`,
      taskReferenceName: id,
      type: 'WAIT',
      inputParameters: {
        value: data.waitMs ?? 1000,
      },
    };
  }

  if (node.data.type === 'terminate') {
    return {
      name: `${id}_terminate`,
      taskReferenceName: id,
      type: 'TERMINATE',
      inputParameters: {
        terminationType: data.terminateType || 'SUCCESS',
        terminationMessage: data.terminateMessage || `${nodeLabel(node)} terminated`,
      },
    };
  }

  if (node.data.type === 'fork' || node.data.type === 'join') {
    if (node.data.type === 'fork') {
      return {
        name: `${id}_fork`,
        taskReferenceName: id,
        type: 'FORK',
        inputParameters: {
          taskType: 'FORK',
        },
        forkTasks: [],
      };
    }

    return {
      name: `${id}_join`,
      taskReferenceName: id,
      type: 'JOIN',
      inputParameters: {
        taskType: 'JOIN',
      },
      joinOn: [],
    };
  }

  throw new FlowConversionError(`Unsupported node type: ${node.data.type}`);
}

function buildGraphIndex(graph: ReactFlowGraph) {
  const nodeMap = new Map<string, ReactFlowNodeShape>();
  const outMap = new Map<string, ReactFlowEdgeShape[]>();
  const inMap = new Map<string, ReactFlowEdgeShape[]>();

  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
    outMap.set(node.id, []);
    inMap.set(node.id, []);
  }

  for (const edge of graph.edges) {
    if (!outMap.has(edge.source) || !nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      continue;
    }
    outMap.get(edge.source)!.push(edge);
    inMap.get(edge.target)!.push(edge);
  }

  return { nodeMap, outMap, inMap };
}

function flattenLinear(
  startId: string,
  nodeMap: Map<string, ReactFlowNodeShape>,
  outMap: Map<string, ReactFlowEdgeShape[]>,
) {
  const tasks: ConductorTask[] = [];
  let current = startId;
  const path = new Set<string>();

  while (true) {
    if (path.has(current)) {
      throw new FlowConversionError('Loop detected in workflow graph.');
    }
    path.add(current);
    const node = nodeMap.get(current);
    if (!node) {
      break;
    }

    const outgoing = outMap.get(current) || [];

    if (node.data.type !== 'start') {
      if (node.data.type === 'branch') {
        const decisionCases: Record<string, ConductorTask[]> = {};
        for (const edge of outgoing) {
          const label = normalizeFlowValue(edge.label);
          if (isBranchLabelMissing(label)) {
            throw new FlowConversionError(`Branch node ${current} requires label on every outgoing edge.`);
          }
          const childTasks = flattenLinear(edge.target, nodeMap, outMap);
          decisionCases[label] = childTasks;
        }

        tasks.push({
          name: `${current}_switch`,
          taskReferenceName: current,
          type: 'SWITCH',
          evaluatorType: 'value-param',
          caseExpression: '${workflow.input.' + (node.data.switchParam || 'branchValue') + '}',
          decisionCases,
          defaultCase: [],
        });
      } else {
        if (node.data.type !== 'start') {
          tasks.push(toTask(node));
        }

        if (outgoing.length > 1) {
          throw new FlowConversionError(`Node ${current} (${node.data.type}) has more than one outgoing edge. Use branch node for divergence.`);
        }
      }
    }

    if (outgoing.length === 0) {
      break;
    }

    if (node.data.type === 'branch') {
      break;
    }

    const [nextEdge] = outgoing;
    current = nextEdge.target;
  }

  return tasks;
}

export function compileFlowToConductor(
  graph: ReactFlowGraph,
  workflowName: string,
  description = '',
  workflowVersion = 1,
): ConversionResult {
  const { nodeMap, outMap, inMap } = buildGraphIndex(graph);
  const startNodes = graph.nodes.filter((node) => node.data.type === 'start');

  if (startNodes.length !== 1) {
    throw new FlowConversionError('Workflow must include exactly one start node.');
  }

  const startId = startNodes[0].id;
  const startOutgoing = outMap.get(startId) || [];
  if (startOutgoing.length > 1) {
    throw new FlowConversionError('start node must have at most one outgoing edge.');
  }

  for (const [nodeId, incoming] of inMap.entries()) {
    if (nodeId === startId) {
      continue;
    }
    if (incoming.length > 1 && nodeMap.get(nodeId)?.data.type !== 'join') {
      throw new FlowConversionError(`Node ${nodeId} has multiple incoming edges. This may create an implicit merge; only join is supported for merges.`);
    }
  }

  for (const edge of graph.edges) {
    const sourceType = nodeMap.get(edge.source)?.data.type;
    if (sourceType === 'branch') {
      continue;
    }
    if (sourceType === 'start') {
      continue;
    }
    if (sourceType === 'join') {
      throw new FlowConversionError(`join node ${edge.target} can only be targeted by forked branches.`);
    }
  }

  const tasks = flattenLinear(startId, nodeMap, outMap);

  if (tasks.length === 0) {
    throw new FlowConversionError('Workflow has no executable task.');
  }

  return {
    workflowName,
    workflowVersion,
    description: description || `Workflow ${workflowName}`,
    tasks,
    taskCount: tasks.length,
  };
}

export function buildConductorPayload(
  graph: ReactFlowGraph,
  workflowName: string,
  version: number,
  description = '',
): Record<string, unknown> {
  const conversion = compileFlowToConductor(graph, workflowName, description, version);
  return {
    name: conversion.workflowName,
    description: conversion.description,
    version: conversion.workflowVersion,
    tasks: conversion.tasks,
  };
}
