import {
  AgentSpec,
  BuilderAgentFunctionOutput,
  CanonicalNodeLevel,
  CanonicalStudioStateResponse,
  ConnectionsDependencyGraphDto,
  ConnectionsEdgeReliabilityDto,
  ConnectionsFlowGraphDto,
  ConnectionsHierarchyDto,
  ConnectionsHookBlastRadiusDto,
  ConnectionsMeteringDto,
  ConnectionsOrgChartDto,
  ConnectionsRadialDto,
  ConnectionsRoutingDriftDto,
  ConnectionsRoutingDecisionFlowDto,
  ConnectionsTopologyDto,
  CoreFilesDiffResponse,
  CoreFilesPreviewResponse,
  DashboardConnectionsDto,
  DashboardInspectorDto,
  DashboardOperationsAlertsDto,
  DashboardOperationsCostProfileDto,
  DashboardOperationsDto,
  DashboardOperationsRuntimeStateDto,
  DashboardOverviewDto,
  DashboardRunsDto,
  DeployPreview,
  EffectiveProfileDto,
  EffectiveConfig,
  FlowSpec,
  HookSpec,
  MetricsBudgetDto,
  MetricsKpisDto,
  MetricsLatencyDto,
  MetricsSessionsHeatmapDto,
  MetricsRunsTokenCorrelationDto,
  MetricsBudgetForecastDto,
  MetricsBudgetGuardrailSimulationDto,
  MetricsCostAnomalyBandsDto,
  MetricsFallbackTransitionsDto,
  MetricsModelMixDto,
  MetricsRunsDto,
  MetricsSessionsDto,
  MetricsTokensDto,
  OperationsActionsHeatmapDto,
  OperationsApprovalForecastDto,
  OperationsPolicyConflictsDto,
  OperationsRuntimeRecoverySimulationDto,
  ReplayMetadataResponse,
  RuntimeCapabilityMatrix,
  SessionState,
  TopologyLinkState,
  RunSpec,
  SkillSpec,
  StudioStateResponse,
  ProfileTemplatesStateDto,
  TopologyActionResult,
  TopologyNodeRef,
  TopologyRuntimeAction,
  VersionSnapshot,
  WorkspaceSpec,
  EditorReadinessByWorkspaceDto,
  EditorDependenciesDto,
  EditorPromptGraphDto,
  EditorSectionDependencyImpactDto,
  EditorRollbackRiskDto,
  EditorSkillsToolsDto,
} from './types';
import type { AnalyticsGranularity, AnalyticsWindow } from '../features/analytics/types';

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

export async function getCanonicalStudioState() {
  const response = await fetch(`${API_BASE}/studio/canonical-state`);
  return parseJson<CanonicalStudioStateResponse>(response);
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

function toScopeQuery(level: CanonicalNodeLevel, id: string) {
  const params = new URLSearchParams({ level, id });
  return params.toString();
}

export async function getDashboardOverview(level: CanonicalNodeLevel, id: string) {
  const response = await fetch(`${API_BASE}/dashboard/overview?${toScopeQuery(level, id)}`);
  return parseJson<DashboardOverviewDto>(response);
}

export async function getDashboardConnections(level: CanonicalNodeLevel, id: string) {
  const response = await fetch(`${API_BASE}/dashboard/connections?${toScopeQuery(level, id)}`);
  return parseJson<DashboardConnectionsDto>(response);
}

export async function getDashboardInspector(level: CanonicalNodeLevel, id: string) {
  const response = await fetch(`${API_BASE}/dashboard/inspector?${toScopeQuery(level, id)}`);
  return parseJson<DashboardInspectorDto>(response);
}

export async function getDashboardOperations(level: CanonicalNodeLevel, id: string) {
  const response = await fetch(`${API_BASE}/dashboard/operations?${toScopeQuery(level, id)}`);
  return parseJson<DashboardOperationsDto>(response);
}

export async function getDashboardOperationsRuntimeState(level: CanonicalNodeLevel, id: string) {
  const response = await fetch(`${API_BASE}/dashboard/operations/runtime-state?${toScopeQuery(level, id)}`);
  return parseJson<DashboardOperationsRuntimeStateDto>(response);
}

export async function getDashboardOperationsAlerts(
  level: CanonicalNodeLevel,
  id: string,
  window: AnalyticsWindow = '24H',
) {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/operations/alerts?${params.toString()}`);
  return parseJson<DashboardOperationsAlertsDto>(response);
}

export async function getDashboardOperationsCostProfile(
  level: CanonicalNodeLevel,
  id: string,
  window: AnalyticsWindow = '24H',
) {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/operations/cost-profile?${params.toString()}`);
  return parseJson<DashboardOperationsCostProfileDto>(response);
}

