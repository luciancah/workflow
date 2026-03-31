import { NextRequest, NextResponse } from 'next/server';
import { createWorkflowRun, getWorkflowById, hasDatabase, ensureSchema } from '@/lib/db';
import {
  executeConductorWorkflow,
  updateConductorWorkflow,
} from '@/lib/conductor';

const terminalStatuses = new Set([
  'COMPLETED',
  'FAILED',
  'TERMINATED',
  'FAILED_WITH_TERMINAL_ERROR',
  'CANCELED',
  'CANCELLED',
]);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!hasDatabase()) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured. Set DATABASE_URL to enable workflow execution history.' },
      { status: 503 },
    );
  }

  const workflowId = Number(params.id);
  if (!Number.isFinite(workflowId)) {
    return NextResponse.json({ error: 'invalid workflow id' }, { status: 400 });
  }

  await ensureSchema();
  const workflow = await getWorkflowById(workflowId);
  if (!workflow) {
    return NextResponse.json({ error: 'workflow not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const input = body?.input ?? {};

  let execution: Record<string, unknown>;
  try {
    execution = await executeConductorWorkflow(workflow.conductorName, workflow.version, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notFoundInConductor =
      message.includes('No such workflow defined') ||
      message.includes('"status":404');
    if (!notFoundInConductor) {
      throw error;
    }

    const compiled = workflow.conductorCompiledJson as {
      name?: unknown;
      description?: unknown;
      tasks?: unknown;
      version?: unknown;
    };
    await updateConductorWorkflow({
      name: typeof compiled?.name === 'string' ? compiled.name : workflow.conductorName,
      description:
        typeof compiled?.description === 'string' ? compiled.description : workflow.name,
      version: Number(compiled?.version) || workflow.version,
      tasks: Array.isArray(compiled?.tasks) ? compiled.tasks : [],
    });
    execution = await executeConductorWorkflow(workflow.conductorName, workflow.version, input);
  }

  const conductorId =
    (execution as { workflowId?: string; id?: string }).workflowId ||
    (execution as { workflowId?: string; id?: string }).id ||
    String(execution);

  const status = (execution as { status?: string }).status || 'RUNNING';

  const run = await createWorkflowRun({
    workflowId,
    conductorWorkflowId: conductorId,
    status: terminalStatuses.has(status) ? status : 'RUNNING',
    input,
  });

  return NextResponse.json(run);
}
