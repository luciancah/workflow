import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getWorkflowRunById, listRunSteps } from '@/lib/db';

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

  const steps = await listRunSteps(run.id);
  return NextResponse.json({ execution: run, steps });
}

