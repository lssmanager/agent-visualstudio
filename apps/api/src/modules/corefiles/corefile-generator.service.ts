import { AgentSpec, DeployableArtifact } from '../../../../../packages/core-types/src';

function asList(lines: string[] | undefined): string {
  if (!lines || lines.length === 0) {
    return '- (empty)';
  }
  return lines.map((line) => `- ${line}`).join('\n');
}

export class CorefileGeneratorService {
  generateFromAgent(agent: AgentSpec) {
    const identity = agent.identity ?? { name: agent.name, role: agent.role, description: agent.description };
    const behavior = agent.behavior ?? { systemPrompt: agent.instructions ?? '' };
    const human = agent.humanContext ?? {};
    const skillsTools = agent.skillsTools ?? {};
    const handoffs = agent.handoffs ?? {};
    const routing = agent.routingChannels ?? {};
    const hooks = agent.hooks ?? {};
    const operations = agent.operations ?? {};

    const bootstrap = [
      '# BOOTSTRAP.md',
      '',
      `name: ${identity.name ?? agent.name}`,
      `creature: ${identity.creature ?? ''}`,
      `role: ${identity.role ?? ''}`,
      `vibe: ${identity.vibe ?? ''}`,
      `emoji: ${identity.emoji ?? ''}`,
    ].join('\n');

    const identityMd = [
      '# IDENTITY.md',
      '',
      `Name: ${identity.name ?? agent.name}`,
      `Creature: ${identity.creature ?? ''}`,
      `Role: ${identity.role ?? ''}`,
      `Vibe: ${identity.vibe ?? ''}`,
      `Emoji: ${identity.emoji ?? ''}`,
      `Avatar: ${identity.avatar ?? ''}`,
      '',
      identity.description ?? '',
    ].join('\n');

    const soul = [
      '# SOUL.md',
      '',
      '## System Prompt',
      behavior.systemPrompt ?? '',
      '',
      '## Personality Guide',
      behavior.personalityGuide ?? '',
      '',
      '## Operating Principles',
      asList(behavior.operatingPrinciples),
      '',
      '## Boundaries',
      asList(behavior.boundaries),
      '',
      '## Privacy Rules',
      asList(behavior.privacyRules),
      '',
      '## Continuity Rules',
      asList(behavior.continuityRules),
    ].join('\n');

    const user = [
      '# USER.md',
      '',
      `Human Name: ${human.humanName ?? ''}`,
      `Address As: ${human.addressAs ?? ''}`,
      `Pronouns: ${human.pronouns ?? ''}`,
      `Timezone: ${human.timezone ?? ''}`,
      '',
      human.notes ?? '',
      '',
      human.context ?? '',
    ].join('\n');

    const tools = [
      '# TOOLS.md',
      '',
      '## Local Notes',
      skillsTools.localNotes ?? '',
      '',
      '## Device Aliases',
      JSON.stringify(skillsTools.deviceAliases ?? {}, null, 2),
      '',
      '## SSH Aliases',
      JSON.stringify(skillsTools.sshAliases ?? {}, null, 2),
      '',
      '## TTS Preferences',
      JSON.stringify(skillsTools.ttsPreferences ?? {}, null, 2),
      '',
      '## Environment Notes',
      skillsTools.environmentNotes ?? '',
    ].join('\n');

    const agents = [
      '# AGENTS.md',
      '',
      '## Handoffs',
      `fallbackAgent: ${handoffs.fallbackAgent ?? ''}`,
      `escalationPolicy: ${handoffs.escalationPolicy ?? ''}`,
      `approvalLane: ${handoffs.approvalLane ?? ''}`,
      `publicPostingRequiresApproval: ${handoffs.publicPostingRequiresApproval ? 'true' : 'false'}`,
      '',
      '### Allowed Targets',
      asList(handoffs.allowedTargets),
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
      asList(routing.allowedChannels),
      '',
      '## Hooks',
      `heartbeat.enabled: ${hooks.heartbeat?.enabled ? 'true' : 'false'}`,
      `heartbeat.promptSource: ${hooks.heartbeat?.promptSource ?? 'disabled'}`,
      '',
      '## Operations',
      JSON.stringify(operations, null, 2),
    ].join('\n');

    const artifacts: DeployableArtifact[] = [
      { id: `${agent.id}-bootstrap`, name: 'BOOTSTRAP.md', type: 'prompt-file', path: `agents/${agent.id}/BOOTSTRAP.md`, content: bootstrap },
      { id: `${agent.id}-identity`, name: 'IDENTITY.md', type: 'prompt-file', path: `agents/${agent.id}/IDENTITY.md`, content: identityMd },
      { id: `${agent.id}-soul`, name: 'SOUL.md', type: 'prompt-file', path: `agents/${agent.id}/SOUL.md`, content: soul },
      { id: `${agent.id}-tools`, name: 'TOOLS.md', type: 'prompt-file', path: `agents/${agent.id}/TOOLS.md`, content: tools },
      { id: `${agent.id}-user`, name: 'USER.md', type: 'prompt-file', path: `agents/${agent.id}/USER.md`, content: user },
      { id: `${agent.id}-agents`, name: 'AGENTS.md', type: 'prompt-file', path: `agents/${agent.id}/AGENTS.md`, content: agents },
    ];

    return {
      artifacts,
      diagnostics: [],
      diff: artifacts.map((artifact) => ({ path: artifact.path, status: 'updated' as const, after: artifact.content })),
    };
  }
}
