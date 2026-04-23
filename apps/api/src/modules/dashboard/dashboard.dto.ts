import type {
  PolicySpec,
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

export interface DashboardOperationsRuntimeStateDto {
  scope: ScopeDto;
  lineage: LineageItemDto[];
  runtimeState: 'online' | 'degraded' | 'offline';
  availableActions: TopologyRuntimeAction[];
  supportedByRuntime: boolean;
  recentSessions: DashboardOperationsDto['recentSessions'];
}

export interface DashboardOperationsRecentRunsDto {
  scope: ScopeDto;
  lineage: LineageItemDto[];
  recentRuns: DashboardOperationsDto['recentRuns'];
}

export interface DashboardOperationsAlertsDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  series: Array<{ ts: string; info: number; warning: number; critical: number }>;
  totals: { info: number; warning: number; critical: number };
}

export interface DashboardOperationsCostProfileDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  rows: Array<{
    model: string;
    role: 'primary' | 'fallback' | 'tool-overhead' | 'long-context' | 'other';
    spendUsd: number;
    sharePct: number;
  }>;
  totalSpendUsd: number;
}

export interface DashboardOperationsPendingActionsDto {
  scope: ScopeDto;
  lineage: LineageItemDto[];
  pendingActions: DashboardOperationsDto['pendingActions'];
  approvalQueue: DashboardOperationsDto['approvalQueue'];
}

export interface DashboardOperationsBudgetsDto {
  scope: ScopeDto;
  lineage: LineageItemDto[];
  mode: 'governance_v1_legacy_store';
  scopeFilterApplied: false;
  budgets: Array<{
    id: string;
    name: string;
    scope: 'workspace' | 'agent' | 'model';
    targetId?: string;
    limitUsd: number;
    periodDays: number;
    currentUsageUsd: number;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface DashboardOperationsPoliciesDto {
  scope: ScopeDto;
  lineage: LineageItemDto[];
  mode: 'governance_v1_legacy_store';
  scopeFilterApplied: false;
  policies: PolicySpec[];
}

export interface DashboardOperationsGovernanceStateDto {
  scope: ScopeDto;
  lineage: LineageItemDto[];
  mode: 'governance_v1_legacy_store';
  scopeFilterApplied: false;
  budgetsCount: number;
  policiesCount: number;
  message: string;
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

// ── Analytics Metrics DTOs ─────────────────────────────────────────────────

export interface TimeSeriesPoint { ts: string; value: number }
export type AnalyticsState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'runtime_offline'
  | 'runtime_degraded'
  | 'unsupported_for_scope'
  | 'planned_not_operational';

export interface AnalyticsMetaDto {
  warnings?: string[];
  source?: string;
}

export interface MetricsKpisDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  agents:   { current: number; delta: number; trend: TimeSeriesPoint[] };
  sessions: { current: number; delta: number; trend: TimeSeriesPoint[] };
  runs:     { current: number; delta: number; trend: TimeSeriesPoint[] };
  channels: { current: number; delta: number; trend: TimeSeriesPoint[] };
  running:       number;
  awaitingApproval: number;
  paused:        number;
  snapshots:     number;
}

export interface MetricsRunsDto {
  scope: ScopeDto;
  window: string;
  granularity: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  series: Array<{ ts: string; total: number; failed: number; errorRate: number }>;
  totals: { total: number; failed: number; errorRate: number };
}

export interface MetricsTokensDto {
  scope: ScopeDto;
  window: string;
  granularity: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  series: Array<{ ts: string; prompt: number; completion: number }>;
  totals: { prompt: number; completion: number };
}

export interface MetricsSessionsDto {
  scope: ScopeDto;
  window: string;
  granularity: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  series: Array<{ ts: string; active: number; completed: number }>;
  totals: { active: number; completed: number };
}

export interface MetricsBudgetDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  budgets: Array<{
    id: string;
    name: string;
    limitUsd: number;
    usedUsd: number;
    softCapUsd: number | null;
    hardCapUsd: number | null;
    pctUsed: number;
    status: 'ok' | 'warning' | 'critical';
    periodDays: number;
  }>;
  totalLimitUsd: number;
  totalUsedUsd: number;
}

export interface MetricsModelMixDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  models: Array<{ model: string; count: number; pct: number; costUsd: number }>;
}

