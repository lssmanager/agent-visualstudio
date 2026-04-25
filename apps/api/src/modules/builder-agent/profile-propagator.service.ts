/**
 * profile-propagator.service.ts
 * Propagates systemPrompt changes upward through the agent hierarchy
 * (subagent → agent → workspace → department → agency).
 *
 * Pattern inspired by:
 *  - LangGraph MemorySaver checkpoint aggregation
 *  - CrewAI Crew.kickoff() manager_llm context merge
 *  - AutoGen GroupChatManager system_message aggregation
 *  - Hermes Chief-of-Staff delegator context builder
 */

import type { CanonicalNodeLevel } from '../../../../../packages/core-types/src';
import { StudioService } from '../studio/studio.service';

export interface PropagationResult {
  entityId:   string;
  level:      CanonicalNodeLevel;
  aggregatedSystemPrompt: string;
  childSummaries: Array<{ id: string; name: string; role: string; summary: string }>;
}

export class ProfilePropagatorService {
  private readonly studioService = new StudioService();

  /**
   * Recalculate the aggregated systemPrompt for an agent or supervisor
   * given the current state of its children.
   *
   * Call this any time a subagent's profile changes.
   */
  async propagateUpward(changedEntityId: string, level: CanonicalNodeLevel): Promise<PropagationResult[]> {
    const canonical = await this.studioService.getCanonicalState();
    const results: PropagationResult[] = [];

    if (level === 'subagent') {
      const subagent = canonical.subagents.find((s) => s.id === changedEntityId);
      if (!subagent?.parentAgentId) return results;

      const parentAgent = canonical.agents.find((a) => a.id === subagent.parentAgentId);
      if (!parentAgent) return results;

      const siblings = canonical.subagents.filter((s) => s.parentAgentId === parentAgent.id);
      const agentResult = this.buildAgentPrompt(parentAgent.id, parentAgent.name, siblings);
      results.push(agentResult);

      // Continue propagating workspace level
      const workspace = canonical.workspaces.find((w) => w.id === parentAgent.workspaceId);
      if (workspace) {
        const workspaceAgents = canonical.agents.filter((a) => a.workspaceId === workspace.id);
        results.push(this.buildWorkspacePrompt(workspace.id, workspace.name, workspaceAgents, results));
      }

      return results;
    }

    if (level === 'agent') {
      const agent = canonical.agents.find((a) => a.id === changedEntityId);
      if (!agent) return results;
      const subagents = canonical.subagents.filter((s) => s.parentAgentId === agent.id);
      results.push(this.buildAgentPrompt(agent.id, agent.name, subagents));
      return results;
    }

    return results;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private buildAgentPrompt(
    agentId: string,
    agentName: string,
    subagents: Array<{ id: string; name: string; description?: string; skillRefs: string[] }>,
  ): PropagationResult {
    const childSummaries = subagents.map((s) => ({
      id:      s.id,
      name:    s.name,
      role:    'subagent',
      summary: s.description ?? `Specialized sub-agent. Skills: ${s.skillRefs.join(', ') || 'none'}.`,
    }));

    const skillBullets = childSummaries
      .map((c) => `  - ${c.name}: ${c.summary}`)
      .join('\n');

    const aggregatedSystemPrompt = [
      `You are ${agentName}, an orchestrating agent.`,
      `You coordinate the following specialized sub-agents:`,
      skillBullets || '  (no sub-agents assigned)',
      '',
      'Delegation rules:',
      '  1. Decompose the task and assign each part to the most capable sub-agent.',
      '  2. Aggregate results before responding.',
      '  3. Escalate to your supervisor if the task exceeds your scope.',
    ].join('\n');

    return {
      entityId: agentId,
      level:    'agent',
      aggregatedSystemPrompt,
      childSummaries,
    };
  }

  private buildWorkspacePrompt(
    workspaceId: string,
    workspaceName: string,
    agents: Array<{ id: string; name: string; description?: string }>,
    agentResults: PropagationResult[],
  ): PropagationResult {
    const childSummaries = agents.map((a) => {
      const agentResult = agentResults.find((r) => r.entityId === a.id);
      return {
        id:      a.id,
        name:    a.name,
        role:    'agent',
        summary: agentResult
          ? `Coordinates: ${agentResult.childSummaries.map((c) => c.name).join(', ')}`
          : (a.description ?? 'Orchestrating agent'),
      };
    });

    const agentBullets = childSummaries
      .map((c) => `  - ${c.name}: ${c.summary}`)
      .join('\n');

    const aggregatedSystemPrompt = [
      `You are the ${workspaceName} workspace coordinator.`,
      `Available agents in this workspace:`,
      agentBullets || '  (no agents assigned)',
    ].join('\n');

    return {
      entityId: workspaceId,
      level:    'workspace',
      aggregatedSystemPrompt,
      childSummaries,
    };
  }
}
