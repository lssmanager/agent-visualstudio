export interface AgentSpec {
  id: string;
  workspaceId: string;
  name: string;
  role: string;
  description: string;
  instructions: string;
  model: string;
  skillRefs: string[];
  tags: string[];
  visibility: 'private' | 'workspace' | 'public';
  executionMode: 'direct' | 'orchestrated' | 'handoff';
  handoffRules: Array<{ id: string; targetAgentId: string; when: string; description?: string; priority?: number }>;
  channelBindings: Array<{ id: string; channel: string; route: string; enabled: boolean }>;
  isEnabled: boolean;
}

export interface WorkspaceSpec {
  id: string;
  slug: string;
  name: string;
  description?: string;
  owner?: string;
  defaultModel?: string;
  agentIds: string[];
  skillIds: string[];
  flowIds: string[];
  profileIds: string[];
  policyRefs: Array<{ id: string; scope: 'workspace' | 'agent' | 'flow'; targetId?: string }>;
  routingRules: Array<{ id: string; from: string; to: string; when: string; priority: number }>;
  routines: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SkillSpec {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  permissions: string[];
  functions: Array<{ name: string; description: string }>;
}

export interface FlowSpec {
  id: string;
  name: string;
  trigger: string;
  isEnabled: boolean;
  nodes: Array<{ id: string; type: string; config: Record<string, unknown>; position?: { x: number; y: number } }>;
  edges: Array<{ from: string; to: string; condition?: string }>;
}

export interface ProfileSpec {
  id: string;
  name: string;
  description: string;
  category?: string;
  defaultModel?: string;
  defaultSkills?: string[];
  routines?: string[];
  tags?: string[];
}

export interface DeployPreview {
  artifacts: Array<{ id: string; name: string; path: string; type: string; content: string; sourceHash?: string }>;
  diagnostics: string[];
  diff: Array<{ path: string; status: 'added' | 'updated' | 'deleted' | 'unchanged'; before?: string; after?: string }>;
}

export interface StudioStateResponse {
  workspace: WorkspaceSpec | null;
  agents: AgentSpec[];
  skills: SkillSpec[];
  flows: FlowSpec[];
  policies: Array<{ id: string; name: string }>;
  profiles: ProfileSpec[];
  compile: { artifacts: unknown[]; diagnostics: string[] };
  runtime: {
    health: { ok: boolean };
    diagnostics: Record<string, unknown>;
    sessions: { ok: boolean; payload?: unknown[] };
  };
}
