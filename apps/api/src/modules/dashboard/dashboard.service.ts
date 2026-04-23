import type { CanonicalStudioState, TopologyRuntimeAction } from '../../../../../packages/core-types/src';

import { HooksService } from '../hooks/hooks.service';
import { BudgetsService } from '../budgets/budgets.service';
import { PoliciesService } from '../policies/policies.service';
import { RoutingService } from '../routing/routing.service';
import { RunsService } from '../runs/runs.service';
import { StudioService } from '../studio/studio.service';
import { TopologyService } from '../topology/topology.service';
import { VersionsService } from '../versions/versions.service';
import type {
  DashboardConnectionsDto,
  DashboardInspectorDto,
  DashboardOperationsDto,
  DashboardOperationsPendingActionsDto,
  DashboardOperationsBudgetsDto,
  DashboardOperationsPoliciesDto,
  DashboardOperationsGovernanceStateDto,
  DashboardOperationsRecentRunsDto,
  DashboardOperationsRuntimeStateDto,
  DashboardOverviewDto,
  DashboardRunsDto,
  RuntimeCommandRequestDto,
  RuntimeCommandResultDto,
  MetricsKpisDto,
  MetricsRunsDto,
  MetricsTokensDto,
  MetricsSessionsDto,
  MetricsBudgetDto,
  MetricsModelMixDto,
  MetricsLatencyDto,
  ConnectionsMeteringDto,
  ConnectionsRadialDto,
  ConnectionsDependencyGraphDto,
  ConnectionsTopologyDto,
  ConnectionsFlowGraphDto,
  EditorInheritanceDto,
  EditorReadinessDto,
  EditorSectionStatusDto,
  EditorVersionsDto,
  TimeSeriesPoint,
} from './dashboard.dto';
import type { MetricsQueryDto } from './dto/metrics-query.dto';
import { DashboardProfileService } from './profile-system.service';
import { DashboardScopeResolver } from './scope-resolver.service';

export class DashboardService {
  private readonly studioService = new StudioService();
  private readonly scopeResolver = new DashboardScopeResolver();
  private readonly runsService = new RunsService();
  private readonly hooksService = new HooksService();
  private readonly budgetsService = new BudgetsService();
  private readonly policiesService = new PoliciesService();
  private readonly routingService = new RoutingService();
  private readonly versionsService = new VersionsService();
  private readonly profileService = new DashboardProfileService();
  private readonly topologyService = new TopologyService();

  async getOverview(input: { level?: string; id?: string }): Promise<DashboardOverviewDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const hooks = this.hooksService.findAll();
    const runs = this.filterRunsByScope(canonical, resolved.workspaceIds, resolved.agentIds);
    const versions = this.versionsService.listSnapshots();

    const activeSessions = resolved.sessions.filter((item) => item.status === 'active').length;
    const pausedSessions = resolved.sessions.filter((item) => item.status === 'paused').length;