export interface MetricsLatencyDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  models: Array<{ model: string; p50ms: number; p95ms: number }>;
}

export interface MetricsSessionsHeatmapDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  cells: Array<{ weekday: number; hour: number; sessions: number }>;
}

export interface MetricsRunsTokenCorrelationDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  points: Array<{ hourBucket: string; runs: number; tokens: number }>;
}

export interface MetricsBudgetForecastDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  currentSpendUsd: number;
  softCapUsd: number;
  hardCapUsd: number;
  projectedSoftCapAt: string | null;
  projectedHardCapAt: string | null;
}

export interface MetricsCostAnomalyBandsDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  points: Array<{ ts: string; spendUsd: number; baselineUsd: number; upperBandUsd: number; lowerBandUsd: number; anomalyScore: number }>;
}

export interface MetricsFallbackTransitionsDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  transitions: Array<{ ts: string; fromModel: string; toModel: string; reason: 'latency' | 'error' | 'policy' | 'manual' | 'unknown' }>;
}

export interface MetricsBudgetGuardrailSimulationDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  scenarios: Array<{ scenario: 'current' | 'soft_cap_minus_10' | 'hard_cap_minus_10'; projectedDaysToSoftCap: number | null; projectedDaysToHardCap: number | null }>;
}

export interface ConnectionsMeteringDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  meters: {
    supportedEdges:    { value: number; max: number; pct: number };
    hookCoverage:      { value: number; max: number; pct: number };
    routingStability:  { value: number; max: number; pct: number };
    handoffPressure:   { value: number; max: number; pct: number };
  };
}

export interface ConnectionsRadialDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  edges:    { total: number; connected: number; paused: number; disconnected: number };
  hooks:    { total: number; enabled: number };
  channels: { total: number; enabled: number };
}

export interface GraphNode { id: string; label: string; type: string; x?: number; y?: number; meta?: string }
export interface GraphEdge { from: string; to: string; label?: string; weight?: number }

export interface ConnectionsDependencyGraphDto {
  scope: ScopeDto;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ConnectionsTopologyDto {
  scope: ScopeDto;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ConnectionsFlowGraphDto {
  scope: ScopeDto;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  nodes: Array<{ id: string; label: string; value: number }>;
  links: Array<{ source: string; target: string; value: number }>;
}

export interface ConnectionsRoutingDecisionFlowDto {
  scope: ScopeDto;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  steps: Array<{ id: string; label: string; outcome: 'ok' | 'warning' | 'critical'; volume: number }>;
  links: Array<{ from: string; to: string; condition: string }>;
}

export interface ConnectionsOrgChartDto {
  scope: ScopeDto;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  nodes: Array<{ id: string; parentId: string | null; level: CanonicalNodeLevel; label: string; activity: number }>;
}

export interface ConnectionsHierarchyDto {
  scope: ScopeDto;
  window: string;
  mode: 'sunburst' | 'treemap';
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  nodes: Array<{ id: string; parentId: string | null; label: string; level: CanonicalNodeLevel; value: number }>;
}

export interface ConnectionsEdgeReliabilityDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  edges: Array<{ from: string; to: string; successPct: number; failureCount: number; confidencePct: number }>;
}

export interface ConnectionsHookBlastRadiusDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  hooks: Array<{ hookId: string; event: string; impactedNodes: number; riskScore: number }>;
}

export interface ConnectionsRoutingDriftDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  rules: Array<{ ruleId: string; baselineTarget: string; currentTarget: string; drifted: boolean; driftScore: number }>;
}

export interface OperationsActionsHeatmapDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  rows: Array<{ scopeLabel: string; connect: number; disconnect: number; pause: number; reactivate: number; redirect: number; continue: number }>;
}

export interface OperationsApprovalForecastDto {
  scope: ScopeDto;
  window: string;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  currentQueue: number;
  dailyInflow: number;
  dailyOutflow: number;
  projectedQueueIn7d: number;
}

