// ── Agent ───────────────────────────────────────────────────────────────

export type AgentKind = 'agent' | 'subagent' | 'orchestrator';

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
  kind?: AgentKind;
  parentAgentId?: string;
  context?: string[];
  triggers?: Array<{ type: 'event' | 'schedule' | 'manual' | 'webhook'; config?: Record<string, unknown> }>;
  permissions?: { tools?: string[]; channels?: string[]; models?: string[]; maxTokensPerTurn?: number };
  handoffRules: Array<{ id: string; targetAgentId: string; when: string; description?: string; priority?: number }>;
  channelBindings: Array<{ id: string; channel: string; route: string; enabled: boolean }>;
  isEnabled: boolean;
}

// ── Workspace ──────────────────────────────────────────────────────────

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

// ── Skill ──────────────────────────────────────────────────────────────

export interface SkillSpec {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  permissions: string[];
  functions: Array<{ name: string; description: string }>;
}

// ── Flow ───────────────────────────────────────────────────────────────

export type FlowNodeType = 'trigger' | 'agent' | 'tool' | 'condition' | 'approval' | 'end';

export interface FlowSpec {
  id: string;
  name: string;
  trigger: string;
  isEnabled: boolean;
  nodes: Array<{ id: string; type: FlowNodeType | string; config: Record<string, unknown>; position?: { x: number; y: number } }>;
  edges: Array<{ from: string; to: string; condition?: string }>;
}

// ── Profile ────────────────────────────────────────────────────────────

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

// ── Run ────────────────────────────────────────────────────────────────

export type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'skipped';

export interface RunStep {
  id: string;
  runId: string;
  nodeId: string;
  nodeType: string;
  status: StepStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  agentId?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  tokenUsage?: { input: number; output: number };
  costUsd?: number;
  retryCount?: number;
}

export interface RunSpec {
  id: string;
  workspaceId: string;
  flowId: string;
  status: RunStatus;
  trigger: { type: string; payload?: Record<string, unknown> };
  steps: RunStep[];
  startedAt: string;
  completedAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ── Hook ───────────────────────────────────────────────────────────────

export type HookEvent = 'before:run' | 'after:run' | 'before:step' | 'after:step' | 'on:error' | 'on:approval' | 'before:deploy' | 'after:deploy';
export type HookAction = 'log' | 'approval' | 'webhook' | 'notify' | 'block';

export interface HookSpec {
  id: string;
  event: HookEvent;
  action: HookAction;
  config: Record<string, unknown>;
  enabled: boolean;
  priority?: number;
}

// ── Effective Config ───────────────────────────────────────────────────

export interface EffectiveConfig {
  workspaceId: string;
  agentId?: string;
  resolvedModel: string;
  resolvedSkills: string[];
  resolvedPolicies: string[];
  resolvedRoutingRules: unknown[];
  source: {
    model: 'workspace' | 'profile' | 'agent';
    skills: 'workspace' | 'profile' | 'agent';
    policies: 'workspace' | 'profile' | 'agent';
  };
}

// ── Version Snapshot ───────────────────────────────────────────────────

export interface VersionSnapshot {
  id: string;
  workspaceId: string;
  label?: string;
  createdAt: string;
  parentId?: string;
  hash: string;
}

// ── Deploy ─────────────────────────────────────────────────────────────

export interface DeployPreview {
  artifacts: Array<{ id: string; name: string; path: string; type: string; content: string; sourceHash?: string }>;
  diagnostics: string[];
  diff: Array<{ path: string; status: 'added' | 'updated' | 'deleted' | 'unchanged'; before?: string; after?: string }>;
}

// ── Studio State ───────────────────────────────────────────────────────

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
  runs?: RunSpec[];
  hooks?: HookSpec[];
  effectiveConfig?: EffectiveConfig;
}
