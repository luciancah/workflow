import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getWorkflowById, listRunsForWorkflow } from '@/lib/db';
import { toHttpDbError } from '@/lib/apiErrors';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const workflowId = Number(params.id);
    if (!Number.isFinite(workflowId)) {
      return NextResponse.json({ error: 'invalid workflow id' }, { status: 400 });
    }

    await ensureSchema();
    const workflow = await getWorkflowById(workflowId);
    if (!workflow) {
      return NextResponse.json({ error: 'workflow not found' }, { status: 404 });
    }

    const runs = await listRunsForWorkflow(workflowId);
    return NextResponse.json(runs);
  } catch (error) {
    return toHttpDbError(error);
  }
}
