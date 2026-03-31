import { randomUUID } from 'crypto';

export interface ConductorTaskItem {
  taskId: string;
  workflowInstanceId?: string;
  taskType?: string;
  status: string;
  referenceTaskName?: string;
  outputData?: Record<string, unknown>;
  inputData?: Record<string, unknown>;
  startedTime?: number;
  updateTime?: number;
  reasonForIncompletion?: string;
  seq?: number;
}

const CONDUCTOR_BASE_URL = process.env.CONDUCTOR_BASE_URL || 'http://localhost:8080/api';

async function callConductor<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CONDUCTOR_BASE_URL}${path}`, {
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
    ...init,
  });

  const text = await response.text();
  if (!response.ok) {
    const message = `${response.status} ${response.statusText}: ${text || 'No response body'}`;
    throw new Error(message);
  }

  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

export async function upsertConductorWorkflow(input: {
  name: string;
  description: string;
  version: number;
  tasks: unknown[];
  httpMethod?: 'POST' | 'PUT';
}) {
  const method = input.httpMethod || 'POST';
  const endpoint = method === 'POST' ? '/metadata/workflow' : '/metadata/workflow';
  return callConductor<Record<string, unknown>>(endpoint, {
    method,
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      version: input.version,
      tasks: input.tasks,
    }),
  });
}

export async function registerConductorWorkflow(input: {
  name: string;
  description: string;
  version: number;
  tasks: unknown[];
}) {
  return upsertConductorWorkflow({ ...input, httpMethod: 'POST' });
}

export async function updateConductorWorkflow(input: {
  name: string;
  description: string;
  version: number;
  tasks: unknown[];
}) {
  return upsertConductorWorkflow({ ...input, httpMethod: 'PUT' });
}

export async function executeConductorWorkflow(name: string, version: number, input: unknown) {
  return callConductor<Record<string, unknown>>('/workflow', {
    method: 'POST',
    body: JSON.stringify({
      name,
      version,
      input,
      correlationId: randomUUID(),
    }),
  });
}

export async function getConductorWorkflowExecution(executionId: string) {
  return callConductor<Record<string, unknown>>(`/workflow/${executionId}`, {
    method: 'GET',
  });
}

export async function getConductorWorkflowTasks(executionId: string) {
  return callConductor<ConductorTaskItem[]>(`/workflow/${executionId}/tasks`, {
    method: 'GET',
  });
}

