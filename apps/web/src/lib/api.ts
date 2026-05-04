import {
  AgentSpec,
  BuilderAgentFunctionOutput,
  CanonicalNodeLevel,
  CanonicalStudioStateResponse,
  CoreFilesDiffResponse,
  CoreFilesPreviewResponse,
  DeployPreview,
  EffectiveConfig,
  FlowSpec,
  HookSpec,
  ReplayMetadataResponse,
  RuntimeCapabilityMatrix,
  SessionState,
  TopologyLinkState,
  RunSpec,
  SkillSpec,
  StudioStateResponse,
  TopologyActionResult,
  TopologyNodeRef,
  TopologyRuntimeAction,
  VersionSnapshot,
  WorkspaceSpec,
} from './types';

const API_BASE = '/api/studio/v1';

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getStudioState() {
  const response = await fetch(`${API_BASE}/studio/state`);
  return parseJson<StudioStateResponse>(response);
}

export async function fetchCanonicalState() {
  const response = await fetch(`${API_BASE}/studio/canonical-state`);
  return parseJson<CanonicalStudioStateResponse>(response);
}

export async function getCanonicalStudioState() {
  return fetchCanonicalState();
}

export async function getDeployPreview() {
  const response = await fetch(`${API_BASE}/deploy/preview`);
  return parseJson<DeployPreview>(response);
}

export async function applyDeploy(payload: { applyRuntime?: boolean }) {
  const response = await fetch(`${API_BASE}/deploy/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson<{ ok: boolean }>(response);
}

export async function previewCoreFiles() {
  const response = await fetch(`${API_BASE}/corefiles/preview`);
  return parseJson<CoreFilesPreviewResponse>(response);
}

export async function diffCoreFiles(snapshotId?: string) {
  const query = snapshotId ? `?snapshotId=${encodeURIComponent(snapshotId)}` : '';
  const response = await fetch(`${API_BASE}/corefiles/diff${query}`);
  return parseJson<CoreFilesDiffResponse>(response);
}

export async function applyCoreFiles(payload: { applyRuntime?: boolean; artifacts?: DeployPreview['artifacts'] }) {
  const response = await fetch(`${API_BASE}/corefiles/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson<{ ok: boolean; diagnostics?: string[] }>(response);
}

export async function rollbackCoreFiles(snapshotId: string) {
  const response = await fetch(`${API_BASE}/corefiles/rollback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ snapshotId }),
  });
  return parseJson<{ ok: boolean; message?: string; error?: string }>(response);
}

export async function getCoreFilesPreviewForTarget(target: string) {
  const response = await fetch(`${API_BASE}/corefiles/${encodeURIComponent(target)}/preview`);
  return parseJson<CoreFilesPreviewResponse>(response);
}

export async function getCoreFilesDiffForTarget(target: string, snapshotId?: string) {
  const query = snapshotId ? `?snapshotId=${encodeURIComponent(snapshotId)}` : '';
  const response = await fetch(`${API_BASE}/corefiles/${encodeURIComponent(target)}/diff${query}`);
  return parseJson<CoreFilesDiffResponse>(response);
}

export async function applyCoreFilesForTarget(
  target: string,
  payload: { applyRuntime?: boolean; artifacts?: DeployPreview['artifacts'] },
) {
  const response = await fetch(`${API_BASE}/corefiles/${encodeURIComponent(target)}/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson<{ ok: boolean; diagnostics?: string[] }>(response);
}

export async function rollbackCoreFilesForTarget(target: string, snapshotId: string) {
  const response = await fetch(`${API_BASE}/corefiles/${encodeURIComponent(target)}/rollback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ snapshotId }),
  });
  return parseJson<{ ok: boolean; message?: string; error?: string }>(response);
}

export async function triggerTopologyAction(
  action: TopologyRuntimeAction,
  payload: { from: TopologyNodeRef; to?: TopologyNodeRef; reason?: string; metadata?: Record<string, unknown> },
) {
  const response = await fetch(`${API_BASE}/topology/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null) as TopologyActionResult | null;
  if (!response.ok) {
    if (body?.status === 'unsupported_by_runtime') {
      return body;
    }
    throw new Error((body as { message?: string } | null)?.message ?? `Request failed: ${response.status}`);
  }

  return body as TopologyActionResult;
}

export async function getBuilderAgentFunction(level: CanonicalNodeLevel, id: string) {
  const params = new URLSearchParams({ level, id });
  const response = await fetch(`${API_BASE}/builder-agent/function?${params.toString()}`);
  return parseJson<BuilderAgentFunctionOutput>(response);
}

export async function generateBuilderAgentFunction(level: CanonicalNodeLevel, id: string) {
  const response = await fetch(`${API_BASE}/builder-agent/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ level, id }),
  });
  return parseJson<BuilderAgentFunctionOutput>(response);
}

export async function getRuntimeCapabilities() {
  const response = await fetch(`${API_BASE}/runtime/capabilities`);
  return parseJson<RuntimeCapabilityMatrix>(response);
}

export async function getRuntimeSessions() {
  const response = await fetch(`${API_BASE}/runtime/sessions`);
  return parseJson<SessionState[]>(response);
}

export async function getRuntimeChannels() {
  const response = await fetch(`${API_BASE}/runtime/channels`);
  return parseJson<Array<{ channel: string; sessions: number; activeSessions: number }>>(response);
}

export async function getRuntimeTopologyLinks() {
  const response = await fetch(`${API_BASE}/runtime/topology-links`);
  return parseJson<TopologyLinkState[]>(response);
}

export async function createWorkspace(input: {
  id?: string;
  name: string;
  slug?: string;
  profileId?: string;
  defaultModel?: string;
  skillIds?: string[];
}) {
  const workspaceSpec: Record<string, any> = {
    name: input.name,
    agentIds: [],
    flowIds: [],
    policyIds: [],
  };

  if (input.slug !== undefined) workspaceSpec.slug = input.slug;
  if (input.defaultModel !== undefined) workspaceSpec.defaultModel = input.defaultModel;
  if (input.skillIds !== undefined) workspaceSpec.skillIds = input.skillIds;

  const response = await fetch(`${API_BASE}/workspaces/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      profileId: input.profileId,
      workspaceSpec,
    }),
  });
  return parseJson<{ workspaceSpec: WorkspaceSpec; created: boolean; message: string; timestamp: string }>(response);
}

