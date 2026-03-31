import { Pool } from 'pg';

const rawConnectionCandidates = [
  process.env.DATABASE_URL,
  process.env.COMPOSE_DATABASE_URL,
]
  .filter((candidate): candidate is string => Boolean(candidate));

function buildConnectionCandidates() {
  const add = (list: string[], value: string) => {
    const trimmed = sanitizeConnectionString(value);
    if (!trimmed) {
      return;
    }
    if (!list.includes(trimmed)) {
      list.push(trimmed);
    }
  };

  const candidates: string[] = [];
  rawConnectionCandidates.forEach((raw) => {
    const value = sanitizeConnectionString(raw);
    if (!value) {
      return;
    }
    add(candidates, value);
  });

  return candidates;
}

const connectionCandidates = buildConnectionCandidates();

function sanitizeConnectionString(rawConnectionString: string | undefined | null) {
  if (!rawConnectionString) {
    return null;
  }

  return rawConnectionString
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/^'|'$/g, '')
    .replace(/\r?\n+/g, '');
}

function pickConnectionString() {
  const databaseUrl = sanitizeConnectionString(process.env.DATABASE_URL);
  if (databaseUrl) {
    return {
      source: 'DATABASE_URL',
      value: databaseUrl,
    };
  }

  const composeUrl = sanitizeConnectionString(process.env.COMPOSE_DATABASE_URL);
  if (composeUrl) {
    return {
      source: 'COMPOSE_DATABASE_URL',
      value: composeUrl,
    };
  }

  const first = rawConnectionCandidates.find((candidate) => Boolean(candidate));
  return first
    ? {
        source: 'fallback',
        value: sanitizeConnectionString(first),
      }
    : { source: 'missing', value: null };
}

function sanitizeDriverConnectionString(raw: string | null) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);
    return parsed.toString();
  } catch {
    // If parsing fails, keep the original string as fallback.
    return raw;
  }
}

const selectedConnection = pickConnectionString();
const connectionSource = selectedConnection.source;
const connectionString = sanitizeDriverConnectionString(selectedConnection.value);

const isSslRequired = (() => {
  if (!selectedConnection.value) {
    return false;
  }

  try {
    const parsed = new URL(selectedConnection.value);
    const mode = parsed.searchParams.get('sslmode');
    if (mode) {
      return mode !== 'disable' && mode !== 'allow' && mode !== 'prefer' ? true : false;
    }
  } catch {
    // Fallback to safe default for postgres URLs.
  }
  return false;
})();

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: isSslRequired ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
      max: 10,
      idleTimeoutMillis: 30000,
    })
  : null;

export function getDatabaseSource() {
  return connectionSource;
}

export function getDatabaseConnectionString() {
  return connectionString;
}

console.log('[db] connection source:', connectionSource);
if (connectionString) {
  try {
    const parsed = new URL(connectionString);
    console.log('[db] postgres host:', parsed.hostname);
  } catch {
    console.log('[db] unable to parse connection string');
  }
}

export function hasDatabase() {
  return !!pool;
}

function requireDatabase(operation: string) {
  if (!pool) {
    const error = new Error('DATABASE_URL is required') as Error & {
      code?: string;
      operation?: string;
    };
    error.code = 'DB_NOT_CONFIGURED';
    error.operation = operation;
    throw error;
  }
}

const ensureSchemaQuery = `
  CREATE TABLE IF NOT EXISTS workflows (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    react_flow_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    conductor_compiled_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    conductor_name TEXT NOT NULL UNIQUE,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS workflow_runs (
    id BIGSERIAL PRIMARY KEY,
    workflow_id BIGINT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    conductor_workflow_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    output JSONB
  );

  CREATE TABLE IF NOT EXISTS workflow_run_steps (
    id BIGSERIAL PRIMARY KEY,
    workflow_run_id BIGINT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    conductor_task_id TEXT,
    task_ref_name TEXT,
    status TEXT,
    task_type TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    input JSONB,
    output JSONB,
    attempt INTEGER,
    logs TEXT,
    error TEXT,
    UNIQUE (workflow_run_id, conductor_task_id)
  );
`;

export async function ensureSchema() {
  if (!pool) {
    return;
  }
  await pool.query(ensureSchemaQuery);
}

export async function executeQuery<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
) {
  requireDatabase('query');
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function listWorkflows() {
  if (!pool) {
    return [];
  }
  const rows = await executeQuery<{
    id: string;
    name: string;
    description: string;
    react_flow_json: Record<string, unknown>;
    conductor_compiled_json: Record<string, unknown>;
    conductor_name: string;
    version: number;
    updated_at: string;
    last_status: string | null;
    last_started_at: string | null;
  }>(
    `
    SELECT
      w.id,
      w.name,
      w.description,
      w.react_flow_json,
      w.conductor_compiled_json,
      w.conductor_name,
      w.version,
      w.updated_at,
      r.status AS last_status,
      r.started_at AS last_started_at
    FROM workflows w
    LEFT JOIN LATERAL (
      SELECT status, started_at
      FROM workflow_runs
      WHERE workflow_id = w.id
      ORDER BY started_at DESC
      LIMIT 1
    ) r ON TRUE
    ORDER BY w.updated_at DESC
    `,
  );

  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    description: r.description,
    reactFlowJson: r.react_flow_json,
    conductorCompiledJson: r.conductor_compiled_json,
    conductorName: r.conductor_name,
    version: r.version,
    updatedAt: r.updated_at,
    lastStatus: r.last_status,
    lastRunAt: r.last_started_at,
  }));
}

