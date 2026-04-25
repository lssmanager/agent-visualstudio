/**
 * profile-propagator.service.ts
 * Propaga cambios de systemPrompt hacia arriba en la jerarquía
 * cuando un agente especializado es modificado.
 *
 * Jerarquía: subagent → agent → workspace → department → agency
 *
 * Patrones tomados de:
 *   - Hermes chief-of-staff  → StaffDirective.propagateToChief()
 *   - AutoGen                → GroupChat.update_system_message()
 *   - Semantic Kernel        → KernelPlugin.UpdateFunctionMetadata()
 *   - CrewAI                 → Crew.update_agent_backstory()
 */

import { StudioService } from '../studio/studio.service';

export interface PropagationEvent {
  entityId: string;
  entityLevel: 'subagent' | 'agent' | 'workspace' | 'department' | 'agency';
  changedField: 'systemPrompt' | 'description' | 'skills' | 'tools' | 'name';
  newValue: string;
}

export interface PropagationResult {
  propagated: boolean;
  chain: string[];
  summaryPatch: Record<string, string>;
  warnings: string[];
}

export class ProfilePropagatorService {
  private readonly studio = new StudioService();

  /**
   * Entry point: recibe un cambio en cualquier nivel y asciende
   * actualizando los resúmenes contextuales de los supervisores.
   *
   * Patrón: Hermes chief-of-staff StaffDirective.propagateToChief():
   *   director.brief → manager.context → chief_of_staff.brief
   */
  async propagate(event: PropagationEvent): Promise<PropagationResult> {
    const canonical = await this.studio.getCanonicalState();
    const chain: string[] = [];
    const summaryPatch: Record<string, string> = {};
    const warnings: string[] = [];

    if (event.entityLevel === 'subagent') {
      const subagent = canonical.subagents.find((s) => s.id === event.entityId);
      if (!subagent) {
        warnings.push(`subagent ${event.entityId} not found`);
      } else {
        chain.push(subagent.id);
        const agent = canonical.agents.find((a) => a.id === subagent.parentAgentId);
        if (agent) {
          chain.push(agent.id);
          summaryPatch[agent.id] = this.buildAgentContextNote(
            agent.name,
            canonical.subagents
              .filter((s) => s.parentAgentId === agent.id)
              .map((s) => ({
                id: s.id,
                name: s.name,
                prompt: s.id === event.entityId
                  ? event.newValue
                  : (s.systemPrompt ?? s.description ?? ''),
              })),
          );
          const higher = await this.propagateFromAgent(
            agent.id, canonical, chain, summaryPatch, warnings,
          );
          chain.push(...higher);
        } else {
          warnings.push(`Parent agent for subagent ${event.entityId} not found`);
        }
      }
    }

    if (event.entityLevel === 'agent') {
      chain.push(event.entityId);
      const higher = await this.propagateFromAgent(
        event.entityId, canonical, chain, summaryPatch, warnings,
      );
      chain.push(...higher);
    }

    if (event.entityLevel === 'workspace' || event.entityLevel === 'department') {
      chain.push(event.entityId);
      warnings.push(
        `Propagation from ${event.entityLevel} only annotated; no recursive ascent implemented yet`,
      );
    }

    return { propagated: chain.length > 1, chain, summaryPatch, warnings };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Desde un agent, actualiza el workspace context note.
   * Patrón: AutoGen GroupChat.update_system_message() + resúmenes de miembros.
   */
  private async propagateFromAgent(
    agentId: string,
    canonical: Awaited<ReturnType<StudioService['getCanonicalState']>>,
    chain: string[],
    summaryPatch: Record<string, string>,
    warnings: string[],
  ): Promise<string[]> {
    const touched: string[] = [];
    const agent = canonical.agents.find((a) => a.id === agentId);
    if (!agent) {
      warnings.push(`agent ${agentId} not found for upward propagation`);
      return touched;
    }

    const workspace = canonical.workspaces.find((w) => w.id === agent.workspaceId);
    if (!workspace) {
      warnings.push(`workspace for agent ${agentId} not found`);
      return touched;
    }

    touched.push(workspace.id);
    const workspaceAgents = canonical.agents.filter((a) => a.workspaceId === workspace.id);
    summaryPatch[workspace.id] = this.buildWorkspaceContextNote(
      workspace.name,
      workspaceAgents.map((a) => ({ id: a.id, name: a.name, role: a.description ?? '' })),
    );

    const dept = canonical.departments.find((d) => d.id === workspace.departmentId);
    if (dept) {
      touched.push(dept.id);
      summaryPatch[dept.id] =
        `Department "${dept.name}" has updated context via workspace "${workspace.name}"`;
    }

    return touched;
  }

  /**
   * Genera nota contextual de un agent a partir de sus sub-agentes.
   * Patrón: CrewAI Crew.kickoff() task backstory builder.
   */
  private buildAgentContextNote(
    agentName: string,
    subagents: { id: string; name: string; prompt: string }[],
  ): string {
    const lines = subagents.map((s) => `  - ${s.name}: ${s.prompt.slice(0, 100)}...`);
    return `Agent "${agentName}" supervises:\n${lines.join('\n')}`;
  }

  /**
   * Genera nota contextual de un workspace a partir de sus agentes.
   * Patrón: Hermes chief-of-staff team_roster brief.
   */
  private buildWorkspaceContextNote(
    workspaceName: string,
    agents: { id: string; name: string; role: string }[],
  ): string {
    const lines = agents.map((a) => `  - ${a.name}: ${a.role.slice(0, 80)}`);
    return `Workspace "${workspaceName}" team:\n${lines.join('\n')}`;
  }
}
