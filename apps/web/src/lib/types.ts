// â”€â”€ Agent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Workspace â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Skill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface SkillSpec {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  permissions: string[];
  functions: Array<{ name: string; description: string }>;
}

// â”€â”€ Flow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type FlowNodeType =
  | 'trigger'
  | 'agent'
  | 'subagent'
  | 'skill'
  | 'tool'
  | 'condition'
  | 'handoff'
  | 'loop'
  | 'end'
  | 'approval';

export interface FlowNode {
  id: string;
  type: FlowNodeType | string;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface FlowSpec {
  id: string;
  name: string;
  trigger: string;
  isEnabled: boolean;
  nodes: FlowNode[];
  edges: Array<{ from: string; to: string; condition?: string }>;
}

// â”€â”€ Profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Run â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Effective Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Version Snapshot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface VersionSnapshot {
  id: string;
  workspaceId: string;
  label?: string;
  createdAt: string;
  parentId?: string;
  hash: string;
}

// â”€â”€ Deploy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface DeployPreview {
  artifacts: Array<{ id: string; name: string; path: string; type: string; content: string; sourceHash?: string }>;
  diagnostics: string[];
  diff: Array<{ path: string; status: 'added' | 'updated' | 'deleted' | 'unchanged'; before?: string; after?: string }>;
}

// â”€â”€ Studio State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// Canonical Studio
export type CanonicalNodeLevel = 'agency' | 'department' | 'workspace' | 'agent' | 'subagent';

export interface AgencySpec {
  id: string;
  name: string;
  description?: string;
  departmentIds: string[];
  tags: string[];
}

export interface DepartmentSpec {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  workspaceIds: string[];
  tags: string[];
}

export interface CanonicalWorkspaceSpec extends WorkspaceSpec {
  departmentId: string;
}

export type TopologyRuntimeAction =
  | 'connect'
  | 'disconnect'
  | 'pause'
  | 'reactivate'
  | 'redirect'
  | 'continue';

export interface TopologyNodeRef {
  level: CanonicalNodeLevel;
  id: string;
}

export interface ConnectionSpec {
  id: string;
  agencyId: string;
  from: TopologyNodeRef;
  to: TopologyNodeRef;
  state: 'connected' | 'disconnected' | 'paused';
  direction: 'unidirectional' | 'bidirectional';
  createdAt: string;
  updatedAt: string;
}

export interface ChannelBinding {
  id: string;
  channel: string;
  route: string;
  enabled: boolean;
  sourceLevel: CanonicalNodeLevel;
  sourceId: string;
}

export interface SessionRef {
  id: string;
  channel?: string;
  workspaceId?: string;
  departmentId?: string;
  agencyId?: string;
}

