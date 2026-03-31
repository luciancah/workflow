import { NextRequest, NextResponse } from 'next/server';
import { FlowConversionError, buildConductorPayload } from '@/lib/workflowConverter';
import {
  ensureSchema,
  getWorkflowById,
  updateWorkflow,
} from '@/lib/db';
import { updateConductorWorkflow } from '@/lib/conductor';

export async function GET(
  _req: NextRequest,
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
  return NextResponse.json(workflow);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const workflowId = Number(params.id);
  if (!Number.isFinite(workflowId)) {
    return NextResponse.json({ error: 'invalid workflow id' }, { status: 400 });
  }

  const body = await req.json();
  await ensureSchema();
  const existing = await getWorkflowById(workflowId);
  if (!existing) {
    return NextResponse.json({ error: 'workflow not found' }, { status: 404 });
  }

  const reactFlowJson = body.reactFlowJson || body.flow || null;
  const name = typeof body.name === 'string' ? body.name.trim() : existing.name;
  const description = typeof body.description === 'string' ? body.description.trim() : existing.description;

  if (!reactFlowJson || !Array.isArray(reactFlowJson.nodes) || !Array.isArray(reactFlowJson.edges)) {
    return NextResponse.json({ error: 'reactFlowJson requires nodes and edges arrays' }, { status: 400 });
  }

  const version = existing.version + 1;
  let conductorPayload: Record<string, unknown>;
  try {
    conductorPayload = buildConductorPayload(
      reactFlowJson,
      existing.conductorName,
      version,
      description || existing.name,
    );
  } catch (error) {
    if (error instanceof FlowConversionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  await updateConductorWorkflow({
    name: conductorPayload.name as string,
    description: conductorPayload.description as string,
    version,
    tasks: conductorPayload.tasks as unknown[],
  });

  const updated = await updateWorkflow({
    id: workflowId,
    name,
    description: description || existing.description,
    reactFlowJson,
    conductorCompiledJson: conductorPayload,
    conductorName: existing.conductorName,
    version,
  });

  return NextResponse.json(updated);
}