    return {
      scope: resolved.scope,
      lineage: resolved.lineage,
      kpis: {
        departments: this.countDepartments(canonical, resolved.workspaceIds),
        workspaces: resolved.workspaceIds.length,
        agents: this.countAgents(canonical, resolved.workspaceIds),
        subagents: this.countSubagents(canonical, resolved.workspaceIds),
        profiles: (await this.profileService.getCatalog()).length,
        skills: canonical.catalog.skills.length,
        tools: canonical.catalog.tools.length,
      },
      runtimeHealth: {
        ok: Boolean(canonical.runtime.health.ok),
        source: canonical.runtimeControl.capabilityMatrix.source,
        supportedTopologyActions: canonical.topology.supportedActions.length,
      },
      sessionsSummary: {
        mode: resolved.capabilities.sessionsMode,
        total: resolved.sessions.length,
        active: activeSessions,
        paused: pausedSessions,
      },
      runsSummary: {
        mode: resolved.capabilities.runsMode,
        total: runs.length,
        running: runs.filter((item) => item.status === 'running').length,
        waitingApproval: runs.filter((item) => item.status === 'waiting_approval').length,
        failed: runs.filter((item) => item.status === 'failed').length,
      },
      channelsSummary: {
        totalBindings: this.filterChannelBindings(canonical, resolved.workspaceIds, resolved.agentIds).length,
        enabledBindings: this.filterChannelBindings(canonical, resolved.workspaceIds, resolved.agentIds).filter((item) => item.enabled).length,
        uniqueChannels: [
          ...new Set(this.filterChannelBindings(canonical, resolved.workspaceIds, resolved.agentIds).map((item) => item.channel)),
        ],
      },
      hooksCoverage: {
        totalHooks: hooks.length,
        enabledHooks: hooks.filter((item) => item.enabled).length,
        eventsCovered: [...new Set(hooks.filter((item) => item.enabled).map((item) => item.event))],
      },
      versionSummary: {
        totalSnapshots: versions.length,
        latestSnapshotId: versions[0]?.id ?? null,
        latestSnapshotAt: versions[0]?.createdAt ?? null,
        latestLabel: versions[0]?.label ?? null,
      },
      capabilities: resolved.capabilities,
    };
  }

  async getConnections(input: { level?: string; id?: string }): Promise<DashboardConnectionsDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);

    const edges = this.filterConnections(canonical, resolved.workspaceIds, resolved.agentIds, resolved.scope);
    const routing = this.routingService.getCompiledRouting();
    const hooks = this.hooksService.findAll();

    const nodeMap = new Map<string, { id: string; level: any; label: string }>();
    for (const edge of edges) {
      nodeMap.set(`${edge.from.level}:${edge.from.id}`, {
        id: edge.from.id,
        level: edge.from.level,
        label: this.resolveNodeLabel(canonical, edge.from.level, edge.from.id),
      });
      nodeMap.set(`${edge.to.level}:${edge.to.id}`, {
        id: edge.to.id,
        level: edge.to.level,
        label: this.resolveNodeLabel(canonical, edge.to.level, edge.to.id),
      });
    }

    return {
      scope: resolved.scope,
      lineage: resolved.lineage,
      nodes: Array.from(nodeMap.values()),
      edges,
      routingRules: routing.rules.map((r: any) => ({
        id: r.id,
        from: r.from,
        to: r.to,
        when: r.when,
        priority: typeof r.priority === 'number' ? r.priority : 0,
      })),
      channelBindings: this.filterChannelBindings(canonical, resolved.workspaceIds, resolved.agentIds),
      hookBindings: hooks.map((item) => ({
        id: item.id,
        event: item.event,
        action: item.action,
        enabled: item.enabled,
        priority: item.priority,
      })),
      dependencySummary: {
        totalEdges: edges.length,
        connectedEdges: edges.filter((item) => item.state === 'connected').length,
        pausedEdges: edges.filter((item) => item.state === 'paused').length,
        disconnectedEdges: edges.filter((item) => item.state === 'disconnected').length,
      },
    };
  }

  async getInspector(input: { level?: string; id?: string }): Promise<DashboardInspectorDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const effectiveProfile = await this.profileService.getEffectiveProfile(resolved.scope, resolved.lineage);

    const entityLabel = this.resolveNodeLabel(canonical, resolved.scope.level, resolved.scope.id);
    const workspace = this.resolveWorkspace(canonical, resolved.scope, resolved.workspaceIds);
    const agent = canonical.agents.find((item) => item.id === resolved.scope.id) ?? canonical.subagents.find((item) => item.id === resolved.scope.id) ?? null;

    return {
      scope: resolved.scope,
      lineage: resolved.lineage,
      entityMeta: {
        name: entityLabel,
        level: resolved.scope.level,
        description: workspace?.description ?? agent?.description,
        owner: workspace?.owner,
        tags: workspace?.tags ?? agent?.tags ?? [],
      },
      effectiveConfigSummary: {
        model: effectiveProfile.effectiveModel ?? workspace?.defaultModel ?? agent?.model ?? null,
        skills: effectiveProfile.effectiveSkills.length > 0 ? effectiveProfile.effectiveSkills : agent?.skillRefs ?? [],
        policies: [],
        routingRules: workspace?.routingRules?.length ?? 0,
      },
      assignedProfiles: effectiveProfile.catalogProfile
        ? [
            {
              id: effectiveProfile.catalogProfile.id,
              name: effectiveProfile.catalogProfile.name,
              source: 'binding',
            },
          ]
        : (workspace?.profileIds ?? []).map((id) => ({ id, name: id, source: 'workspace' as const })),
      toolBindings: canonical.catalog.tools.map((item) => ({
        id: item.id,
        name: item.name,
        source: 'catalog' as const,
        enabled: true,
      })),
      skillBindings: canonical.catalog.skills.map((item) => ({
        id: item.id,
        name: item.name,
        source: agent?.skillRefs?.includes(item.id) ? ('agent' as const) : ('catalog' as const),
        enabled: true,
      })),
      recentChanges: [
        {
          at: canonical.generatedAt,
          type: 'scope-refresh',
          message: `Inspector refreshed for ${resolved.scope.level}:${resolved.scope.id}`,
        },
      ],
    };
  }

  async getOperations(input: { level?: string; id?: string }): Promise<DashboardOperationsDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const runs = this.filterRunsByScope(canonical, resolved.workspaceIds, resolved.agentIds);

    const recentRuns = runs
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 12)
      .map((run) => ({
        id: run.id,
        flowId: run.flowId,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        costUsd: run.steps.reduce((sum, step) => sum + (step.costUsd ?? 0), 0),
      }));

    const approvalQueue = runs.flatMap((run) =>
      run.steps
        .filter((step) => step.status === 'waiting_approval')
        .map((step) => ({
          runId: run.id,
          stepId: step.id,
          nodeId: step.nodeId,
          requestedAt: step.startedAt ?? run.startedAt,
        })),
    );

    const versions = this.versionsService.listSnapshots();

    return {
      scope: resolved.scope,
      lineage: resolved.lineage,
      recentRuns,
      recentSessions: resolved.sessions
        .slice(0, 12)
        .map((session) => ({
          id: session.ref.id,
          status: session.status,
          channel: session.ref.channel,
          lastEventAt: session.lastEventAt,
        })),
      pendingActions: this.buildPendingActions(canonical, approvalQueue.length),
      approvalQueue,
      deploymentState: {
        latestSnapshots: versions.slice(0, 5).map((item) => ({
          id: item.id,
          label: item.label,
          createdAt: item.createdAt,
        })),
        timeline: versions.slice(0, 8).map((item, index) => ({
          at: item.createdAt,
          type: index === 0 ? 'publish' : 'diff',
          detail: item.label ? `Snapshot ${item.label}` : `Snapshot ${item.id}`,
        })),
      },
    };
  }

  async getOperationsRuntimeState(input: { level?: string; id?: string }): Promise<DashboardOperationsRuntimeStateDto> {
    const operations = await this.getOperations(input);
    return {
      scope: operations.scope,
      lineage: operations.lineage,
      recentSessions: operations.recentSessions,
    };
  }

  async getOperationsRecentRuns(input: { level?: string; id?: string }): Promise<DashboardOperationsRecentRunsDto> {
    const operations = await this.getOperations(input);
    return {
      scope: operations.scope,
      lineage: operations.lineage,
      recentRuns: operations.recentRuns,
    };
  }

  async getOperationsPendingActions(input: { level?: string; id?: string }): Promise<DashboardOperationsPendingActionsDto> {
    const operations = await this.getOperations(input);
    return {
      scope: operations.scope,
      lineage: operations.lineage,
      pendingActions: operations.pendingActions,
      approvalQueue: operations.approvalQueue,
    };
  }

  async getOperationsBudgets(input: { level?: string; id?: string }): Promise<DashboardOperationsBudgetsDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    return {
      scope: resolved.scope,
      lineage: resolved.lineage,
      mode: 'governance_v1_legacy_store',
      scopeFilterApplied: false,
      budgets: this.budgetsService.findAll(),
    };
  }

  async getOperationsPolicies(input: { level?: string; id?: string }): Promise<DashboardOperationsPoliciesDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    return {
      scope: resolved.scope,
      lineage: resolved.lineage,
      mode: 'governance_v1_legacy_store',
      scopeFilterApplied: false,
      policies: this.policiesService.findAll(),
    };
  }

  async getOperationsGovernanceState(input: { level?: string; id?: string }): Promise<DashboardOperationsGovernanceStateDto> {
    const budgetsProjection = await this.getOperationsBudgets(input);
    const policiesProjection = await this.getOperationsPolicies(input);
    return {
      scope: budgetsProjection.scope,
      lineage: budgetsProjection.lineage,
      mode: 'governance_v1_legacy_store',
      scopeFilterApplied: false,
      budgetsCount: budgetsProjection.budgets.length,
      policiesCount: policiesProjection.policies.length,
      message:
        'Governance store is active in V1 legacy mode: data is available for Operations surfaces while scope-filtered inheritance is pending.',
    };
  }

  async getRuns(input: { level?: string; id?: string }, options?: { limit?: number }): Promise<DashboardRunsDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const safeLimit =
      typeof options?.limit === 'number' && Number.isFinite(options.limit)
        ? Math.max(1, Math.min(Math.floor(options.limit), 200))
        : undefined;

    const scopedRuns = this.filterRunsByScope(canonical, resolved.workspaceIds, resolved.agentIds)
      .slice()
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    return {
      scope: resolved.scope,
      lineage: resolved.lineage,
      mode: resolved.capabilities.runsMode,
      projection: 'dashboard_scoped_v1',
      total: scopedRuns.length,
      runs: safeLimit ? scopedRuns.slice(0, safeLimit) : scopedRuns,
    };
  }

  async getEffectiveProfile(input: { level?: string; id?: string }) {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    return this.profileService.getEffectiveProfile(resolved.scope, resolved.lineage);
  }

  bindProfile(input: { level: any; id: string; profileId: string }) {
    return this.profileService.bindProfile(input);
  }

  unbindProfile(input: { level: any; id: string }) {
    return this.profileService.unbindProfile(input);
  }

  setProfileOverride(input: { level: any; id: string; overrides: { model?: string; skills?: string[]; routines?: string[]; tags?: string[] } }) {
    return this.profileService.setOverride(input);
  }

  async executeRuntimeCommand(input: RuntimeCommandRequestDto): Promise<RuntimeCommandResultDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);

    const from = { level: resolved.scope.level, id: resolved.scope.id };
    const target = input.target;
    const action = input.action as TopologyRuntimeAction;

    const result = await this.topologyService.executeAction(action, {
      from,
      to: target,
      metadata: {
        source: 'dashboard.operations',
      },
    });

    return {
      command: action,
      scope: resolved.scope,
      result,
    };
  }

  private resolveNodeLabel(canonical: CanonicalStudioState, level: string, id: string): string {
    if (level === 'agency') return canonical.agency.name;
    if (level === 'department') return canonical.departments.find((item) => item.id === id)?.name ?? id;
    if (level === 'workspace') return canonical.workspaces.find((item) => item.id === id)?.name ?? id;
    if (level === 'agent') return canonical.agents.find((item) => item.id === id)?.name ?? id;
    return canonical.subagents.find((item) => item.id === id)?.name ?? id;
  }

  private resolveWorkspace(canonical: CanonicalStudioState, scope: { level: string; id: string }, workspaceIds: string[]) {
    if (scope.level === 'workspace') {
      return canonical.workspaces.find((item) => item.id === scope.id) ?? null;
    }
    return canonical.workspaces.find((item) => workspaceIds.includes(item.id)) ?? null;
  }

  private filterConnections(canonical: CanonicalStudioState, workspaceIds: string[], agentIds: string[], scope: { level: string; id: string }) {
    const workspaceSet = new Set(workspaceIds);
    const agentSet = new Set(agentIds);

    if (scope.level === 'agency') {
      return canonical.topology.connections;
    }

    if (scope.level === 'department') {
      return canonical.topology.connections.filter(
        (item) =>
          item.from.id === scope.id ||
          item.to.id === scope.id ||
          workspaceSet.has(item.from.id) ||
          workspaceSet.has(item.to.id),
      );
    }

    if (scope.level === 'workspace') {
      return canonical.topology.connections.filter(
        (item) => item.from.id === scope.id || item.to.id === scope.id || workspaceSet.has(item.from.id) || workspaceSet.has(item.to.id),
      );
    }

    return canonical.topology.connections.filter(
      (item) => agentSet.has(item.from.id) || agentSet.has(item.to.id),
    );
  }

  private filterChannelBindings(canonical: CanonicalStudioState, workspaceIds: string[], agentIds: string[]) {
    const workspaceSet = new Set(workspaceIds);
    const agentSet = new Set(agentIds);

    return canonical.runtimeControl.channelBindings.filter((binding) => {
      if (binding.sourceLevel === 'workspace') {
        return workspaceSet.has(binding.sourceId);
      }
      if (binding.sourceLevel === 'agent' || binding.sourceLevel === 'subagent') {
        return agentSet.has(binding.sourceId);
      }
      return true;
    });
  }

  private filterRunsByScope(canonical: CanonicalStudioState, workspaceIds: string[], agentIds: string[]) {
    const workspaceSet = new Set(workspaceIds);
    const agentSet = new Set(agentIds);
    return this.runsService.findAll().filter((run) =>
      workspaceSet.has(run.workspaceId) || run.steps.some((step) => step.agentId && agentSet.has(step.agentId)),
    );
  }

  private countDepartments(canonical: CanonicalStudioState, workspaceIds: string[]) {
    const workspaceSet = new Set(workspaceIds);
    return canonical.departments.filter((item) => item.workspaceIds.some((id) => workspaceSet.has(id))).length;
  }

  private countAgents(canonical: CanonicalStudioState, workspaceIds: string[]) {
    const workspaceSet = new Set(workspaceIds);
    return canonical.agents.filter((item) => workspaceSet.has(item.workspaceId)).length;
  }

  private countSubagents(canonical: CanonicalStudioState, workspaceIds: string[]) {
    const workspaceSet = new Set(workspaceIds);
    return canonical.subagents.filter((item) => workspaceSet.has(item.workspaceId)).length;
  }

  private buildPendingActions(canonical: CanonicalStudioState, pendingApprovals: number) {
    const pending: DashboardOperationsDto['pendingActions'] = [];

    if (!canonical.runtime.health.ok) {
      pending.push({
        id: 'runtime-health',
        type: 'runtime',
        severity: 'critical',
        message: 'Runtime health is degraded. Verify gateway and active adapters.',
      });
    }

    if (pendingApprovals > 0) {
      pending.push({
        id: 'approval-queue',
        type: 'approval',
        severity: 'warning',
        message: `${pendingApprovals} step(s) waiting for approval.`,
      });
    }

    if (canonical.topology.supportedActions.length === 0) {
      pending.push({
        id: 'runtime-capability',
        type: 'capability',
        severity: 'info',
        message: 'Runtime topology actions are unavailable for current adapter.',
      });
    }

    return pending;
  }

  // ── Analytics Metrics ─────────────────────────────────────────────────────

  private windowPoints(window: string): number {
    const map: Record<string, number> = { '1H': 12, '4H': 16, '6H': 12, '8H': 16, '12H': 12, '24H': 24, '3D': 18, '7D': 28, '15D': 30, '1M': 30, '2M': 24, '3M': 36, '1Y': 52 };
    return map[window] ?? 24;
  }

  private windowMs(window: string): number {
    const map: Record<string, number> = {
      '1H': 3600e3,
      '4H': 4 * 3600e3,
      '6H': 6 * 3600e3,
      '8H': 8 * 3600e3,
      '12H': 12 * 3600e3,
      '24H': 24 * 3600e3,
      '3D': 3 * 86400e3,
      '7D': 7 * 86400e3,
      '15D': 15 * 86400e3,
      '1M': 30 * 86400e3,
      '2M': 60 * 86400e3,
      '3M': 90 * 86400e3,
      '1Y': 365 * 86400e3,
    };
    return map[window] ?? 24 * 3600e3;
  }

  private buildTimeline(window: string): string[] {
    const points = this.windowPoints(window);
    const now = Date.now();
    const windowMs = this.windowMs(window);
    const start = now - windowMs;
    const step = windowMs / Math.max(points - 1, 1);
    return Array.from({ length: points }, (_, i) => new Date(start + i * step).toISOString());
  }

  private analyticsState(runtimeOk: boolean, hasData: boolean): 'ready' | 'runtime_degraded' | 'empty' {
    if (!runtimeOk) {
      return 'runtime_degraded';
    }
    return hasData ? 'ready' : 'empty';
  }

  private seriesFromEvents(timeline: string[], eventTimes: string[]): number[] {
    const values = Array.from({ length: timeline.length }, () => 0);
    const starts = timeline.map((ts) => new Date(ts).getTime());
    for (const eventTime of eventTimes) {
      const time = new Date(eventTime).getTime();
      if (!Number.isFinite(time)) {
        continue;
      }
      let idx = starts.findIndex((t, i) => time >= t && (i === starts.length - 1 || time < starts[i + 1]));
      if (idx === -1 && time >= starts[starts.length - 1]) {
        idx = starts.length - 1;
      }
      if (idx >= 0) {
        values[idx] += 1;
      }
    }
    return values;
  }

  private toTrend(timeline: string[], values: number[]): TimeSeriesPoint[] {
    return timeline.map((ts, idx) => ({ ts, value: values[idx] ?? 0 }));
  }

  private rollingSum(values: number[]): number[] {
    let acc = 0;
    return values.map((value) => {
      acc += value;
      return acc;
    });
  }

  async getMetricsKpis(input: MetricsQueryDto, warnings: string[] = []): Promise<MetricsKpisDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const timeline = this.buildTimeline(input.window);
    const agents = this.countAgents(canonical, resolved.workspaceIds);
    const channels = resolved.sessions.filter((session) => Boolean((session as any).channel)).length;
    const runs = this.filterRunsByScope(canonical, resolved.workspaceIds, resolved.agentIds);
    const snapshots = this.versionsService.listSnapshots().length;
    const runCounts = this.seriesFromEvents(
      timeline,
      runs.map((run) => run.startedAt).filter(Boolean) as string[],
    );
    const sessionCounts = this.seriesFromEvents(
      timeline,
      resolved.sessions.map((session) => session.lastEventAt).filter(Boolean) as string[],
    );
    const runTrend = this.toTrend(timeline, this.rollingSum(runCounts));
    const sessionTrend = this.toTrend(timeline, this.rollingSum(sessionCounts));
    const runtimeOk = Boolean(canonical.runtime.health.ok);

    return {
      scope: resolved.scope,
      window: input.window,
      state: this.analyticsState(runtimeOk, runs.length > 0 || resolved.sessions.length > 0),
      meta: { warnings, source: 'canonical_runtime' },
      agents: { current: agents, delta: 0, trend: this.toTrend(timeline, Array.from({ length: timeline.length }, () => agents)) },
      sessions: { current: resolved.sessions.length, delta: 0, trend: sessionTrend },
      runs: { current: runs.length, delta: 0, trend: runTrend },
      channels: { current: channels, delta: 0, trend: this.toTrend(timeline, Array.from({ length: timeline.length }, () => channels)) },
      running: runs.filter((run) => run.status === 'running').length,
      awaitingApproval: runs.filter((run) => run.status === 'waiting_approval').length,
      paused: resolved.sessions.filter((session) => session.status === 'paused').length,
      snapshots,
    };
  }

  async getMetricsRuns(input: MetricsQueryDto, warnings: string[] = []): Promise<MetricsRunsDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const timeline = this.buildTimeline(input.window);
    const runs = this.filterRunsByScope(canonical, resolved.workspaceIds, resolved.agentIds);
    const totalSeries = this.seriesFromEvents(
      timeline,
      runs.map((run) => run.startedAt).filter(Boolean) as string[],
    );
    const failedSeries = this.seriesFromEvents(
      timeline,
      runs.filter((run) => run.status === 'failed').map((run) => run.startedAt).filter(Boolean) as string[],
    );
    const series = timeline.map((ts, idx) => {
      const total = totalSeries[idx] ?? 0;
      const failed = failedSeries[idx] ?? 0;
      const errorRate = total > 0 ? failed / total : 0;
      return { ts, total, failed, errorRate };
    });
    const totalSum = series.reduce((acc, row) => acc + row.total, 0);
    const failedSum = series.reduce((acc, row) => acc + row.failed, 0);
    return {
      scope: resolved.scope,
      window: input.window,
      granularity: input.granularity ?? '1H',
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), totalSum > 0),
      meta: { warnings, source: 'runs_projection' },
      series,
      totals: { total: totalSum, failed: failedSum, errorRate: totalSum > 0 ? failedSum / totalSum : 0 },
    };
  }

  async getMetricsTokens(input: MetricsQueryDto, warnings: string[] = []): Promise<MetricsTokensDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const timeline = this.buildTimeline(input.window);
    const runs = this.filterRunsByScope(canonical, resolved.workspaceIds, resolved.agentIds);
    const promptTotals = Array.from({ length: timeline.length }, () => 0);
    const completionTotals = Array.from({ length: timeline.length }, () => 0);
    const starts = timeline.map((ts) => new Date(ts).getTime());

    for (const run of runs) {
      const time = new Date(run.startedAt).getTime();
      if (!Number.isFinite(time)) {
        continue;
      }
      let idx = starts.findIndex((bucket, i) => time >= bucket && (i === starts.length - 1 || time < starts[i + 1]));
      if (idx === -1 && time >= starts[starts.length - 1]) {
        idx = starts.length - 1;
      }
      if (idx < 0) {
        continue;
      }
      const usage = run.steps.reduce(
        (acc, step) => {
          acc.prompt += step.tokenUsage?.input ?? 0;
          acc.completion += step.tokenUsage?.output ?? 0;
          return acc;
        },
        { prompt: 0, completion: 0 },
      );
      promptTotals[idx] += usage.prompt;
      completionTotals[idx] += usage.completion;
    }

    const series = timeline.map((ts, idx) => ({ ts, prompt: promptTotals[idx], completion: completionTotals[idx] }));
    return {
      scope: resolved.scope,
      window: input.window,
      granularity: input.granularity ?? '1H',
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), runs.length > 0),
      meta: { warnings, source: 'run_step_token_usage' },
      series,
      totals: {
        prompt: series.reduce((acc, row) => acc + row.prompt, 0),
        completion: series.reduce((acc, row) => acc + row.completion, 0),
      },
    };
  }

  async getMetricsSessions(input: MetricsQueryDto, warnings: string[] = []): Promise<MetricsSessionsDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const timeline = this.buildTimeline(input.window);
    const activeSeries = this.seriesFromEvents(
      timeline,
      resolved.sessions.filter((session) => session.status === 'active').map((session) => session.lastEventAt).filter(Boolean) as string[],
    );
    const completedSeries = this.seriesFromEvents(
      timeline,
      resolved.sessions.filter((session) => session.status === 'closed').map((session) => session.lastEventAt).filter(Boolean) as string[],
    );
    const series = timeline.map((ts, idx) => ({ ts, active: activeSeries[idx] ?? 0, completed: completedSeries[idx] ?? 0 }));
    return {
      scope: resolved.scope,
      window: input.window,
      granularity: input.granularity ?? '1H',
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), resolved.sessions.length > 0),
      meta: { warnings, source: 'runtime_sessions' },
      series,
      totals: {
        active: series.reduce((acc, row) => acc + row.active, 0),
        completed: series.reduce((acc, row) => acc + row.completed, 0),
      },
    };
  }

  async getMetricsBudget(input: MetricsQueryDto, warnings: string[] = []): Promise<MetricsBudgetDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const rawBudgets = this.budgetsService.findAll();
    const budgets = rawBudgets.map((b: any) => {
      const limitUsd = b.limitUsd ?? 100;
      const usedUsd = b.currentUsageUsd ?? 0;
      const pctUsed = Math.round((usedUsd / limitUsd) * 100);
      return {
        id: b.id,
        name: b.name ?? b.id,
        limitUsd,
        usedUsd,
        softCapUsd: Math.round(limitUsd * 0.75),
        hardCapUsd: limitUsd,
        pctUsed,
        status: (pctUsed >= 90 ? 'critical' : pctUsed >= 70 ? 'warning' : 'ok') as 'ok' | 'warning' | 'critical',
        periodDays: b.periodDays ?? 30,
      };
    });
    return {
      scope: resolved.scope,
      window: input.window,
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), budgets.length > 0),
      meta: { warnings, source: 'budgets_store' },
      budgets,
      totalLimitUsd: budgets.reduce((acc, budget) => acc + budget.limitUsd, 0),
      totalUsedUsd: budgets.reduce((acc, budget) => acc + budget.usedUsd, 0),
    };
  }

  async getMetricsModelMix(input: MetricsQueryDto, warnings: string[] = []): Promise<MetricsModelMixDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const agents = canonical.agents.filter((agent) => resolved.workspaceIds.includes(agent.workspaceId));
    const runs = this.filterRunsByScope(canonical, resolved.workspaceIds, resolved.agentIds);
    const modelMap = new Map<string, number>();
    const costMap = new Map<string, number>();
    for (const agent of agents) {
      const m = agent.model ?? 'unknown';
      modelMap.set(m, (modelMap.get(m) ?? 0) + 1);
    }
    for (const run of runs) {
      const model = (run.metadata?.model as string | undefined) ?? agents[0]?.model ?? 'unknown';
      const runCost = run.steps.reduce((acc, step) => acc + (step.costUsd ?? 0), 0);
      costMap.set(model, (costMap.get(model) ?? 0) + runCost);
    }
    if (modelMap.size === 0) {
      modelMap.set('unknown', 1);
    }
    const total = [...modelMap.values()].reduce((acc, value) => acc + value, 0);
    const models = [...modelMap.entries()].map(([model, count]) => ({
      model,
      count,
      pct: Math.round((count / total) * 100),
      costUsd: Math.round((costMap.get(model) ?? 0) * 100) / 100,
    }));
    return {
      scope: resolved.scope,
      window: input.window,
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), models.length > 0),
      meta: { warnings, source: 'agents_and_runs' },
      models,
    };
  }

  async getMetricsLatency(input: MetricsQueryDto, warnings: string[] = []): Promise<MetricsLatencyDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const agents = canonical.agents.filter((agent) => resolved.workspaceIds.includes(agent.workspaceId));
    const runs = this.filterRunsByScope(canonical, resolved.workspaceIds, resolved.agentIds);
    const latencyByModel = new Map<string, number[]>();

    for (const run of runs) {
      if (!run.startedAt || !run.completedAt) {
        continue;
      }
      const startedAt = new Date(run.startedAt).getTime();
      const completedAt = new Date(run.completedAt).getTime();
      if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
        continue;
      }
      const durationMs = completedAt - startedAt;
      const model = (run.metadata?.model as string | undefined) ?? agents[0]?.model ?? 'unknown';
      const existing = latencyByModel.get(model) ?? [];
      existing.push(durationMs);
      latencyByModel.set(model, existing);
    }

    const models = [...latencyByModel.entries()].map(([model, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const p50 = sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0;
      const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? p50;
      return { model, p50ms: Math.round(p50), p95ms: Math.round(p95) };
    });

    if (models.length === 0 && agents.length > 0) {
      models.push({ model: agents[0].model ?? 'unknown', p50ms: 0, p95ms: 0 });
    }

    return {
      scope: resolved.scope,
      window: input.window,
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), models.length > 0),
      meta: { warnings, source: 'run_durations' },
      models,
    };
  }

  async getConnectionsMetering(input: MetricsQueryDto, warnings: string[] = []): Promise<ConnectionsMeteringDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const edges = canonical.topology.connections.length;
    const connected = canonical.topology.links.filter(l => l.runtimeState === 'connected').length;
    const hooks = this.hooksService.findAll();
    const enabledHooks = hooks.filter((h: any) => h.enabled !== false).length;
    const routing = this.routingService.findAll();
    return {
      scope: resolved.scope,
      window: input.window,
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), edges > 0),
      meta: { warnings, source: 'topology_links' },
      meters: {
        supportedEdges:   { value: connected, max: Math.max(edges, 1), pct: edges > 0 ? Math.round((connected / edges) * 100) : 0 },
        hookCoverage:     { value: enabledHooks, max: Math.max(hooks.length, 1), pct: hooks.length > 0 ? Math.round((enabledHooks / hooks.length) * 100) : 0 },
        routingStability: { value: routing.length, max: Math.max(routing.length, 1), pct: 100 },
        handoffPressure:  { value: resolved.sessions.length, max: Math.max(resolved.sessions.length + 3, 5), pct: Math.min(100, Math.round((resolved.sessions.length / 5) * 100)) },
      },
    };
  }

  async getConnectionsRadial(input: MetricsQueryDto, warnings: string[] = []): Promise<ConnectionsRadialDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const hooks = this.hooksService.findAll();
    const enabledHooks = hooks.filter((h: any) => h.enabled !== false).length;
    const allBindings = canonical.runtimeControl.channelBindings;
    const enabled = allBindings.filter(b => b.enabled).length;
    return {
      scope: resolved.scope,
      window: input.window,
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), canonical.topology.connections.length > 0 || hooks.length > 0),
      meta: { warnings, source: 'connections_projection' },
      edges:    { total: canonical.topology.connections.length, connected: canonical.topology.links.filter(l => l.runtimeState === 'connected').length, paused: canonical.topology.links.filter(l => l.runtimeState === 'paused').length, disconnected: canonical.topology.links.filter(l => l.runtimeState === 'disconnected').length },
      hooks:    { total: hooks.length, enabled: enabledHooks },
      channels: { total: allBindings.length, enabled },
    };
  }

  async getConnectionsDependencyGraph(input: MetricsQueryDto, warnings: string[] = []): Promise<ConnectionsDependencyGraphDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const agentSet = new Set(resolved.agentIds);
    const agents = canonical.agents.filter(a => agentSet.has(a.id));
    const skills = canonical.catalog.skills;
    const nodes: ConnectionsDependencyGraphDto['nodes'] = [];
    const edges: ConnectionsDependencyGraphDto['edges'] = [];
    for (const agent of agents.slice(0, 12)) {
      nodes.push({ id: `agent:${agent.id}`, label: agent.name, type: 'agent' });
      for (const skillRef of (agent.skillRefs ?? []).slice(0, 4)) {
        const skill = skills.find(s => s.id === skillRef);
        const skillNodeId = `skill:${skillRef}`;
        if (!nodes.find(n => n.id === skillNodeId)) nodes.push({ id: skillNodeId, label: skill?.name ?? skillRef, type: 'skill' });
        edges.push({ from: `agent:${agent.id}`, to: skillNodeId, label: 'uses' });
      }
    }
    return {
      scope: resolved.scope,
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), nodes.length > 0),
      meta: { warnings, source: 'agent_skill_dependency' },
      nodes,
      edges,
    };
  }

  async getConnectionsTopology(input: MetricsQueryDto, warnings: string[] = []): Promise<ConnectionsTopologyDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const agentSet = new Set(resolved.agentIds);
    const agents = canonical.agents.filter(a => agentSet.has(a.id));
    const nodes: ConnectionsTopologyDto['nodes'] = [];
    const edges: ConnectionsTopologyDto['edges'] = [];
    nodes.push({ id: 'workspace', label: canonical.workspace?.name ?? 'Workspace', type: 'workspace', x: 400, y: 280 });
    agents.slice(0, 16).forEach((agent, i) => {
      const angle = (2 * Math.PI * i) / Math.max(agents.length, 1);
      const r = Math.min(200, 80 + agents.length * 12);
      nodes.push({ id: agent.id, label: agent.name, type: agent.kind ?? 'agent', x: Math.round(400 + r * Math.cos(angle)), y: Math.round(280 + r * Math.sin(angle)), meta: agent.model });
      edges.push({ from: 'workspace', to: agent.id });
    });
    const links = canonical.topology.links.slice(0, 20);
    for (const link of links) {
      const conn = canonical.topology.connections.find(c => c.id === link.linkId);
      if (conn && nodes.find(n => n.id === conn.from.id) && nodes.find(n => n.id === conn.to.id)) {
        edges.push({ from: conn.from.id, to: conn.to.id, label: link.runtimeState });
      }
    }
    return {
      scope: resolved.scope,
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), nodes.length > 1),
      meta: { warnings, source: 'topology_projection' },
      nodes,
      edges,
    };
  }

  async getConnectionsFlowGraph(input: MetricsQueryDto, warnings: string[] = []): Promise<ConnectionsFlowGraphDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const agentSet = new Set(resolved.agentIds);
    const agents = canonical.agents.filter(a => agentSet.has(a.id));
    const nodes = [
      { id: 'input', label: 'Input', value: 100 },
      ...agents.slice(0, 6).map((agent) => ({ id: agent.id, label: agent.name, value: Math.max(1, resolved.sessions.filter((session) => session.ref.workspaceId === agent.workspaceId).length) })),
      { id: 'output', label: 'Output', value: 95 },
    ];
    const links: ConnectionsFlowGraphDto['links'] = [];
    if (nodes.length > 1) {
      links.push({ source: 'input', target: nodes[1].id, value: 80 });
      for (let i = 1; i < nodes.length - 1; i++) {
        const next = nodes[Math.min(i + 1, nodes.length - 1)];
        links.push({ source: nodes[i].id, target: next.id, value: Math.max(1, Math.min(nodes[i].value, next.value)) });
      }
    }
    return {
      scope: resolved.scope,
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), links.length > 0),
      meta: { warnings, source: 'flow_projection' },
      nodes,
      links,
    };
  }

  async getEditorReadiness(input: MetricsQueryDto, warnings: string[] = []): Promise<EditorReadinessDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const runs = this.filterRunsByScope(canonical, resolved.workspaceIds, resolved.agentIds);
    const snapshots = this.versionsService.listSnapshots();
    const skills = canonical.catalog.skills.length;
    const values: EditorReadinessDto['data'] = [
      { dimension: 'Identity', score: resolved.scope.id ? 1 : 0 },
      { dimension: 'Behavior', score: Math.min(1, skills / 10) },
      { dimension: 'Assignment', score: Math.min(1, resolved.agentIds.length / 5) },
      { dimension: 'Versions', score: Math.min(1, snapshots.length / 10) },
      { dimension: 'Catalog', score: Math.min(1, (canonical.catalog.skills.length + canonical.catalog.tools.length) / 25) },
      { dimension: 'Operations', score: Math.min(1, runs.length / 20) },
    ];
    return {
      scope: resolved.scope,
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), true),
      data: values,
      meta: { warnings, source: 'editor_readiness_projection' },
    };
  }

  async getEditorSectionStatus(input: MetricsQueryDto, warnings: string[] = []): Promise<EditorSectionStatusDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const sections = ['Identity', 'Prompting', 'Skills / Tools', 'Routing', 'Hooks', 'Versions', 'Operations', 'Dependencies'];
    return {
      scope: resolved.scope,
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), true),
      data: sections.map((section, idx) => ({
        section,
        status: idx < 3 ? 'complete' : idx < 6 ? 'in_progress' : 'planned',
      })),
      meta: { warnings, source: 'editor_section_status_projection' },
    };
  }

  async getEditorInheritance(input: MetricsQueryDto, warnings: string[] = []): Promise<EditorInheritanceDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    return {
      scope: resolved.scope,
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), true),
      data: [
        { field: 'model', source: 'inherited', effectiveValue: canonical.workspace?.defaultModel ?? 'gpt-5.4' },
        { field: 'skills', source: 'local_override', effectiveValue: String(resolved.agentIds.length) },
        { field: 'policies', source: 'locked', effectiveValue: String(this.policiesService.findAll().length) },
      ],
      meta: { warnings, source: 'editor_inheritance_projection' },
    };
  }

  async getEditorVersions(input: MetricsQueryDto, warnings: string[] = []): Promise<EditorVersionsDto> {
    const canonical = await this.studioService.getCanonicalState();
    const resolved = this.scopeResolver.resolve(canonical, input);
    const snapshots = this.versionsService.listSnapshots();
    const data = snapshots.slice(0, 20).map((snapshot, index) => ({
      id: snapshot.id,
      label: snapshot.label ?? snapshot.id,
      at: snapshot.createdAt,
      status: (index === 0 ? 'current' : 'snapshot') as 'current' | 'draft' | 'snapshot',
    }));
    return {
      scope: resolved.scope,
      window: input.window,
      state: this.analyticsState(Boolean(canonical.runtime.health.ok), data.length > 0),
      data,
      meta: { warnings, source: 'versions_service' },
    };
  }
}