export async function getDashboardOperationsBudgets(level: CanonicalNodeLevel, id: string) {
  const response = await fetch(`${API_BASE}/dashboard/operations/budgets?${toScopeQuery(level, id)}`);
  return parseJson<{
    scope: { level: CanonicalNodeLevel; id: string };
    budgets: Array<{ id: string; name: string; scope: string; limitUsd: number; periodDays: number; currentUsageUsd: number; enabled: boolean; createdAt: string; updatedAt: string }>;
  }>(response);
}

export async function getDashboardOperationsPolicies(level: CanonicalNodeLevel, id: string) {
  const response = await fetch(`${API_BASE}/dashboard/operations/policies?${toScopeQuery(level, id)}`);
  return parseJson<{
    scope: { level: CanonicalNodeLevel; id: string };
    policies: Array<{ id: string; name: string; [key: string]: unknown }>;
  }>(response);
}

export async function getDashboardRuns(level: CanonicalNodeLevel, id: string, limit?: number) {
  const params = new URLSearchParams({ level, id });
  if (typeof limit === 'number' && Number.isFinite(limit)) {
    params.set('limit', String(Math.max(1, Math.floor(limit))));
  }
  const response = await fetch(`${API_BASE}/dashboard/runs?${params.toString()}`);
  return parseJson<DashboardRunsDto>(response);
}

export async function getEffectiveProfile(level: CanonicalNodeLevel, id: string) {
  const response = await fetch(`${API_BASE}/dashboard/effective-profile?${toScopeQuery(level, id)}`);
  return parseJson<EffectiveProfileDto>(response);
}

export async function bindProfile(level: CanonicalNodeLevel, id: string, profileId: string) {
  const response = await fetch(`${API_BASE}/dashboard/profile/bind`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ level, id, profileId }),
  });
  return parseJson<{ ok: boolean }>(response);
}

export async function unbindProfile(level: CanonicalNodeLevel, id: string) {
  const response = await fetch(`${API_BASE}/dashboard/profile/unbind`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ level, id }),
  });
  return parseJson<{ ok: boolean }>(response);
}

export async function saveProfileOverride(
  level: CanonicalNodeLevel,
  id: string,
  overrides: { model?: string; skills?: string[]; routines?: string[]; tags?: string[] },
) {
  const response = await fetch(`${API_BASE}/dashboard/profile/override`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ level, id, overrides }),
  });
  return parseJson<{ ok: boolean }>(response);
}

export async function getProfileTemplatesState() {
  const response = await fetch(`${API_BASE}/profiles/templates`);
  return parseJson<ProfileTemplatesStateDto>(response);
}

export async function sendRuntimeCommand(
  level: CanonicalNodeLevel,
  id: string,
  action: TopologyRuntimeAction,
  target?: TopologyNodeRef,
) {
  const response = await fetch(`${API_BASE}/dashboard/runtime/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ level, id, action, target }),
  });
  return parseJson<{
    command: TopologyRuntimeAction;
    scope: { level: CanonicalNodeLevel; id: string };
    result: TopologyActionResult;
  }>(response);
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
  // Bootstrap endpoint: backend handles merge order (request > profile > defaults)
  // Only include fields user explicitly set - backend fills in profile defaults
  const workspaceSpec: Record<string, any> = {
    name: input.name,
    agentIds: [],
    flowIds: [],
    policyIds: [],
  };

  // Only include optional fields if explicitly set (not undefined)
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

export async function getAgentReadiness(agentId: string) {
  const response = await fetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}/readiness`);
  return parseJson<{
    agentId: string;
    state: import('./types').AgentReadinessState;
    checks: Record<string, boolean>;
    missingFields: string[];
    score: number;
  }>(response);
}