export async function updateWorkspace(input: Partial<WorkspaceSpec>) {
  const response = await fetch(`${API_BASE}/workspaces/current`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson<WorkspaceSpec>(response);
}

export async function saveAgent(agent: AgentSpec) {
  const response = await fetch(`${API_BASE}/agents/${agent.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(agent),
  });

  if (response.status === 404) {
    const created = await fetch(`${API_BASE}/agents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(agent),
    });
    return parseJson<AgentSpec>(created);
  }

  return parseJson<AgentSpec>(response);
}

export async function saveFlow(flow: FlowSpec) {
  const response = await fetch(`${API_BASE}/flows/${flow.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(flow),
  });

  if (response.status === 404) {
    const created = await fetch(`${API_BASE}/flows`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(flow),
    });
    return parseJson<FlowSpec>(created);
  }

  return parseJson<FlowSpec>(response);
}

export async function saveSkill(skill: SkillSpec) {
  const response = await fetch(`${API_BASE}/skills/${skill.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(skill),
  });

  if (response.status === 404) {
    const created = await fetch(`${API_BASE}/skills`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(skill),
    });
    return parseJson<SkillSpec>(created);
  }

  return parseJson<SkillSpec>(response);
}

// ── Effective Config ──────────────────────────────────────────────────

export async function getEffectiveConfig() {
  const response = await fetch(`${API_BASE}/config/effective`);
  return parseJson<EffectiveConfig>(response);
}

export async function getEffectiveConfigForAgent(agentId: string) {
  const response = await fetch(`${API_BASE}/config/effective/${encodeURIComponent(agentId)}`);
  return parseJson<EffectiveConfig>(response);
}

// ── Commands ──────────────────────────────────────────────────────────

interface CommandSpec {
  id: string;
  name: string;
  description: string;
  steps: string[];
  tags?: string[];
}

export async function getCommands() {
  const response = await fetch(`${API_BASE}/commands`);
  return parseJson<CommandSpec[]>(response);
}

export async function getCommand(id: string) {
  const response = await fetch(`${API_BASE}/commands/${encodeURIComponent(id)}`);
  return parseJson<CommandSpec>(response);
}

// ── Export ──────────────────────────────────────────────────────────────

export async function exportWorkspace() {
  const response = await fetch(`${API_BASE}/export`, { method: 'POST' });
  return parseJson<{
    version: string;
    exportedAt: string;
    workspace: WorkspaceSpec;
    agents: AgentSpec[];
    flows: FlowSpec[];
    skills: SkillSpec[];
    policies: Array<{ id: string; name: string }>;
  }>(response);
}

// ── Agents by kind ────────────────────────────────────────────────────

