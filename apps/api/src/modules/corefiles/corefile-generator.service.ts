import { AgentBehavior, AgentHandoffs, AgentHooks, AgentIdentity, AgentOperations, AgentRoutingChannels, AgentSkillsTools, AgentSpec, DeployableArtifact } from '../../../../../packages/core-types/src';

type GeneratedFiles = {
  'BOOTSTRAP.md': string;
  'IDENTITY.md': string;
  'SOUL.md': string;
  'USER.md': string;
  'TOOLS.md': string;
  'AGENTS.md': string;
};

function listBlock(lines?: string[]): string {
  if (!lines || lines.length === 0) return '- (empty)';
  return lines.map((line) => `- ${line}`).join('\n');
}

function sortedObjectLines(value: Record<string, string> | undefined): string {
  if (!value || Object.keys(value).length === 0) {
    return '- (empty)';
  }
  return Object.keys(value)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `- ${key}: ${value[key]}`)
    .join('\n');
}

export class CorefileGeneratorService {
  generateAll(spec: AgentSpec): GeneratedFiles {
    const identity = this.resolveIdentity(spec);
    const behavior = this.resolveBehavior(spec);
    const human = spec.humanContext ?? {};
    const skillsTools = spec.skillsTools ?? {};
    const handoffs = spec.handoffs ?? {};
    const routing = spec.routingChannels ?? {};
    const hooks = spec.hooks ?? {};
    const operations = spec.operations ?? {};

    return {
      'BOOTSTRAP.md': this.generateBootstrap(spec, identity),
      'IDENTITY.md': this.generateIdentity(identity),
      'SOUL.md': this.generateSoul(behavior),
      'USER.md': this.generateUser(human),
      'TOOLS.md': this.generateTools(skillsTools),
      'AGENTS.md': this.generateAgents(handoffs, routing, hooks, operations),
    };
  }

  generateIdentity(identity: AgentIdentity): string {
    return [
      '# IDENTITY.md',
      '',
      `Name: ${identity.name ?? ''}`,
      `Creature: ${identity.creature ?? ''}`,
      `Role: ${identity.role ?? ''}`,
      `Vibe: ${identity.vibe ?? ''}`,
      `Emoji: ${identity.emoji ?? ''}`,
      `Avatar: ${identity.avatar ?? ''}`,
      '',
      identity.description ?? '',
    ].join('\n');
  }

  generateBootstrap(spec: AgentSpec, identity: AgentIdentity): string {
    return [
      '# BOOTSTRAP.md',
      '',
      'This agent has not been initialized yet. Define who this agent is.',
      '',
      `id: ${spec.id}`,
      `kind: ${spec.kind ?? 'agent'}`,
      `parentWorkspaceId: ${spec.parentWorkspaceId ?? spec.workspaceId ?? ''}`,
      `parentAgentId: ${spec.parentAgentId ?? ''}`,
      `profileId: ${spec.profileId ?? ''}`,
      '',
      `name: ${identity.name ?? ''}`,
      `creature: ${identity.creature ?? ''}`,
      `role: ${identity.role ?? ''}`,
      `vibe: ${identity.vibe ?? ''}`,
      `emoji: ${identity.emoji ?? ''}`,
    ].join('\n');
  }

  generateSoul(behavior: AgentBehavior): string {
    return [
      '# SOUL.md',
      '',
      '## System Prompt',
      behavior.systemPrompt ?? '',
      '',
      '## Personality Guide',
      behavior.personalityGuide ?? '',
      '',
      '## Operating Principles',
      listBlock(behavior.operatingPrinciples),
      '',
      '## Boundaries',
      listBlock(behavior.boundaries),
      '',
      '## Privacy Rules',
      listBlock(behavior.privacyRules),
      '',
      '## Continuity Rules',
      listBlock(behavior.continuityRules),
      '',
      '## Response Style',
      behavior.responseStyle ?? '',
    ].join('\n');
  }

  generateUser(humanContext: AgentSpec['humanContext']): string {
    const human = humanContext ?? {};
    return [
      '# USER.md',
      '',
      `Human Name: ${human.humanName ?? ''}`,
      `Address As: ${human.addressAs ?? ''}`,
      `Pronouns: ${human.pronouns ?? ''}`,
      `Timezone: ${human.timezone ?? ''}`,
      '',
      '## Notes',
      human.notes ?? '',
      '',
      '## Context',
      human.context ?? '',
    ].join('\n');
  }

