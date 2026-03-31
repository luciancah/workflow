import { NextRequest, NextResponse } from 'next/server';
import { createWorkflowRun, getWorkflowById, ensureSchema } from '@/lib/db';
import { executeConductorWorkflow } from '@/lib/conductor';

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

  const execution = await executeConductorWorkflow(workflow.conductorName, workflow.version, input);
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