export async function getAgentsByKind(kind: 'agent' | 'subagent' | 'orchestrator') {
  const response = await fetch(`${API_BASE}/agents?kind=${encodeURIComponent(kind)}`);
  return parseJson<AgentSpec[]>(response);
}

// ── Runs ──────────────────────────────────────────────────────────────

export async function getRuns() {
  const response = await fetch(`${API_BASE}/runs`);
  return parseJson<RunSpec[]>(response);
}

export async function getRun(id: string) {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(id)}`);
  return parseJson<RunSpec>(response);
}

export async function startRun(flowId: string, trigger?: { type: string; payload?: Record<string, unknown> }) {
  const response = await fetch(`${API_BASE}/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ flowId, trigger }),
  });
  return parseJson<RunSpec>(response);
}

export async function cancelRun(id: string) {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  return parseJson<RunSpec>(response);
}

export async function approveStep(runId: string, stepId: string) {
  const response = await fetch(
    `${API_BASE}/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/approve`,
    { method: 'POST' },
  );
  return parseJson<RunSpec>(response);
}

export async function rejectStep(runId: string, stepId: string, reason?: string) {
  const response = await fetch(
    `${API_BASE}/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/reject`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    },
  );
  return parseJson<RunSpec>(response);
}

/**
 * Reintenta la delegación de un step bloqueado.
 * Endpoint: POST /api/studio/v1/runs/:runId/steps/:stepId/retry
 *
 * Si el backend no implementa este endpoint todavía (devuelve 404/405),
 * el error se propaga al componente BlockedNode que lo muestra al usuario
 * con un mensaje específico.
 *
 * TODO(F-backend): implementar RunsController.retryStep() cuando
 * HierarchyOrchestrator soporte re-delegación (ver F2a-07 isBlocked()).
 */
export async function retryDelegation(runId: string, stepId: string) {
  const response = await fetch(
    `${API_BASE}/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/retry`,
    { method: 'POST' },
  );
  return parseJson<RunSpec>(response);
}

export async function getRunTrace(id: string) {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(id)}/trace`);
  return parseJson<{
    runId: string;
    flowId: string;
    status: string;
    steps: RunSpec['steps'];
    topologyEvents: Array<Record<string, unknown>>;
    handoffs: Array<Record<string, unknown>>;
    redirects: Array<Record<string, unknown>>;
    stateTransitions: Array<Record<string, unknown>>;
    replay: { sourceRunId?: string; replayType?: string };
  }>(response);
}

export async function getRunReplayMetadata(id: string) {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(id)}/replay-metadata`);
  return parseJson<ReplayMetadataResponse>(response);
}

// ── Flow Validation ──────────────────────────────────────────────────

export interface FlowValidationResult {
  valid: boolean;
  issues: Array<{ severity: 'error' | 'warning'; message: string; nodeId?: string }>;
}

export async function validateFlow(flowId: string) {
  const response = await fetch(`${API_BASE}/flows/${encodeURIComponent(flowId)}/validate`, {
    method: 'POST',
  });
  return parseJson<FlowValidationResult>(response);
}

// ── Hooks ─────────────────────────────────────────────────────────────

export async function getHooks() {
  const response = await fetch(`${API_BASE}/hooks`);
  return parseJson<HookSpec[]>(response);
}