export interface OperationsPolicyConflictsDto {
  scope: ScopeDto;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  conflicts: Array<{ policyA: string; policyB: string; reason: string; severity: 'warning' | 'critical' }>;
}

export interface OperationsRuntimeRecoverySimulationDto {
  scope: ScopeDto;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  steps: Array<{ from: 'offline' | 'degraded' | 'online'; to: 'offline' | 'degraded' | 'online'; estimatedMinutes: number; successPct: number }>;
}

export interface EditorReadinessDto {
  scope: ScopeDto;
  state: AnalyticsState;
  data: Array<{ dimension: 'Identity' | 'Behavior' | 'Assignment' | 'Versions' | 'Catalog' | 'Operations'; score: number }>;
  meta?: AnalyticsMetaDto;
}

export interface EditorSectionStatusDto {
  scope: ScopeDto;
  state: AnalyticsState;
  data: Array<{ section: string; status: 'complete' | 'in_progress' | 'blocked' | 'planned' }>;
  meta?: AnalyticsMetaDto;
}

export interface EditorInheritanceDto {
  scope: ScopeDto;
  state: AnalyticsState;
  data: Array<{ field: string; source: 'inherited' | 'local_override' | 'locked'; effectiveValue: string }>;
  meta?: AnalyticsMetaDto;
}

export interface EditorVersionsDto {
  scope: ScopeDto;
  window: string;
  state: AnalyticsState;
  data: Array<{ id: string; label: string; at: string; status: 'current' | 'draft' | 'snapshot' }>;
  meta?: AnalyticsMetaDto;
}

export interface EditorReadinessByWorkspaceDto {
  scope: ScopeDto;
  state: AnalyticsState;
  meta?: AnalyticsMetaDto;
  data: Array<{ workspaceId: string; workspaceName: string; readinessPct: number; missingSections: number }>;
}

export interface EditorDependenciesDto {
  scope: ScopeDto;
  state: AnalyticsState;
  meta?: AnalyticsMetaDto;
  nodes: Array<{ id: string; label: string; type: 'agent' | 'subagent' | 'workspace' | 'skill' | 'tool' }>;
  edges: Array<{ from: string; to: string; kind: 'depends_on' | 'uses' | 'inherits' }>;
}

export interface EditorPromptGraphDto {
  scope: ScopeDto;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  nodes: Array<{ id: string; label: string; type: 'system' | 'behavior' | 'tooling' | 'guardrail' }>;
  edges: Array<{ from: string; to: string; weight: number }>;
}

export interface EditorSectionDependencyImpactDto {
  scope: ScopeDto;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  rows: Array<{ section: string; dependsOn: string[]; impactScore: number }>;
}

export interface EditorRollbackRiskDto {
  scope: ScopeDto;
  state?: AnalyticsState;
  meta?: AnalyticsMetaDto;
  versions: Array<{ versionId: string; label: string; riskScore: number; reasons: string[] }>;
}

export type EditorCatalogItemSource = 'profile' | 'agency' | 'workspace' | 'global' | 'local';
export type EditorCatalogItemState = 'available' | 'selected' | 'required' | 'blocked' | 'disabled';

export interface EditorSkillsToolsItemDto {
  id: string;
  name: string;
  description?: string;
  type?: string;
  source: EditorCatalogItemSource;
  state: EditorCatalogItemState;
  blockedReason?: string;
}

export interface EditorSkillsToolsDto {
  scope: ScopeDto;
  sources: {
    profileDefaults: string[];
    agencyEnabled: string[];
    inherited: string[];
    localOverrides: string[];
  };
  skills: EditorSkillsToolsItemDto[];
  tools: EditorSkillsToolsItemDto[];
  effective: {
    skills: string[];
    tools: string[];
  };
}

export interface EditorSkillsToolsPatchDto {
  level: CanonicalNodeLevel;
  id: string;
  skills?: {
    select?: string[];
    deselect?: string[];
    require?: string[];
    disable?: string[];
  };
  tools?: {
    select?: string[];
    deselect?: string[];
    require?: string[];
    disable?: string[];
  };
}
