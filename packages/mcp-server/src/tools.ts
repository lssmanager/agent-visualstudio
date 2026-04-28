/**
 * MCP tool definitions for the LSS runtime.
 * Adapted from lssmanager/paperclip packages/mcp-server/src/tools.ts.
 * - All tool names use `lss` prefix instead of `paperclip`
 * - workspaceId replaces companyId throughout
 * - heartbeat/execution-workspace tools retained as-is (same API shape)
 */
import { z } from 'zod';
import { LssApiClient } from './client.js';
import { formatErrorResponse, formatTextResponse } from './format.js';
import type { McpToolResult } from './format.js';

export interface McpToolDefinition {
  name: string;
  description: string;
  schema: z.AnyZodObject;
  execute: (
    input: Record<string, unknown>,
  ) => Promise<McpToolResult>;
}

function makeTool<TSchema extends z.ZodRawShape>(
  name: string,
  description: string,
  schema: z.ZodObject<TSchema>,
  execute: (input: z.infer<typeof schema>) => Promise<unknown>,
): McpToolDefinition {
  return {
    name,
    description,
    schema,
    execute: async (input) => {
      try {
        const parsed = schema.parse(input);
        return formatTextResponse(await execute(parsed));
      } catch (error) {
        return formatErrorResponse(error);
      }
    },
  };
}

function parseOptionalJson(raw: string | undefined | null): unknown {
  if (!raw || raw.trim().length === 0) return undefined;
  return JSON.parse(raw);
}

// ── Common field schemas ────────────────────────────────────────────────────
const workspaceIdOptional = z.string().uuid().optional().nullable();
const agentIdOptional = z.string().uuid().optional().nullable();
const issueIdSchema = z.string().min(1);
const projectIdSchema = z.string().min(1);
const goalIdSchema = z.string().uuid();
const approvalIdSchema = z.string().uuid();
const documentKeySchema = z.string().trim().min(1).max(64);
const runIdSchema = z.string().uuid().optional().nullable();

const listIssuesSchema = z.object({
  workspaceId: workspaceIdOptional,
  status: z.string().optional(),
  projectId: z.string().uuid().optional(),
  assigneeAgentId: z.string().uuid().optional(),
  participantAgentId: z.string().uuid().optional(),
  assigneeUserId: z.string().optional(),
  labelId: z.string().uuid().optional(),
  executionWorkspaceId: z.string().uuid().optional(),
  originKind: z.string().optional(),
  originId: z.string().optional(),
  includeRoutineExecutions: z.boolean().optional(),
  q: z.string().optional(),
});

const listCommentsSchema = z.object({
  issueId: issueIdSchema,
  after: z.string().uuid().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

const upsertDocumentToolSchema = z.object({
  issueId: issueIdSchema,
  key: documentKeySchema,
  title: z.string().trim().max(200).nullable().optional(),
  format: z.enum(['markdown']).default('markdown'),
  body: z.string().max(524288),
  changeSummary: z.string().trim().max(500).nullable().optional(),
  baseRevisionId: z.string().uuid().nullable().optional(),
});

const createIssueToolSchema = z.object({
  workspaceId: workspaceIdOptional,
  title: z.string().trim().min(1).max(240),
  body: z.string().optional(),
  projectId: z.string().uuid().optional(),
  assigneeAgentId: z.string().uuid().optional(),
  labelIds: z.array(z.string().uuid()).optional(),
  priority: z.number().int().min(0).max(4).optional(),
});

const updateIssueToolSchema = z.object({
  issueId: issueIdSchema,
  title: z.string().trim().min(1).max(240).optional(),
  body: z.string().optional(),
  status: z.string().optional(),
  assigneeAgentId: z.string().uuid().optional().nullable(),
  priority: z.number().int().min(0).max(4).optional(),
});

const checkoutIssueToolSchema = z.object({
  issueId: issueIdSchema,
  agentId: agentIdOptional,
  expectedStatuses: z.array(z.string()).optional(),
});

const addCommentToolSchema = z.object({
  issueId: issueIdSchema,
  body: z.string().min(1),
  sourceRunId: runIdSchema,
});

const createApprovalToolSchema = z.object({
  workspaceId: workspaceIdOptional,
  title: z.string().trim().min(1).max(240),
  description: z.string().optional(),
  requestedByAgentId: z.string().uuid().optional(),
  issueIds: z.array(z.string().uuid()).optional(),
});

const approvalDecisionSchema = z.object({
  approvalId: approvalIdSchema,
  action: z.enum(['approve', 'reject', 'requestRevision', 'resubmit']),
  decisionNote: z.string().optional(),
  payloadJson: z.string().optional(),
});

const apiRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1),
  jsonBody: z.string().optional(),
});

