import { AgentSpec, DeployPreview, FlowSpec, SkillSpec, StudioStateResponse, WorkspaceSpec } from './types';

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
