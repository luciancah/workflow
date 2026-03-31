import { NextRequest, NextResponse } from 'next/server';
import { FlowConversionError, buildConductorPayload } from '@/lib/workflowConverter';
import { createWorkflow, ensureSchema, listWorkflows } from '@/lib/db';
import { registerConductorWorkflow } from '@/lib/conductor';

export async function GET() {
  await ensureSchema();
  const workflows = await listWorkflows();
  return NextResponse.json(workflows);
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const body = await req.json();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const reactFlowJson = body.reactFlowJson || body.flow || null;

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!reactFlowJson || !Array.isArray(reactFlowJson.nodes) || !Array.isArray(reactFlowJson.edges)) {
    return NextResponse.json({ error: 'reactFlowJson requires nodes and edges arrays' }, { status: 400 });
  }

  const conductorName =
    `wf_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const version = 1;
  let conductorPayload: Record<string, unknown>;
  try {
    conductorPayload = buildConductorPayload(reactFlowJson, conductorName, version, description || name);
  } catch (error) {
    if (error instanceof FlowConversionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  await registerConductorWorkflow({
    name: conductorPayload.name as string,
    description: conductorPayload.description as string,
    version: version,
    tasks: conductorPayload.tasks as unknown[],
  });

  const row = await createWorkflow({
    name,
    description: description || '',
    reactFlowJson,
    conductorCompiledJson: conductorPayload,
    conductorName,
    version,
  });
  return NextResponse.json(row, { status: 201 });
}