export async function createHook(input: Omit<HookSpec, 'id'> & { id?: string }) {
  const response = await fetch(`${API_BASE}/hooks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson<HookSpec>(response);
}

export async function updateHook(id: string, updates: Partial<HookSpec>) {
  const response = await fetch(`${API_BASE}/hooks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return parseJson<HookSpec>(response);
}

export async function deleteHook(id: string) {
  const response = await fetch(`${API_BASE}/hooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete hook');
}

// ── Audit ─────────────────────────────────────────────────────────────

export async function getAuditLog(filters?: { resource?: string; action?: string; from?: string; to?: string }) {
  const params = new URLSearchParams();
  if (filters?.resource) params.set('resource', filters.resource);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const qs = params.toString();
  const response = await fetch(`${API_BASE}/audit${qs ? `?${qs}` : ''}`);
  return parseJson<Array<{ id: string; timestamp: string; resource: string; resourceId?: string; action: string; detail: string }>>(response);
}

// ── Budgets ───────────────────────────────────────────────────────────

export async function getBudgets() {
  const response = await fetch(`${API_BASE}/budgets`);
  return parseJson<Array<{ id: string; name: string; scope: string; limitUsd: number; periodDays: number; currentUsageUsd: number; enabled: boolean }>>(response);
}

export async function createBudget(input: { name: string; scope: string; limitUsd: number; periodDays: number; enabled: boolean }) {
  const response = await fetch(`${API_BASE}/budgets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson<{ id: string }>(response);
}

// ── MCP Servers ───────────────────────────────────────────────────────

export async function getMcpServers() {
  const response = await fetch(`${API_BASE}/mcp/servers`);
  return parseJson<Array<{ id: string; name: string; url: string; protocol: string; description?: string; enabled: boolean; createdAt: string }>>(response);
}

export async function addMcpServer(input: { name: string; url: string; protocol: string; enabled: boolean }) {
  const response = await fetch(`${API_BASE}/mcp/servers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson<{ id: string }>(response);
}

export async function removeMcpServer(id: string) {
  const response = await fetch(`${API_BASE}/mcp/servers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to remove MCP server');
}

// ── Versions ──────────────────────────────────────────────────────────

export async function getVersions() {
  const response = await fetch(`${API_BASE}/versions`);
  return parseJson<VersionSnapshot[]>(response);
}

export async function getVersion(id: string) {
  const response = await fetch(`${API_BASE}/versions/${encodeURIComponent(id)}`);
  return parseJson<VersionSnapshot>(response);
}

export async function createVersion(label?: string) {
  const response = await fetch(`${API_BASE}/versions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  return parseJson<VersionSnapshot>(response);
}

export async function getVersionDiff(id: string) {
  const response = await fetch(`${API_BASE}/versions/${encodeURIComponent(id)}/diff`);
  return parseJson<{
    snapshotId: string;
    snapshotLabel?: string;
    snapshotCreatedAt?: string;
    diffs: Array<{ path: string; type: 'added' | 'removed' | 'changed' | 'unchanged'; before?: unknown; after?: unknown }>;
  }>(response);
}

export async function rollbackVersion(id: string) {
  const response = await fetch(`${API_BASE}/versions/${encodeURIComponent(id)}/rollback`, { method: 'POST' });
  return parseJson<{ ok: boolean; message: string }>(response);
}

export async function publishVersion(label: string, notes?: string) {
  const response = await fetch(`${API_BASE}/versions/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label, notes }),
  });
  return parseJson<VersionSnapshot>(response);
}

export async function importWorkspace(data: Record<string, unknown>) {
  const response = await fetch(`${API_BASE}/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  return parseJson<{ ok: boolean; snapshotId: string }>(response);
}

// ── Operations (Sprint 7) ─────────────────────────────────────────────

export async function replayRun(id: string) {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(id)}/replay`, { method: 'POST' });
  return parseJson<RunSpec>(response);
}

export async function compareRuns(ids: string[]) {
  const response = await fetch(`${API_BASE}/runs/compare?ids=${ids.map(encodeURIComponent).join(',')}`);
  return parseJson<{
    runs: Array<{ id: string; flowId: string; status: string; startedAt: string; completedAt?: string; totalCost: number; totalTokens: { input: number; output: number }; stepCount: number }>;
    diffs: Array<{ field: string; values: Record<string, unknown> }>;
  }>(response);
}

