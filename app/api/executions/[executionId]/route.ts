import { NextRequest, NextResponse } from 'next/server';
import {
  ensureSchema,
  getWorkflowRunById,
  listRunSteps,
  updateWorkflowRun,
  upsertRunStep,
} from '@/lib/db';
import {
  ConductorTaskItem,
  getConductorWorkflowExecution,
  getConductorWorkflowTasks,
} from '@/lib/conductor';

const terminalStatuses = new Set([
  'COMPLETED',
  'FAILED',
  'TERMINATED',
  'FAILED_WITH_TERMINAL_ERROR',
  'CANCELED',
  'CANCELLED',
]);

function pickIso(value: string | number | undefined | null): string | null {
  if (!value) return null;
  const num = typeof value === 'number' ? value : Date.parse(value);
  if (Number.isNaN(num)) return null;
  return new Date(num).toISOString();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { executionId: string } },
) {
  const runId = Number(params.executionId);
  if (!Number.isFinite(runId)) {
    return NextResponse.json({ error: 'invalid execution id' }, { status: 400 });
  }

  await ensureSchema();
  const run = await getWorkflowRunById(runId);
  if (!run) {
    return NextResponse.json({ error: 'execution not found' }, { status: 404 });
  }

  let conductorExecution: Record<string, unknown> | null = null;
  try {
    conductorExecution = await getConductorWorkflowExecution(run.conductorWorkflowId);
    if (conductorExecution) {
      const status = String((conductorExecution as Record<string, unknown>).status || run.status);
      const output = (conductorExecution as Record<string, unknown>).output || null;
      const ended = (conductorExecution as Record<string, unknown>).endTime;
      const endedAt = ended ? pickIso(String(ended)) : null;
      const updated = await updateWorkflowRun({
        id: run.id,
        status,
        endedAt,
        output,
      });
      run.status = updated.status;
      run.endedAt = updated.endedAt;
      run.output = updated.output;
    }
  } catch {
    // If execution read fails, keep DB state and continue with local cache.
  }

  let steps = await listRunSteps(run.id);
  try {
    const tasksResponse = await getConductorWorkflowTasks(run.conductorWorkflowId);
    const tasks = Array.isArray(tasksResponse)
      ? tasksResponse
      : tasksResponse && Array.isArray((tasksResponse as { results?: unknown }).results)
        ? ((tasksResponse as { results: ConductorTaskItem[] }).results)
        : [];

    for (const task of tasks) {
      await upsertRunStep({
        workflowRunId: run.id,
        conductorTaskId: task.taskId,
        taskRefName: task.referenceTaskName || null,
        status: task.status,
        taskType: task.taskType || null,
        startedAt: pickIso(task.startedTime ? Number(task.startedTime) : null),
        endedAt: pickIso(task.updateTime ? Number(task.updateTime) : null),
        input: task.inputData || null,
        output: task.outputData || null,
        attempt: task.seq || null,
        logs: task.reasonForIncompletion || null,
        error: task.reasonForIncompletion || null,
      });
    }
    steps = await listRunSteps(run.id);
  } catch {
    // keep cached rows
  }

  return NextResponse.json({
    run,
    conductorExecution,
    steps,
    isTerminal: terminalStatuses.has(run.status),
  });
}
