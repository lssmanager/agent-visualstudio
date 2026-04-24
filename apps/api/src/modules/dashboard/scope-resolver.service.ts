import type { CanonicalNodeLevel, CanonicalStudioState, SessionState } from '../../../../../packages/core-types/src';

import type { LineageItemDto, ScopeCapabilitiesDto, ScopeDto, ScopeResolvedEntity } from './dashboard.dto';

function isScopedLevel(level: CanonicalNodeLevel): boolean {
  return level === 'workspace' || level === 'agent' || level === 'subagent';
}

export class DashboardScopeResolver {
  resolve(
    canonical: CanonicalStudioState,
    input: { level?: string; id?: string },
  ): ScopeResolvedEntity {
    const scope = this.resolveScope(canonical, input);
    const lineage = this.resolveLineage(canonical, scope);
    const capabilities = this.resolveCapabilities(canonical, scope.level);
    const workspaceIds = this.resolveWorkspaceIds(canonical, scope);
    const agentIds = this.resolveAgentIds(canonical, scope, workspaceIds);
    const sessions = this.filterSessions(canonical.runtimeControl.sessions, scope, workspaceIds);

    return {
      scope,
      lineage,
      capabilities,
      sessions,
      workspaceIds,
      agentIds,
    };
  }

  private resolveScope(canonical: CanonicalStudioState, input: { level?: string; id?: string }): ScopeDto {
    const level = input.level as CanonicalNodeLevel | undefined;
    const id = input.id;

    if (!level || !id) {
      return { level: 'agency', id: canonical.agency.id };
    }

    if (level === 'agency' && canonical.agency.id === id) return { level, id };
    if (level === 'department' && canonical.departments.some((item) => item.id === id)) return { level, id };
    if (level === 'workspace' && canonical.workspaces.some((item) => item.id === id)) return { level, id };
    if (level === 'agent' && canonical.agents.some((item) => item.id === id)) return { level, id };
    if (level === 'subagent' && canonical.subagents.some((item) => item.id === id)) return { level, id };

    return { level: 'agency', id: canonical.agency.id };
  }

  private resolveLineage(canonical: CanonicalStudioState, scope: ScopeDto): LineageItemDto[] {
    const agency: LineageItemDto = {
      level: 'agency',
      id: canonical.agency.id,
      name: canonical.agency.name,
    };

    if (scope.level === 'agency') return [agency];

    const department =
      scope.level === 'department'
        ? canonical.departments.find((item) => item.id === scope.id)
        : canonical.departments.find((item) => item.workspaceIds.includes(this.workspaceFromScope(canonical, scope)?.id ?? ''));

    const departmentItem: LineageItemDto | null = department
      ? { level: 'department' as CanonicalNodeLevel, id: department.id, name: department.name as string }
      : null;

    if (scope.level === 'department') return departmentItem ? [agency, departmentItem] : [agency];

    const workspace = this.workspaceFromScope(canonical, scope);
    const workspaceItem: LineageItemDto | null = workspace
      ? { level: 'workspace' as CanonicalNodeLevel, id: workspace.id, name: workspace.name as string }
      : null;

    if (scope.level === 'workspace') return [agency, departmentItem, workspaceItem].filter(Boolean) as LineageItemDto[];

    const agent =
      scope.level === 'agent'
        ? canonical.agents.find((item) => item.id === scope.id)
        : canonical.subagents.find((item) => item.id === scope.id);

    const agentLevel: CanonicalNodeLevel = scope.level === 'subagent' ? 'subagent' : 'agent';
    const agentItem: LineageItemDto | null = agent
      ? { level: agentLevel as CanonicalNodeLevel, id: agent.id, name: agent.name as string }
      : null;

    return [agency, departmentItem, workspaceItem, agentItem].filter(Boolean) as LineageItemDto[];
  }

  private resolveCapabilities(canonical: CanonicalStudioState, level: CanonicalNodeLevel): ScopeCapabilitiesDto {
    return {
      canOpenStudio: isScopedLevel(level),
      canUseProfileTab: isScopedLevel(level),
      canManageSettings: level === 'agency',
      canRunOperations: true,
      sessionsMode: isScopedLevel(level) ? 'scoped' : 'aggregated',
      runsMode: isScopedLevel(level) ? 'scoped' : 'aggregated',
      topologyActions: canonical.topology.supportedActions,
    };
  }

  private resolveWorkspaceIds(canonical: CanonicalStudioState, scope: ScopeDto): string[] {
    if (scope.level === 'agency') {
      return canonical.workspaces.map((item) => item.id);
    }

    if (scope.level === 'department') {
      return canonical.workspaces.filter((item) => item.departmentId === scope.id).map((item) => item.id);
    }

    if (scope.level === 'workspace') {
      return canonical.workspaces.filter((item) => item.id === scope.id).map((item) => item.id);
    }

    const workspace = this.workspaceFromScope(canonical, scope);
    return workspace ? [workspace.id] : [];
  }

  private resolveAgentIds(canonical: CanonicalStudioState, scope: ScopeDto, workspaceIds: string[]): string[] {
    if (scope.level === 'agent') {
      return [scope.id];
    }

    if (scope.level === 'subagent') {
      const subagent = canonical.subagents.find((item) => item.id === scope.id);
      return subagent?.parentAgentId ? [subagent.parentAgentId, subagent.id] : [scope.id];
    }

    const workspaceSet = new Set(workspaceIds);
    return [
      ...canonical.agents.filter((item) => workspaceSet.has(item.workspaceId ?? '')).map((item) => item.id),
      ...canonical.subagents.filter((item) => workspaceSet.has(item.workspaceId ?? '')).map((item) => item.id),
    ];
  }

  private filterSessions(sessions: SessionState[], scope: ScopeDto, workspaceIds: string[]): SessionState[] {
    if (scope.level === 'agency' || scope.level === 'department') {
      const allowed = new Set(workspaceIds);
      return sessions.filter((item) => !item.ref.workspaceId || allowed.has(item.ref.workspaceId));
    }

    if (scope.level === 'workspace') {
      return sessions.filter((item) => item.ref.workspaceId === scope.id);
    }

    return sessions.filter((item) => item.ref.workspaceId && workspaceIds.includes(item.ref.workspaceId));
  }

  private workspaceFromScope(canonical: CanonicalStudioState, scope: ScopeDto) {
    if (scope.level === 'workspace') {
      return canonical.workspaces.find((item) => item.id === scope.id) ?? null;
    }

    if (scope.level === 'agent') {
      const agent = canonical.agents.find((item) => item.id === scope.id);
      return canonical.workspaces.find((item) => item.id === agent?.workspaceId) ?? null;
    }

    if (scope.level === 'subagent') {
      const subagent = canonical.subagents.find((item) => item.id === scope.id);
      return canonical.workspaces.find((item) => item.id === subagent?.workspaceId) ?? null;
    }

    return null;
  }
}