export async function generateAgentCoreFiles(agentId: string) {
  const response = await fetch(`${API_BASE}/agents/${encodeURIComponent(agentId)}/core-files/generate`, {
    method: 'POST',
  });
  return parseJson<{
    artifacts: DeployPreview['artifacts'];
    diagnostics: string[];
    diff: DeployPreview['diff'];
  }>(response);
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

// ── Analytics Metrics ─────────────────────────────────────────────────────

function toMetricQuery(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H', granularity?: AnalyticsGranularity) {
  const params = new URLSearchParams({ level, id, window, granularity });
  if (!granularity) {
    params.delete('granularity');
  }
  return params.toString();
}

export async function getMetricsKpis(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/metrics/kpis?${params.toString()}`);
  return parseJson<MetricsKpisDto>(response);
}

export async function getMetricsRuns(
  level: CanonicalNodeLevel,
  id: string,
  window: AnalyticsWindow = '24H',
  granularity: AnalyticsGranularity = '1H',
) {
  const response = await fetch(`${API_BASE}/dashboard/metrics/runs?${toMetricQuery(level, id, window, granularity)}`);
  return parseJson<MetricsRunsDto>(response);
}

export async function getMetricsTokens(
  level: CanonicalNodeLevel,
  id: string,
  window: AnalyticsWindow = '24H',
  granularity: AnalyticsGranularity = '1H',
) {
  const response = await fetch(`${API_BASE}/dashboard/metrics/tokens?${toMetricQuery(level, id, window, granularity)}`);
  return parseJson<MetricsTokensDto>(response);
}

export async function getMetricsSessions(
  level: CanonicalNodeLevel,
  id: string,
  window: AnalyticsWindow = '24H',
  granularity: AnalyticsGranularity = '1H',
) {
  const response = await fetch(`${API_BASE}/dashboard/metrics/sessions?${toMetricQuery(level, id, window, granularity)}`);
  return parseJson<MetricsSessionsDto>(response);
}

export async function getMetricsBudget(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/metrics/budget?${params.toString()}`);
  return parseJson<MetricsBudgetDto>(response);
}

export async function getMetricsModelMix(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/metrics/model-mix?${params.toString()}`);
  return parseJson<MetricsModelMixDto>(response);
}

export async function getMetricsLatency(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/metrics/latency?${params.toString()}`);
  return parseJson<MetricsLatencyDto>(response);
}

export async function getMetricsSessionsHeatmap(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/metrics/sessions-heatmap?${params.toString()}`);
  return parseJson<MetricsSessionsHeatmapDto>(response);
}

export async function getMetricsRunsTokenCorrelation(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/metrics/runs-token-correlation?${params.toString()}`);
  return parseJson<MetricsRunsTokenCorrelationDto>(response);
}

export async function getMetricsBudgetForecast(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/metrics/budget-forecast?${params.toString()}`);
  return parseJson<MetricsBudgetForecastDto>(response);
}

export async function getMetricsCostAnomalyBands(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/metrics/cost-anomaly-bands?${params.toString()}`);
  return parseJson<MetricsCostAnomalyBandsDto>(response);
}

export async function getMetricsFallbackTransitions(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/metrics/fallback-transitions?${params.toString()}`);
  return parseJson<MetricsFallbackTransitionsDto>(response);
}

export async function getMetricsBudgetGuardrailSimulation(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/metrics/budget-guardrail-simulation?${params.toString()}`);
  return parseJson<MetricsBudgetGuardrailSimulationDto>(response);
}

// ── Connections Visuals ───────────────────────────────────────────────────

export async function getConnectionsMetering(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/connections/metering?${params.toString()}`);
  return parseJson<ConnectionsMeteringDto>(response);
}

export async function getConnectionsRadial(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/connections/radial?${params.toString()}`);
  return parseJson<ConnectionsRadialDto>(response);
}

export async function getConnectionsDependencyGraph(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/connections/dependency-graph?${params.toString()}`);
  return parseJson<ConnectionsDependencyGraphDto>(response);
}

export async function getConnectionsTopology(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/connections/topology?${params.toString()}`);
  return parseJson<ConnectionsTopologyDto>(response);
}

export async function getConnectionsFlowGraph(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/connections/flow-graph?${params.toString()}`);
  return parseJson<ConnectionsFlowGraphDto>(response);
}

export async function getConnectionsRoutingDecisionFlow(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/connections/routing-decision-flow?${params.toString()}`);
  return parseJson<ConnectionsRoutingDecisionFlowDto>(response);
}

export async function getConnectionsOrgChart(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/connections/org-chart?${params.toString()}`);
  return parseJson<ConnectionsOrgChartDto>(response);
}

export async function getConnectionsHierarchy(level: CanonicalNodeLevel, id: string, mode: 'sunburst' | 'treemap', window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window, mode });
  const response = await fetch(`${API_BASE}/dashboard/connections/hierarchy?${params.toString()}`);
  return parseJson<ConnectionsHierarchyDto>(response);
}

export async function getConnectionsEdgeReliability(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/connections/edge-reliability?${params.toString()}`);
  return parseJson<ConnectionsEdgeReliabilityDto>(response);
}

