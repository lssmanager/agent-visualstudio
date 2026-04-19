import { AgentSpec, DeployPreview, EffectiveConfig, FlowSpec, HookSpec, RunSpec, SkillSpec, StudioStateResponse, VersionSnapshot, WorkspaceSpec } from './types';

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
  return parseJson<{ runId: string; flowId: string; status: string; steps: RunSpec['steps'] }>(response);
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
