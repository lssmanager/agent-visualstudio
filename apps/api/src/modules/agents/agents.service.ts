import { AgentSpec } from '../../../../../packages/core-types/src';
import { agentSpecSchema } from '../../../../../packages/schemas/src';
import { CorefileGeneratorService } from '../corefiles/corefile-generator.service';

import { AgentsRepository } from './agents.repository';

export class AgentsService {
  private readonly repository = new AgentsRepository();
  private readonly corefileGenerator = new CorefileGeneratorService();

  private normalizeStructuredShape(agent: AgentSpec): AgentSpec {
    const identity = agent.identity ?? {
      name: agent.name,
      role: agent.role,
      description: agent.description,
    };

    const behavior = agent.behavior ?? {
      systemPrompt: agent.instructions ?? '',
    };

    const skillsTools = agent.skillsTools ?? {
      assignedSkills: agent.skillRefs ?? [],
      enabledTools: [],
      localNotes: '',
    };

    const handoffs = agent.handoffs ?? {
      allowedTargets: (agent.handoffRules ?? []).map((rule) => rule.targetAgentId),
      escalationPolicy: '',
      approvalLane: '',
      internalActionsAllowed: [],
      externalActionsRequireApproval: [],
      publicPostingRequiresApproval: true,
    };

    const routingChannels = agent.routingChannels ?? {
      allowedChannels: (agent.channelBindings ?? []).map((binding) => binding.channel),
      groupChatMode: 'respond_when_mentioned',
      reactionPolicy: 'limited',
      maxReactionsPerMessage: 1,
      avoidTripleTap: true,
      platformFormattingRules: '',
      responseTriggerPolicy: '',
    };

    const hooks = agent.hooks ?? {
      heartbeat: {
        enabled: false,
        promptSource: 'disabled',
      },
      lifecycleHooks: [],
      cronHooks: [],
      proactiveChecks: [],
    };

    const operations = agent.operations ?? {
      startup: {
        readSoul: true,
        readUser: true,
        readDailyMemory: true,
        readLongTermMemoryInMainSessionOnly: true,
      },
      memoryPolicy: {
        dailyNotesEnabled: true,
        longTermMemoryEnabled: true,
        memoryScope: 'main_session_only',
      },
      safety: {
        destructiveCommandsRequireApproval: true,
        externalActionsRequireApproval: true,
        privateDataProtection: true,
        recoverableDeletePreferred: true,
      },
    };

    return {
      ...agent,
      role: identity.role ?? agent.role ?? 'Agent',
      description: identity.description ?? agent.description ?? '',
      instructions: behavior.systemPrompt ?? agent.instructions ?? '',
      skillRefs: skillsTools.assignedSkills ?? agent.skillRefs ?? [],
      identity,
      behavior,
      skillsTools,
      handoffs,
      routingChannels,
      hooks,
      operations,
      handoffRules: agent.handoffRules ?? [],
      channelBindings: agent.channelBindings ?? [],
    };
  }

  private computeReadiness(agent: AgentSpec) {
    const checks = {
      identityComplete: Boolean(agent.identity?.name && agent.identity?.creature && agent.identity?.vibe),
      behaviorComplete: Boolean(agent.behavior?.systemPrompt?.trim()),
      toolsAssigned: Boolean((agent.skillsTools?.assignedSkills?.length ?? 0) + (agent.skillsTools?.enabledTools?.length ?? 0) > 0),
      routingConfigured: Boolean(agent.routingChannels?.allowedChannels?.length),
      hooksConfigured: agent.hooks?.heartbeat?.promptSource !== undefined,
      operationsConfigured: Boolean(agent.operations?.startup && agent.operations?.safety),
      versionsReady: Boolean(agent.identity?.name && agent.behavior?.systemPrompt !== undefined),
    };

    const missingFields: string[] = [];
    if (!checks.identityComplete) missingFields.push('identity.name|identity.creature|identity.vibe');
    if (!checks.behaviorComplete) missingFields.push('behavior.systemPrompt');
    if (!checks.toolsAssigned) missingFields.push('skillsTools.assignedSkills|skillsTools.enabledTools');
    if (!checks.routingConfigured) missingFields.push('routingChannels.allowedChannels');
    if (!checks.hooksConfigured) missingFields.push('hooks.heartbeat.promptSource');
    if (!checks.operationsConfigured) missingFields.push('operations.startup|operations.safety');
    if (!checks.versionsReady) missingFields.push('core-files-preview');

    const score = Math.round((Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100);
    const state =
      !checks.identityComplete ? 'missing_identity'
      : !checks.behaviorComplete ? 'missing_behavior'
      : !agent.model ? 'missing_model'
      : !checks.routingConfigured ? 'missing_channel_binding'
      : !agent.operations?.memoryPolicy ? 'missing_memory_policy'
      : !agent.operations?.safety ? 'missing_safety_policy'
      : 'ready_to_publish';

    return { checks, missingFields, score, state };
  }

  findAll() {
    return this.repository.list();
  }

  findById(id: string) {
    return this.repository.findById(id);
  }

  create(agent: AgentSpec) {
    const parsed = this.normalizeStructuredShape(agentSpecSchema.parse(agent) as AgentSpec);
    const agents = this.repository.list();

    if (agents.some((item) => item.id === parsed.id)) {
      throw new Error(`Agent already exists: ${parsed.id}`);
    }
    if (!parsed.workspaceId) {
      throw new Error('parentWorkspaceId/workspaceId is required');
    }
    if ((parsed.kind ?? 'agent') === 'subagent' && !parsed.parentAgentId) {
      throw new Error('parentAgentId is required for subagent');
    }

    this.repository.saveAll([...agents, parsed]);
    return parsed;
  }

  update(id: string, updates: Partial<AgentSpec>) {
    const agents = this.repository.list();
    const index = agents.findIndex((agent) => agent.id === id);
    if (index < 0) {
      return null;
    }

    const parsed = this.normalizeStructuredShape(agentSpecSchema.parse({ ...agents[index], ...updates, id }) as AgentSpec);
    if (!parsed.workspaceId) {
      throw new Error('parentWorkspaceId/workspaceId is required');
    }
    if ((parsed.kind ?? 'agent') === 'subagent' && !parsed.parentAgentId) {
      throw new Error('parentAgentId is required for subagent');
    }
    agents[index] = parsed;
    this.repository.saveAll(agents);
    return parsed;
  }

  remove(id: string) {
    const agents = this.repository.list();
    const next = agents.filter((item) => item.id !== id);
    if (next.length === agents.length) {
      return false;
    }
    this.repository.saveAll(next);
    return true;
  }

  getReadiness(id: string) {
    const agent = this.findById(id);
    if (!agent) {
      return null;
    }
    const readiness = this.computeReadiness(agent);
    return {
      agentId: id,
      state: readiness.state,
      checks: readiness.checks,
      missingFields: readiness.missingFields,
      score: readiness.score,
    };
  }

  generateCoreFiles(id: string) {
    const agent = this.findById(id);
    if (!agent) {
      return null;
    }
    return this.corefileGenerator.generateFromAgent(agent);
  }
}