export async function getRunCost(id: string) {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(id)}/cost`);
  return parseJson<{
    runId: string;
    totalCost: number;
    totalTokens: { input: number; output: number };
    steps: Array<{ stepId: string; nodeId: string; nodeType: string; agentId?: string; costUsd: number; tokenUsage: { input: number; output: number } }>;
  }>(response);
}

export async function getUsage(filters?: { from?: string; to?: string; groupBy?: string }) {
  const params = new URLSearchParams();
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  if (filters?.groupBy) params.set('groupBy', filters.groupBy);
  const qs = params.toString();
  const response = await fetch(`${API_BASE}/usage${qs ? `?${qs}` : ''}`);
  return parseJson<{
    totalCost: number;
    totalTokens: { input: number; output: number };
    totalRuns: number;
    groups: Array<{ key: string; cost: number; tokens: { input: number; output: number }; runs: number }>;
  }>(response);
}

export async function getUsageByAgent() {
  const response = await fetch(`${API_BASE}/usage/by-agent`);
  return parseJson<Array<{ agentId: string; cost: number; tokens: { input: number; output: number }; steps: number }>>(response);
}

// ── n8n ───────────────────────────────────────────────────────────────────────

export interface N8nWorkflowSummary {
  id:     string;
  name:   string;
  active: boolean;
}

export interface N8nExecutionSummary {
  id:         string;
  workflowId: string;
  finished:   boolean;
  mode:       string;
  startedAt:  string;
  stoppedAt?: string;
  status:     'running' | 'success' | 'error' | 'waiting' | 'canceled';
}

export async function listN8nWorkflows(): Promise<N8nWorkflowSummary[]> {
  const response = await fetch(`${API_BASE}/n8n/workflows`);
  return parseJson<N8nWorkflowSummary[]>(response);
}

export async function getN8nWorkflow(
  workflowId: string,
): Promise<N8nWorkflowSummary & { nodes: unknown[]; connections: unknown }> {
  const response = await fetch(`${API_BASE}/n8n/workflows/${encodeURIComponent(workflowId)}`);
  return parseJson(response);
}

export async function syncFlowToN8n(
  flowId:      string,
  workflowId?: string,
): Promise<N8nWorkflowSummary> {
  const response = await fetch(`${API_BASE}/n8n/sync-flow/${encodeURIComponent(flowId)}`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ workflowId }),
  });
  return parseJson(response);
}

export async function activateN8nWorkflow(workflowId: string): Promise<{ ok: boolean }> {
  const response = await fetch(
    `${API_BASE}/n8n/workflows/${encodeURIComponent(workflowId)}/activate`,
    { method: 'POST' },
  );
  return parseJson(response);
}

export async function deactivateN8nWorkflow(workflowId: string): Promise<{ ok: boolean }> {
  const response = await fetch(
    `${API_BASE}/n8n/workflows/${encodeURIComponent(workflowId)}/deactivate`,
    { method: 'POST' },
  );
  return parseJson(response);
}

export async function listN8nExecutions(workflowId?: string): Promise<N8nExecutionSummary[]> {
  const qs = workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';
  const response = await fetch(`${API_BASE}/n8n/executions${qs}`);
  return parseJson<N8nExecutionSummary[]>(response);
}

// ── Model Policies ────────────────────────────────────────────────────
//
// Gestiona la política de modelo LLM por scope jerárquico:
//   Agency → Department → Workspace → Agent
//
// TODO(F-backend): implementar ModelPoliciesController en apps/api/src/modules/settings/
// Hasta entonces, los endpoints devuelven 404 y el componente ModelSettings
// muestra un banner informativo sin bloquear la UI.

/** Nivel jerárquico al que aplica la política de modelo. */
export type PolicyScope = 'agency' | 'department' | 'workspace' | 'agent';

/** Política de modelo LLM para un scope concreto. */
export interface ModelPolicy {
  id:           string;
  scope:        PolicyScope;
  scopeId:      string;
  /** Si true, hereda del scope padre; los campos model/provider se ignoran. */
  inherit:      boolean;
  provider?:    string;   // 'openai' | 'anthropic' | 'openrouter' | 'deepseek' | 'qwen'
  model?:       string;   // e.g. 'gpt-4o', 'claude-3-5-sonnet-20241022'
  temperature?: number;   // 0.0 – 2.0
  maxTokens?:   number;
  updatedAt?:   string;
}

/**
 * Lista todas las ModelPolicy del contexto actual.
 * GET /api/studio/v1/model-policies
 */
export async function getModelPolicies(): Promise<ModelPolicy[]> {
  const response = await fetch(`${API_BASE}/model-policies`);
  return parseJson<ModelPolicy[]>(response);
}

/**
 * Obtiene la política efectiva para un scope+scopeId (herencia resuelta por el backend).
 * GET /api/studio/v1/model-policies/:scope/:scopeId/effective
 */
export async function getEffectivePolicy(
  scope: PolicyScope,
  scopeId: string,
): Promise<ModelPolicy> {
  const response = await fetch(
    `${API_BASE}/model-policies/${encodeURIComponent(scope)}/${encodeURIComponent(scopeId)}/effective`,
  );
  return parseJson<ModelPolicy>(response);
}

/**
 * Crea o actualiza la política de un scope.
 * PUT /api/studio/v1/model-policies/:scope/:scopeId
 *
 * TODO(F-backend): implementar ModelPoliciesController.
 * Mientras tanto retorna 404; el componente lo maneja con mensaje claro.
 */
export async function upsertModelPolicy(
  scope: PolicyScope,
  scopeId: string,
  data: Omit<ModelPolicy, 'id' | 'scope' | 'scopeId' | 'updatedAt'>,
): Promise<ModelPolicy> {
  const response = await fetch(
    `${API_BASE}/model-policies/${encodeURIComponent(scope)}/${encodeURIComponent(scopeId)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    },
  );
  return parseJson<ModelPolicy>(response);
}
