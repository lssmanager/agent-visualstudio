// THIS FILE WAS GENERATED — original content of types.ts moved here so the
// barrel re-export in types.ts stays clean.
// If you're adding new shared types, add them directly to types.ts.

export interface WorkspaceSpec {
  id: string;
  name: string;
  slug: string;
  profileId: string | null;
  defaultModel: string | null;
  agentCount?: number;
  flowCount?: number;
  skillCount?: number;
}

export interface AgentSpec {
  id: string;
  workspaceId: string;
  name: string;
  role: string;
  model?: string;
  goal?: string;
  backstory?: string;
  tools?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FlowSpec {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  triggerType?: string;
  status?: string;
  nodes?: unknown[];
  edges?: unknown[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SkillSpec {
  id: string;
  workspaceId: string;
  name: string;
  type: string;
  description?: string;
  config?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProfileSpec {
  id: string;
  name: string;
  category?: string;
  description?: string;
  agentCount?: number;
  flowCount?: number;
  skillCount?: number;
}

export interface StudioState {
  workspace: WorkspaceSpec | null;
  workspaces: WorkspaceSpec[];
  agents: AgentSpec[];
  flows: FlowSpec[];
  skills: SkillSpec[];
  profiles: ProfileSpec[];
}