export async function getWorkflowById(id: number) {
  if (!pool) {
    return null;
  }
  const rows = await executeQuery<{
    id: string;
    name: string;
    description: string;
    react_flow_json: Record<string, unknown>;
    conductor_compiled_json: Record<string, unknown>;
    conductor_name: string;
    version: number;
    updated_at: string;
  }>(
    `SELECT id, name, description, react_flow_json, conductor_compiled_json, conductor_name, version, updated_at
     FROM workflows WHERE id = $1`,
    [id],
  );

  if (!rows[0]) {
    return null;
  }

  return {
    id: Number(rows[0].id),
    name: rows[0].name,
    description: rows[0].description,
    reactFlowJson: rows[0].react_flow_json,
    conductorCompiledJson: rows[0].conductor_compiled_json,
    conductorName: rows[0].conductor_name,
    version: rows[0].version,
    updatedAt: rows[0].updated_at,
  };
}

export async function getWorkflowByConductorName(name: string) {
  if (!pool) {
    return null;
  }
  const rows = await executeQuery<{ id: string }>(
    `SELECT id FROM workflows WHERE conductor_name = $1 LIMIT 1`,
    [name],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

export async function createWorkflow(input: {
  name: string;
  description: string;
  reactFlowJson: unknown;
  conductorCompiledJson: unknown;
  conductorName: string;
  version: number;
}) {
  requireDatabase('create');
  const rows = await executeQuery<{
    id: string;
    name: string;
    description: string;
    react_flow_json: Record<string, unknown>;
    conductor_compiled_json: Record<string, unknown>;
    conductor_name: string;
    version: number;
    updated_at: string;
  }>(
    `
      INSERT INTO workflows
      (name, description, react_flow_json, conductor_compiled_json, conductor_name, version)
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
      RETURNING id, name, description, react_flow_json, conductor_compiled_json, conductor_name, version, updated_at
    `,
    [input.name, input.description, JSON.stringify(input.reactFlowJson), JSON.stringify(input.conductorCompiledJson), input.conductorName, input.version],
  );

  const row = rows[0];
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    reactFlowJson: row.react_flow_json,
    conductorCompiledJson: row.conductor_compiled_json,
    conductorName: row.conductor_name,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

export async function updateWorkflow(input: {
  id: number;
  name: string;
  description: string;
  reactFlowJson: unknown;
  conductorCompiledJson: unknown;
  conductorName: string;
  version: number;
}) {
  requireDatabase('update');
  const rows = await executeQuery<{
    id: string;
    name: string;
    description: string;
    react_flow_json: Record<string, unknown>;
    conductor_compiled_json: Record<string, unknown>;
    conductor_name: string;
    version: number;
    updated_at: string;
  }>(
    `
      UPDATE workflows
      SET name = $1,
          description = $2,
          react_flow_json = $3::jsonb,
          conductor_compiled_json = $4::jsonb,
          conductor_name = $5,
          version = $6,
          updated_at = NOW()
      WHERE id = $7
      RETURNING id, name, description, react_flow_json, conductor_compiled_json, conductor_name, version, updated_at
    `,
    [input.name, input.description, JSON.stringify(input.reactFlowJson), JSON.stringify(input.conductorCompiledJson), input.conductorName, input.version, input.id],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    reactFlowJson: row.react_flow_json,
    conductorCompiledJson: row.conductor_compiled_json,
    conductorName: row.conductor_name,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

export async function createWorkflowRun(input: {
  workflowId: number;
  conductorWorkflowId: string;
  status: string;
  input: unknown;
}) {
  requireDatabase('run:create');
  const rows = await executeQuery<{
    id: string;
    workflow_id: string;
    conductor_workflow_id: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
  }>(
    `
      INSERT INTO workflow_runs (workflow_id, conductor_workflow_id, status, input, output)
      VALUES ($1, $2, $3, $4::jsonb, NULL)
      RETURNING id, workflow_id, conductor_workflow_id, status, started_at, ended_at, input, output
    `,
    [input.workflowId, input.conductorWorkflowId, input.status, JSON.stringify(input.input)],
  );

  const row = rows[0];
  return {
    id: Number(row.id),
    workflowId: Number(row.workflow_id),
    conductorWorkflowId: row.conductor_workflow_id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    input: row.input,
    output: row.output,
  };
}

export async function updateWorkflowRun(input: {
  id: number;
  status: string;
  endedAt: string | null;
  output: unknown | null;
}) {
  requireDatabase('run:update');
  const rows = await executeQuery<{
    id: string;
    workflow_id: string;
    conductor_workflow_id: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
  }>(
    `UPDATE workflow_runs
     SET status = $1, ended_at = $2, output = $3::jsonb
     WHERE id = $4
     RETURNING id, workflow_id, conductor_workflow_id, status, started_at, ended_at, input, output`,
    [input.status, input.endedAt, input.output ? JSON.stringify(input.output) : null, input.id],
  );
  const row = rows[0];
  return {
    id: Number(row.id),
    workflowId: Number(row.workflow_id),
    conductorWorkflowId: row.conductor_workflow_id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    input: row.input,
    output: row.output,
  };
}

export async function getWorkflowRunById(id: number) {
  if (!pool) {
    return null;
  }
  const rows = await executeQuery<{
    id: string;
    workflow_id: string;
    conductor_workflow_id: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
  }>(
    `
      SELECT id, workflow_id, conductor_workflow_id, status, started_at, ended_at, input, output
      FROM workflow_runs
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    id: Number(row.id),
    workflowId: Number(row.workflow_id),
    conductorWorkflowId: row.conductor_workflow_id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    input: row.input,
    output: row.output,
  };
}

export async function listRunsForWorkflow(workflowId: number) {
  if (!pool) {
    return [];
  }
  const rows = await executeQuery<{
    id: string;
    workflow_id: string;
    conductor_workflow_id: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    input: Record<string, unknown>;
    output: Record<string, unknown> | null;
  }>(
    `
      SELECT id, workflow_id, conductor_workflow_id, status, started_at, ended_at, input, output
      FROM workflow_runs
      WHERE workflow_id = $1
      ORDER BY started_at DESC
    `,
    [workflowId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    workflowId: Number(row.workflow_id),
    conductorWorkflowId: row.conductor_workflow_id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    input: row.input,
    output: row.output,
  }));
}

export async function upsertRunStep(input: {
  workflowRunId: number;
  conductorTaskId: string | null;
  taskRefName: string | null;
  status: string | null;
  taskType: string | null;
  startedAt: string | null;
  endedAt: string | null;
  input: unknown | null;
  output: unknown | null;
  attempt: number | null;
  logs: string | null;
  error: string | null;
}) {
  requireDatabase('runstep:upsert');
  const rows = await executeQuery<{
    id: string;
    workflow_run_id: string;
    conductor_task_id: string | null;
    task_ref_name: string | null;
    status: string | null;
  }>(
    `
      INSERT INTO workflow_run_steps
      (workflow_run_id, conductor_task_id, task_ref_name, status, task_type, started_at, ended_at, input, output, attempt, logs, error)
      VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8::jsonb, $9::jsonb, $10, $11, $12)
      ON CONFLICT (workflow_run_id, conductor_task_id)
      DO UPDATE SET
        task_ref_name = EXCLUDED.task_ref_name,
        status = EXCLUDED.status,
        task_type = EXCLUDED.task_type,
        started_at = EXCLUDED.started_at,
        ended_at = EXCLUDED.ended_at,
        input = EXCLUDED.input,
        output = EXCLUDED.output,
        attempt = EXCLUDED.attempt,
        logs = EXCLUDED.logs,
        error = EXCLUDED.error
      RETURNING id
    `,
    [
      input.workflowRunId,
      input.conductorTaskId,
      input.taskRefName,
      input.status,
      input.taskType,
      input.startedAt,
      input.endedAt,
      input.input ? JSON.stringify(input.input) : null,
      input.output ? JSON.stringify(input.output) : null,
      input.attempt,
      input.logs,
      input.error,
    ],
  );
  return rows[0];
}

export async function listRunSteps(workflowRunId: number) {
  if (!pool) {
    return [];
  }
  const rows = await executeQuery<{
    id: string;
    conductor_task_id: string | null;
    task_ref_name: string | null;
    status: string | null;
    task_type: string | null;
    started_at: string | null;
    ended_at: string | null;
    input: Record<string, unknown> | null;
    output: Record<string, unknown> | null;
    attempt: number | null;
    logs: string | null;
    error: string | null;
  }>(
    `
      SELECT id, conductor_task_id, task_ref_name, status, task_type, started_at, ended_at, input, output, attempt, logs, error
      FROM workflow_run_steps
      WHERE workflow_run_id = $1
      ORDER BY started_at NULLS LAST, id ASC
    `,
    [workflowRunId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    conductorTaskId: row.conductor_task_id,
    taskRefName: row.task_ref_name,
    status: row.status,
    taskType: row.task_type,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    input: row.input,
    output: row.output,
    attempt: row.attempt,
    logs: row.logs,
    error: row.error,
  }));
}