const workspaceRuntimeControlTargetSchema = z.object({
  workspaceCommandId: z.string().min(1).optional().nullable(),
  runtimeServiceId: z.string().uuid().optional().nullable(),
  serviceIndex: z.number().int().nonnegative().optional().nullable(),
});

const issueWorkspaceRuntimeControlSchema = z.object({
  issueId: issueIdSchema,
  action: z.enum(['start', 'stop', 'restart']),
}).merge(workspaceRuntimeControlTargetSchema);

const waitForIssueWorkspaceServiceSchema = z.object({
  issueId: issueIdSchema,
  runtimeServiceId: z.string().uuid().optional().nullable(),
  serviceName: z.string().min(1).optional().nullable(),
  timeoutSeconds: z.number().int().positive().max(300).optional(),
});

// ── Runtime helpers ─────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readCurrentExecutionWorkspace(
  context: unknown,
): Record<string, unknown> | null {
  if (!context || typeof context !== 'object') return null;
  const workspace = (
    context as { currentExecutionWorkspace?: unknown }
  ).currentExecutionWorkspace;
  return workspace && typeof workspace === 'object'
    ? (workspace as Record<string, unknown>)
    : null;
}

function readWorkspaceRuntimeServices(
  workspace: Record<string, unknown> | null,
): Array<Record<string, unknown>> {
  const raw = workspace?.runtimeServices;
  return Array.isArray(raw)
    ? raw.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === 'object',
      )
    : [];
}

function selectRuntimeService(
  services: Array<Record<string, unknown>>,
  input: { runtimeServiceId?: string | null; serviceName?: string | null },
) {
  if (input.runtimeServiceId) {
    return (
      services.find((s) => s.id === input.runtimeServiceId) ?? null
    );
  }
  if (input.serviceName) {
    return (
      services.find((s) => s.serviceName === input.serviceName) ?? null
    );
  }
  return (
    services.find(
      (s) => s.status === 'running' || s.status === 'starting',
    ) ??
    services[0] ??
    null
  );
}

async function getIssueWorkspaceRuntime(
  client: LssApiClient,
  issueId: string,
) {
  const context = await client.requestJson<unknown>(
    'GET',
    `/issues/${encodeURIComponent(issueId)}/heartbeat-context`,
  );
  const workspace = readCurrentExecutionWorkspace(context);
  return {
    context,
    workspace,
    runtimeServices: readWorkspaceRuntimeServices(workspace),
  };
}