export async function getConnectionsHookBlastRadius(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/connections/hook-blast-radius?${params.toString()}`);
  return parseJson<ConnectionsHookBlastRadiusDto>(response);
}

export async function getConnectionsRoutingDrift(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/connections/routing-drift?${params.toString()}`);
  return parseJson<ConnectionsRoutingDriftDto>(response);
}

export async function getDashboardOperationsActionsHeatmap(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/operations/actions-heatmap?${params.toString()}`);
  return parseJson<OperationsActionsHeatmapDto>(response);
}

export async function getDashboardOperationsApprovalForecast(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/operations/approval-forecast?${params.toString()}`);
  return parseJson<OperationsApprovalForecastDto>(response);
}

export async function getDashboardOperationsPolicyConflicts(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/operations/policy-conflicts?${params.toString()}`);
  return parseJson<OperationsPolicyConflictsDto>(response);
}

export async function getDashboardOperationsRuntimeRecoverySimulation(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/dashboard/operations/runtime-recovery-simulation?${params.toString()}`);
  return parseJson<OperationsRuntimeRecoverySimulationDto>(response);
}

export async function getDashboardOperationsPendingActions(level: CanonicalNodeLevel, id: string) {
  const params = new URLSearchParams({ level, id });
  const response = await fetch(`${API_BASE}/dashboard/operations/pending-actions?${params.toString()}`);
  return parseJson<{ pendingActions: Array<{ id: string; type: string; message: string; severity: 'info' | 'warning' | 'critical' }> }>(response);
}

export async function getEditorReadiness(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/editor/readiness?${params.toString()}`);
  return parseJson<{
    scope: { level: CanonicalNodeLevel; id: string };
    state: string;
    data: Array<{ dimension: string; score: number }>;
  }>(response);
}

export async function getEditorSectionStatus(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/editor/section-status?${params.toString()}`);
  return parseJson<{
    scope: { level: CanonicalNodeLevel; id: string };
    state: string;
    data: Array<{ section: string; status: string }>;
  }>(response);
}

export async function getEditorInheritance(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/editor/inheritance?${params.toString()}`);
  return parseJson<{
    scope: { level: CanonicalNodeLevel; id: string };
    state: string;
    data: Array<{ field: string; source: string; effectiveValue: string }>;
  }>(response);
}

export async function getEditorVersions(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/editor/versions?${params.toString()}`);
  return parseJson<{
    scope: { level: CanonicalNodeLevel; id: string };
    window: string;
    state: string;
    data: Array<{ id: string; label: string; at: string; status: string }>;
  }>(response);
}

export async function getEditorReadinessByWorkspace(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/editor/readiness-by-workspace?${params.toString()}`);
  return parseJson<EditorReadinessByWorkspaceDto>(response);
}

export async function getEditorDependencies(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/editor/dependencies?${params.toString()}`);
  return parseJson<EditorDependenciesDto>(response);
}

export async function getEditorPromptGraph(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/editor/prompt-graph?${params.toString()}`);
  return parseJson<EditorPromptGraphDto>(response);
}

export async function getEditorSectionDependencyImpact(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/editor/section-dependency-impact?${params.toString()}`);
  return parseJson<EditorSectionDependencyImpactDto>(response);
}

export async function getEditorRollbackRisk(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/editor/rollback-risk?${params.toString()}`);
  return parseJson<EditorRollbackRiskDto>(response);
}

export async function getEditorSkillsTools(level: CanonicalNodeLevel, id: string, window: AnalyticsWindow = '24H') {
  const params = new URLSearchParams({ level, id, window });
  const response = await fetch(`${API_BASE}/editor/skills-tools?${params.toString()}`);
  return parseJson<EditorSkillsToolsDto>(response);
}

export async function patchEditorSkillsTools(input: {
  level: CanonicalNodeLevel;
  id: string;
  skills?: { select?: string[]; deselect?: string[]; require?: string[]; disable?: string[] };
  tools?: { select?: string[]; deselect?: string[]; require?: string[]; disable?: string[] };
}) {
  const response = await fetch(`${API_BASE}/editor/skills-tools`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson<{ ok: boolean; updatedAgentId?: string; message?: string }>(response);
}