  generateTools(skillsTools: AgentSkillsTools): string {
    return [
      '# TOOLS.md',
      '',
      '## Assigned Skills',
      listBlock(skillsTools.assignedSkills),
      '',
      '## Enabled Tools',
      listBlock(skillsTools.enabledTools),
      '',
      '## Local Notes',
      skillsTools.localNotes ?? '',
      '',
      '## Device Aliases',
      sortedObjectLines(skillsTools.deviceAliases),
      '',
      '## SSH Aliases',
      sortedObjectLines(skillsTools.sshAliases),
      '',
      '## TTS Preferences',
      sortedObjectLines(skillsTools.ttsPreferences),
      '',
      '## Environment Notes',
      skillsTools.environmentNotes ?? '',
    ].join('\n');
  }

  generateAgents(
    handoffs: AgentHandoffs,
    routing: AgentRoutingChannels,
    hooks: AgentHooks,
    operations: AgentOperations,
  ): string {
    return [
      '# AGENTS.md',
      '',
      '## Handoffs',
      `fallbackAgent: ${handoffs.fallbackAgent ?? ''}`,
      `escalationPolicy: ${handoffs.escalationPolicy ?? ''}`,
      `approvalLane: ${handoffs.approvalLane ?? ''}`,
      `delegationNotes: ${handoffs.delegationNotes ?? ''}`,
      `publicPostingRequiresApproval: ${handoffs.publicPostingRequiresApproval ? 'true' : 'false'}`,
      '',
      '### Allowed Targets',
      listBlock(handoffs.allowedTargets),
      '',
      '### Internal Actions Allowed',
      listBlock(handoffs.internalActionsAllowed),
      '',
      '### External Actions Require Approval',
      listBlock(handoffs.externalActionsRequireApproval),
      '',
      '## Routing & Channels',
      `defaultChannel: ${routing.defaultChannel ?? ''}`,
      `fallbackChannel: ${routing.fallbackChannel ?? ''}`,
      `groupChatMode: ${routing.groupChatMode ?? ''}`,
      `reactionPolicy: ${routing.reactionPolicy ?? ''}`,
      `maxReactionsPerMessage: ${routing.maxReactionsPerMessage ?? 1}`,
      `avoidTripleTap: ${routing.avoidTripleTap ? 'true' : 'false'}`,
      '',
      '### Allowed Channels',
      listBlock(routing.allowedChannels),
      '',
      '### Platform Formatting Rules',
      routing.platformFormattingRules ?? '',
      '',
      '### Response Trigger Policy',
      routing.responseTriggerPolicy ?? '',
      '',
      '## Hooks',
      `heartbeat.enabled: ${hooks.heartbeat?.enabled ? 'true' : 'false'}`,
      `heartbeat.promptSource: ${hooks.heartbeat?.promptSource ?? 'disabled'}`,
      `heartbeat.quietHoursStart: ${hooks.heartbeat?.quietHoursStart ?? ''}`,
      `heartbeat.quietHoursEnd: ${hooks.heartbeat?.quietHoursEnd ?? ''}`,
      '',
      '### Lifecycle Hooks',
      listBlock(hooks.lifecycleHooks),
      '',
      '### Proactive Checks',
      listBlock(hooks.proactiveChecks),
      '',
      '### Cron Hooks',
      (hooks.cronHooks ?? []).map((hook) => `- ${hook.schedule}: ${hook.task}`).join('\n') || '- (empty)',
      '',
      '## Operations',
      JSON.stringify(operations, null, 2),
    ].join('\n');
  }

  generateFromAgent(agent: AgentSpec) {
    const generated = this.generateAll(agent);
    const orderedNames: Array<keyof GeneratedFiles> = [
      'BOOTSTRAP.md',
      'IDENTITY.md',
      'SOUL.md',
      'TOOLS.md',
      'USER.md',
      'AGENTS.md',
    ];

    const artifacts: DeployableArtifact[] = orderedNames.map((name) => ({
      id: `${agent.id}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name,
      type: 'prompt-file',
      path: `agents/${agent.id}/${name}`,
      content: generated[name],
    }));

    return {
      artifacts,
      diagnostics: [],
      diff: artifacts.map((artifact) => ({ path: artifact.path, status: 'updated' as const, after: artifact.content })),
    };
  }

  private resolveIdentity(spec: AgentSpec): AgentIdentity {
    return spec.identity ?? {
      name: spec.name ?? '',
      role: spec.role,
      description: spec.description,
    };
  }

  private resolveBehavior(spec: AgentSpec): AgentBehavior {
    return spec.behavior ?? {
      systemPrompt: spec.instructions ?? '',
    };
  }
}
