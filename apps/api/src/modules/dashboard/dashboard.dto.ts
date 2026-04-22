import type {
  CanonicalNodeLevel,
  ChannelBinding,
  ConnectionSpec,
  RuntimeCapabilityMatrix,
  RunSpec,
  SessionState,
  TopologyNodeRef,
  TopologyRuntimeAction,
  TopologyActionResult,
} from '../../../../../packages/core-types/src';

export interface ScopeDto {
  level: CanonicalNodeLevel;
  id: string;
}

export interface LineageItemDto {
  level: CanonicalNodeLevel;
  id: string;
  name: string;
}

export interface ScopeCapabilitiesDto {
  canOpenStudio: boolean;
  canUseProfileTab: boolean;
  canManageSettings: boolean;
  canRunOperations: boolean;
  sessionsMode: 'aggregated' | 'scoped';
  runsMode: 'aggregated' | 'scoped';
  topologyActions: TopologyRuntimeAction[];
}

export interface DashboardOverviewDto {
  scope: ScopeDto;
  lineage: LineageItemDto[];
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
  capabilities: ScopeCapabilitiesDto;
}

export interface DashboardConnectionsDto {
  scope: ScopeDto;
  lineage: LineageItemDto[];
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
  scope: ScopeDto;
  lineage: LineageItemDto[];
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
  scope: ScopeDto;
  lineage: LineageItemDto[];
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
  scope: ScopeDto;
  lineage: LineageItemDto[];
  mode: 'aggregated' | 'scoped';
  projection: 'dashboard_scoped_v1';
  total: number;
  runs: RunSpec[];
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

export interface RuntimeCommandResultDto {
  command: TopologyRuntimeAction;
  scope: ScopeDto;
  result: TopologyActionResult;
}

export interface BindProfileRequestDto {
  level: CanonicalNodeLevel;
  id: string;
  profileId: string;
}

export interface UnbindProfileRequestDto {
  level: CanonicalNodeLevel;
  id: string;
}

export interface ProfileOverrideRequestDto {
  level: CanonicalNodeLevel;
  id: string;
  overrides: {
    model?: string;
    skills?: string[];
    routines?: string[];
    tags?: string[];
  };
}

export interface RuntimeCommandRequestDto {
  level: CanonicalNodeLevel;
  id: string;
  action: TopologyRuntimeAction;
  target?: TopologyNodeRef;
}

export type ScopeResolvedEntity = {
  scope: ScopeDto;
  lineage: LineageItemDto[];
  capabilities: ScopeCapabilitiesDto;
  sessions: SessionState[];
  workspaceIds: string[];
  agentIds: string[];
};