export interface SessionState {
  ref: SessionRef;
  status: 'active' | 'idle' | 'paused' | 'closed' | 'unknown';
  lastEventAt?: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeCapabilityMatrix {
  source: 'gateway_capabilities' | 'status_inference' | 'unknown';
  topology: {
    connect: boolean;
    disconnect: boolean;
    pause: boolean;
    reactivate: boolean;
    redirect: boolean;
    continue: boolean;
  };
  inspection: {
    sessions: boolean;
    channels: boolean;
    topology: boolean;
  };
}

export interface TopologyLinkState {
  linkId: string;
  runtimeState: 'connected' | 'disconnected' | 'paused' | 'unknown';
  runtimeSupported: boolean;
  lastObservedAt: string;
}

export interface CanonicalStudioStateResponse {
  agency: AgencySpec;
  departments: DepartmentSpec[];
  workspaces: CanonicalWorkspaceSpec[];
  agents: AgentSpec[];
  subagents: AgentSpec[];
  catalog: {
    skills: SkillSpec[];
    tools: Array<{ id: string; name: string; description: string }>;
  };
  flows: FlowSpec[];
  topology: {
    connections: ConnectionSpec[];
    links: TopologyLinkState[];
    failClosed: true;
    supportedActions: TopologyRuntimeAction[];
  };
  runtimeControl: {
    capabilityMatrix: RuntimeCapabilityMatrix;
    sessions: SessionState[];
    channelBindings: ChannelBinding[];
  };
  coreFiles: {
    targets: string[];
    supportedLifecycle: Array<'preview' | 'diff' | 'apply' | 'rollback'>;
  };
  runtime: StudioStateResponse['runtime'];
  compatibility: {
    strategy: 'compat_adapter';
    source: 'legacy_studio_state';
    adaptedAt: string;
  };
  generatedAt: string;
}

export interface TopologyActionResult {
  action: TopologyRuntimeAction;
  status: 'applied' | 'partial' | 'unsupported_by_runtime' | 'rejected';
  message: string;
  runtimeSupported: boolean;
  requestedAt: string;
  appliedAt?: string;
  errorCode?: string;
}

export interface CoreFilesPreviewResponse {
  artifacts: DeployPreview['artifacts'];
  diagnostics: string[];
  diff: DeployPreview['diff'];
  lifecycle: Array<'preview' | 'diff' | 'apply' | 'rollback'>;
}

export interface CoreFilesDiffResponse {
  ok: boolean;
  source: 'snapshot' | 'current';
  diffs?: Array<Record<string, unknown>>;
  error?: string;
}

export interface BuilderAgentFunctionOutput {
  entityId: string;
  entityLevel: CanonicalNodeLevel;
  entityName: string;
  whatItDoes: string;
  inputs: string[];
  outputs: string[];
  skills: string[];
  tools: string[];
  collaborators: string[];
  proposedCoreFileDiffs: DeployPreview['diff'];
}

export interface ReplayMetadataResponse {
  topologyEvents: Array<Record<string, unknown>>;
  handoffs: Array<Record<string, unknown>>;
  redirects: Array<Record<string, unknown>>;
  stateTransitions: Array<Record<string, unknown>>;
  replay: {
    sourceRunId?: string;
    replayType?: string;
  };
}

export type AgencyBuilderTab =
  | 'overview'
  | 'connections'
  | 'sessions'
  | 'profile'
  | 'settings'
  | 'topology'
  | 'structure'
  | 'routing'
  | 'hooks'
  | 'versions'
  | 'operations';

export interface DashboardScope {
  level: CanonicalNodeLevel;
  id: string;
}

export interface DashboardLineageItem {
  level: CanonicalNodeLevel;
  id: string;
  name: string;
}

export interface DashboardScopeCapabilities {
  canOpenStudio: boolean;
  canUseProfileTab: boolean;
  canManageSettings: boolean;
  canRunOperations: boolean;
  sessionsMode: 'aggregated' | 'scoped';
  runsMode: 'aggregated' | 'scoped';
  topologyActions: TopologyRuntimeAction[];
}

export interface DashboardOverviewDto {
  scope: DashboardScope;
  lineage: DashboardLineageItem[];
  kpis: {
    departments: number;
    workspaces: number;
    agents: number;
    subagents: number;
    profiles: number;
    skills: number;
    tools: number;
  };
  runtimeHealth: {
    ok: boolean;
    source: RuntimeCapabilityMatrix['source'];
    supportedTopologyActions: number;
  };
  sessionsSummary: {
    mode: 'aggregated' | 'scoped';
    total: number;
    active: number;
    paused: number;
  };
  runsSummary: {
    mode: 'aggregated' | 'scoped';
    total: number;
    running: number;
    waitingApproval: number;
    failed: number;
  };
  channelsSummary: {
    totalBindings: number;
    enabledBindings: number;
    uniqueChannels: string[];
  };
  hooksCoverage: {
    totalHooks: number;
    enabledHooks: number;
    eventsCovered: string[];
  };
  versionSummary: {
    totalSnapshots: number;
    latestSnapshotId: string | null;
    latestSnapshotAt: string | null;
    latestLabel: string | null;
  };
  capabilities: DashboardScopeCapabilities;
}

export interface DashboardConnectionsDto {
  scope: DashboardScope;
  lineage: DashboardLineageItem[];
  nodes: Array<{ id: string; level: CanonicalNodeLevel; label: string }>;
  edges: ConnectionSpec[];
  routingRules: Array<{ id: string; from: string; to: string; when: string; priority: number }>;
  channelBindings: ChannelBinding[];
  hookBindings: Array<{ id: string; event: string; action: string; enabled: boolean; priority?: number }>;
  dependencySummary: {
    totalEdges: number;
    connectedEdges: number;
    pausedEdges: number;
    disconnectedEdges: number;
  };
}

export interface DashboardInspectorDto {
  scope: DashboardScope;
  lineage: DashboardLineageItem[];
  entityMeta: {
    name: string;
    level: CanonicalNodeLevel;
    description?: string;
    owner?: string;
    tags: string[];
  };
  effectiveConfigSummary: {
    model: string | null;
    skills: string[];
    policies: string[];
    routingRules: number;
  };
  assignedProfiles: Array<{ id: string; name: string; source: 'binding' | 'workspace' }>;
  toolBindings: Array<{ id: string; name: string; source: 'catalog' | 'agent'; enabled: boolean }>;
  skillBindings: Array<{ id: string; name: string; source: 'catalog' | 'agent'; enabled: boolean }>;
  recentChanges: Array<{ at: string; type: string; message: string }>;
}

export interface DashboardOperationsDto {
  scope: DashboardScope;
  lineage: DashboardLineageItem[];
  recentRuns: Array<{
    id: string;
    flowId: string;
    status: string;
    startedAt: string;
    completedAt?: string;
    costUsd: number;
  }>;
  recentSessions: Array<{
    id: string;
    status: string;
    channel?: string;
    lastEventAt?: string;
  }>;
  pendingActions: Array<{ id: string; type: string; message: string; severity: 'info' | 'warning' | 'critical' }>;
  approvalQueue: Array<{ runId: string; stepId: string; nodeId: string; requestedAt: string }>;
  deploymentState: {
    latestSnapshots: Array<{ id: string; label?: string; createdAt: string }>;
    timeline: Array<{ at: string; type: 'diff' | 'apply' | 'rollback' | 'publish'; detail: string }>;
  };
}

export interface DashboardRunsDto {
  scope: DashboardScope;
  lineage: DashboardLineageItem[];
  mode: 'aggregated' | 'scoped';
  projection: 'dashboard_scoped_v1';
  total: number;
  runs: RunSpec[];
}

export interface ProfileTemplatesStateDto {
  status: 'planned';
  available: false;
  mode: 'read_only';
  decision?: 'excluded_from_v1';
  message: string;
  updatedAt: string;
}

export interface EffectiveProfileDto {
  catalogProfile: {
    id: string;
    name: string;
    description: string;
  } | null;
  appliedAtLevel: CanonicalNodeLevel | null;
  inheritedFrom: Array<{ level: CanonicalNodeLevel; id: string }>;
  overrides: {
    model?: string;
    skills?: string[];
    routines?: string[];
    tags?: string[];
  };
  effectiveModel: string | null;
  effectiveSkills: string[];
  effectiveRoutines: string[];
  effectiveTags: string[];
}

export type SurfaceId =
  | 'agency-builder'
  | 'workspace-studio'
  | 'entity-editor'
  | 'profiles'
  | 'runs'
  | 'sessions'
  | 'settings';

export interface SelectionState {
  selectedAgencyId: string | null;
  selectedDepartmentId: string | null;
  selectedWorkspaceId: string | null;
  selectedAgentId: string | null;
  selectedSubagentId: string | null;
  selectedSurface: SurfaceId;
  selectedBuilderTab: AgencyBuilderTab;
}