// ── Tool registry ────────────────────────────────────────────────────────────
export function createToolDefinitions(
  client: LssApiClient,
): McpToolDefinition[] {
  return [
    // ── Identity ──────────────────────────────────────────────────────────
    makeTool(
      'lssMe',
      'Get the current authenticated LSS agent/actor details',
      z.object({}),
      async () => client.requestJson('GET', '/agents/me'),
    ),
    makeTool(
      'lssInboxLite',
      'Get the current agent inbox-lite assignment list',
      z.object({}),
      async () => client.requestJson('GET', '/agents/me/inbox-lite'),
    ),
    makeTool(
      'lssListAgents',
      'List agents in a workspace',
      z.object({ workspaceId: workspaceIdOptional }),
      async ({ workspaceId }) =>
        client.requestJson(
          'GET',
          `/workspaces/${client.resolveWorkspaceId(workspaceId)}/agents`,
        ),
    ),
    makeTool(
      'lssGetAgent',
      'Get a single agent by id',
      z.object({
        agentId: z.string().min(1),
        workspaceId: workspaceIdOptional,
      }),
      async ({ agentId, workspaceId }) => {
        const qs = workspaceId
          ? `?workspaceId=${encodeURIComponent(workspaceId)}`
          : '';
        return client.requestJson(
          'GET',
          `/agents/${encodeURIComponent(agentId)}${qs}`,
        );
      },
    ),
    // ── Issues ────────────────────────────────────────────────────────────
    makeTool(
      'lssListIssues',
      'List issues in a workspace with optional filters',
      listIssuesSchema,
      async (input) => {
        const workspaceId = client.resolveWorkspaceId(input.workspaceId);
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(input)) {
          if (key === 'workspaceId' || value === undefined || value === null)
            continue;
          params.set(key, String(value));
        }
        const qs = params.toString();
        return client.requestJson(
          'GET',
          `/workspaces/${workspaceId}/issues${qs ? `?${qs}` : ''}`,
        );
      },
    ),
    makeTool(
      'lssGetIssue',
      'Get a single issue by UUID or identifier',
      z.object({ issueId: issueIdSchema }),
      async ({ issueId }) =>
        client.requestJson(
          'GET',
          `/issues/${encodeURIComponent(issueId)}`,
        ),
    ),
    makeTool(
      'lssCreateIssue',
      'Create a new issue in a workspace',
      createIssueToolSchema,
      async ({ workspaceId, ...body }) =>
        client.requestJson(
          'POST',
          `/workspaces/${client.resolveWorkspaceId(workspaceId)}/issues`,
          { body },
        ),
    ),
    makeTool(
      'lssUpdateIssue',
      'Update an existing issue',
      updateIssueToolSchema,
      async ({ issueId, ...body }) =>
        client.requestJson(
          'PATCH',
          `/issues/${encodeURIComponent(issueId)}`,
          { body },
        ),
    ),
    makeTool(
      'lssCheckoutIssue',
      'Checkout (claim) an issue for an agent',
      checkoutIssueToolSchema,
      async ({ issueId, ...body }) =>
        client.requestJson(
          'POST',
          `/issues/${encodeURIComponent(issueId)}/checkout`,
          { body },
        ),
    ),
    // ── Comments ──────────────────────────────────────────────────────────
    makeTool(
      'lssListComments',
      'List issue comments with incremental pagination',
      listCommentsSchema,
      async ({ issueId, after, order, limit }) => {
        const params = new URLSearchParams();
        if (after) params.set('after', after);
        if (order) params.set('order', order);
        if (limit) params.set('limit', String(limit));
        const qs = params.toString();
        return client.requestJson(
          'GET',
          `/issues/${encodeURIComponent(issueId)}/comments${qs ? `?${qs}` : ''}`,
        );
      },
    ),
    makeTool(
      'lssAddComment',
      'Add a comment to an issue',
      addCommentToolSchema,
      async ({ issueId, ...body }) =>
        client.requestJson(
          'POST',
          `/issues/${encodeURIComponent(issueId)}/comments`,
          { body },
        ),
    ),
    // ── Documents ─────────────────────────────────────────────────────────
    makeTool(
      'lssListDocuments',
      'List documents attached to an issue',
      z.object({ issueId: issueIdSchema }),
      async ({ issueId }) =>
        client.requestJson(
          'GET',
          `/issues/${encodeURIComponent(issueId)}/documents`,
        ),
    ),
    makeTool(
      'lssGetDocument',
      'Get one issue document by key',
      z.object({ issueId: issueIdSchema, key: documentKeySchema }),
      async ({ issueId, key }) =>
        client.requestJson(
          'GET',
          `/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(key)}`,
        ),
    ),
    makeTool(
      'lssUpsertDocument',
      'Create or update an issue document (markdown)',
      upsertDocumentToolSchema,
      async ({ issueId, ...body }) =>
        client.requestJson(
          'PUT',
          `/issues/${encodeURIComponent(issueId)}/documents`,
          { body },
        ),
    ),
    // ── Approvals ─────────────────────────────────────────────────────────
    makeTool(
      'lssListApprovals',
      'List approvals in a workspace',
      z.object({
        workspaceId: workspaceIdOptional,
        status: z.string().optional(),
      }),
      async ({ workspaceId, status }) => {
        const qs = status ? `?status=${encodeURIComponent(status)}` : '';
        return client.requestJson(
          'GET',
          `/workspaces/${client.resolveWorkspaceId(workspaceId)}/approvals${qs}`,
        );
      },
    ),
    makeTool(
      'lssCreateApproval',
      'Create a board approval request, optionally linked to issues',
      createApprovalToolSchema,
      async ({ workspaceId, ...body }) =>
        client.requestJson(
          'POST',
          `/workspaces/${client.resolveWorkspaceId(workspaceId)}/approvals`,
          { body },
        ),
    ),
    makeTool(
      'lssGetApproval',
      'Get an approval by id',
      z.object({ approvalId: approvalIdSchema }),
      async ({ approvalId }) =>
        client.requestJson(
          'GET',
          `/approvals/${encodeURIComponent(approvalId)}`,
        ),
    ),
    makeTool(
      'lssDecideApproval',
      'Submit a decision on an approval (approve/reject/requestRevision/resubmit)',
      approvalDecisionSchema,
      async ({ approvalId, action, decisionNote, payloadJson }) =>
        client.requestJson(
          'POST',
          `/approvals/${encodeURIComponent(approvalId)}/decisions`,
          {
            body: {
              action,
              decisionNote,
              payload: parseOptionalJson(payloadJson),
            },
          },
        ),
    ),
    // ── Projects ──────────────────────────────────────────────────────────
    makeTool(
      'lssListProjects',
      'List projects in a workspace',
      z.object({ workspaceId: workspaceIdOptional }),
      async ({ workspaceId }) =>
        client.requestJson(
          'GET',
          `/workspaces/${client.resolveWorkspaceId(workspaceId)}/projects`,
        ),
    ),
    makeTool(
      'lssGetProject',
      'Get a project by id or workspace-scoped short reference',
      z.object({
        projectId: projectIdSchema,
        workspaceId: workspaceIdOptional,
      }),
      async ({ projectId, workspaceId }) => {
        const qs = workspaceId
          ? `?workspaceId=${encodeURIComponent(workspaceId)}`
          : '';
        return client.requestJson(
          'GET',
          `/projects/${encodeURIComponent(projectId)}${qs}`,
        );
      },
    ),
    // ── Goals ─────────────────────────────────────────────────────────────
    makeTool(
      'lssListGoals',
      'List goals in a workspace',
      z.object({ workspaceId: workspaceIdOptional }),
      async ({ workspaceId }) =>
        client.requestJson(
          'GET',
          `/workspaces/${client.resolveWorkspaceId(workspaceId)}/goals`,
        ),
    ),
    makeTool(
      'lssGetGoal',
      'Get a goal by id',
      z.object({ goalId: goalIdSchema }),
      async ({ goalId }) =>
        client.requestJson('GET', `/goals/${encodeURIComponent(goalId)}`),
    ),
    // ── Heartbeat / Execution Workspace ───────────────────────────────────
    makeTool(
      'lssGetHeartbeatContext',
      'Get compact heartbeat context for an issue (used by run-engine checkpoints)',
      z.object({
        issueId: issueIdSchema,
        wakeCommentId: z.string().uuid().optional(),
      }),
      async ({ issueId, wakeCommentId }) => {
        const qs = wakeCommentId
          ? `?wakeCommentId=${encodeURIComponent(wakeCommentId)}`
          : '';
        return client.requestJson(
          'GET',
          `/issues/${encodeURIComponent(issueId)}/heartbeat-context${qs}`,
        );
      },
    ),
    makeTool(
      'lssGetIssueWorkspaceRuntime',
      'Get the current execution workspace and runtime services for an issue',
      z.object({ issueId: issueIdSchema }),
      async ({ issueId }) => getIssueWorkspaceRuntime(client, issueId),
    ),
    makeTool(
      'lssControlIssueWorkspaceServices',
      'Start, stop, or restart the current issue execution workspace runtime services',
      issueWorkspaceRuntimeControlSchema,
      async ({ issueId, action, ...target }) => {
        const runtime = await getIssueWorkspaceRuntime(client, issueId);
        const workspaceId =
          typeof runtime.workspace?.id === 'string'
            ? runtime.workspace.id
            : null;
        if (!workspaceId) {
          throw new Error('Issue has no current execution workspace');
        }
        return client.requestJson(
          'POST',
          `/execution-workspaces/${encodeURIComponent(workspaceId)}/runtime-services/${action}`,
          { body: target },
        );
      },
    ),
    makeTool(
      'lssWaitForIssueWorkspaceService',
      'Wait until an issue execution workspace runtime service is running',
      waitForIssueWorkspaceServiceSchema,
      async ({ issueId, runtimeServiceId, serviceName, timeoutSeconds }) => {
        const deadline = Date.now() + (timeoutSeconds ?? 60) * 1000;
        let latest: Awaited<
          ReturnType<typeof getIssueWorkspaceRuntime>
        > | null = null;
        while (Date.now() <= deadline) {
          latest = await getIssueWorkspaceRuntime(client, issueId);
          const service = selectRuntimeService(latest.runtimeServices, {
            runtimeServiceId,
            serviceName,
          });
          if (
            service?.status === 'running' &&
            service.healthStatus !== 'unhealthy'
          ) {
            return { workspace: latest.workspace, service };
          }
          await sleep(1000);
        }
        return {
          timedOut: true,
          latestWorkspace: latest?.workspace ?? null,
          latestRuntimeServices: latest?.runtimeServices ?? [],
        };
      },
    ),
    // ── Raw API escape hatch ───────────────────────────────────────────────
    makeTool(
      'lssApiRequest',
      'Make a raw authenticated request to the LSS API (escape hatch)',
      apiRequestSchema,
      async ({ method, path, jsonBody }) =>
        client.requestJson(method, path, {
          body: parseOptionalJson(jsonBody),
        }),
    ),
  ];
}
