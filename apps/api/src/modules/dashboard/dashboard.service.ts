import type { CanonicalStudioState, TopologyRuntimeAction } from '../../../../../packages/core-types/src';

import { HooksService } from '../hooks/hooks.service';
import { RoutingService } from '../routing/routing.service';
import { RunsService } from '../runs/runs.service';
import { StudioService } from '../studio/studio.service';
import { TopologyService } from '../topology/topology.service';
import { VersionsService } from '../versions/versions.service';
import type {
  DashboardConnectionsDto,
  DashboardInspectorDto,
  DashboardOperationsDto,
  DashboardOverviewDto,
  DashboardRunsDto,
  RuntimeCommandRequestDto,
  RuntimeCommandResultDto,
} from './dashboard.dto';
import { DashboardProfileService } from './profile-system.service';
import { DashboardScopeResolver } from './scope-resolver.service';

export class DashboardService {
  private readonly studioService = new StudioService();
  private readonly scopeResolver = new DashboardScopeResolver();
  private readonly runsService = new RunsService();
  private readonly hooksService = new HooksService();
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
}
