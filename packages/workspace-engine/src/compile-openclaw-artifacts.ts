import crypto from 'node:crypto';

import {
  AgentSpec,
  CompileResult,
  DeployableArtifact,
  FlowSpec,
  PolicySpec,
  ProfileSpec,
  SkillSpec,
  WorkspaceSpec,
} from '../../core-types/src';

interface CompileOpenClawWorkspaceInput {
  workspace: WorkspaceSpec;
  agents: AgentSpec[];
  skills: SkillSpec[];
  flows: FlowSpec[];
  profiles: ProfileSpec[];
  policies?: PolicySpec[];
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function toArtifact(partial: Omit<DeployableArtifact, 'sourceHash'>): DeployableArtifact {
  return {
    ...partial,
    sourceHash: hashContent(partial.content),
  };
}

function listOrNone(values: string[]): string {
  return values.length ? values.join(', ') : 'none';
}

function crossValidate(input: CompileOpenClawWorkspaceInput): string[] {
  const diagnostics: string[] = [];

  const skillIds = new Set(input.skills.map((item) => item.id));
  const agentIds = new Set(input.agents.map((item) => item.id));
  const flowIds = new Set(input.flows.map((item) => item.id));
  const profileIds = new Set(input.profiles.map((item) => item.id));
  const policyIds = new Set((input.policies ?? []).map((item) => item.id));

  for (const id of input.workspace.agentIds) {
    if (!agentIds.has(id)) {
      diagnostics.push(`workspace.agentIds contains missing agent: ${id}`);
    }
  }

  for (const id of input.workspace.skillIds) {
    if (!skillIds.has(id)) {
      diagnostics.push(`workspace.skillIds contains missing skill: ${id}`);
    }
  }

  for (const id of input.workspace.flowIds) {
    if (!flowIds.has(id)) {
      diagnostics.push(`workspace.flowIds contains missing flow: ${id}`);
    }
  }

  for (const id of input.workspace.profileIds) {
    if (!profileIds.has(id)) {
      diagnostics.push(`workspace.profileIds contains missing profile: ${id}`);
    }
  }

  for (const ref of input.workspace.policyRefs) {
    if (!policyIds.has(ref.id)) {
      diagnostics.push(`workspace.policyRefs contains missing policy: ${ref.id}`);
    }
  }

  for (const agent of input.agents) {
    for (const ref of agent.skillRefs ?? []) {
      if (!skillIds.has(ref)) {
        diagnostics.push(`agent ${agent.id} references missing skill: ${ref}`);
      }
    }

    for (const handoff of agent.handoffRules ?? []) {
      if (!agentIds.has(handoff.targetAgentId)) {
        diagnostics.push(`agent ${agent.id} handoff target missing: ${handoff.targetAgentId}`);
      }
    }

    for (const policy of agent.policyBindings ?? []) {
      if (!policyIds.has(policy.policyId)) {
        diagnostics.push(`agent ${agent.id} references missing policy: ${policy.policyId}`);
      }
    }
  }

  return diagnostics;
}

export function compileAgentsMd(agents: AgentSpec[]): string {
  const sorted = [...agents].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  return [
    '# AGENTS',
    '',
    ...sorted.flatMap((agent) => [
      `## ${agent.name}`,
      '',
      `- id: ${agent.id}`,
      `- role: ${agent.role}`,
      `- model: ${agent.model}`,
      `- executionMode: ${agent.executionMode}`,
      `- skills: ${listOrNone(agent.skillRefs ?? [])}`,
      '',
      '### Instructions',
      '',
      agent.instructions,
      '',
    ]),
  ].join('\n');
}

export function compileSoulMd(workspace: WorkspaceSpec): string {
  return ['# SOUL', '', workspace.description ?? `${workspace.name} operating posture.`].join('\n');
}

export function compileToolsMd(skills: SkillSpec[]): string {
  const sorted = [...skills].sort((a, b) => a.name.localeCompare(b.name));

  return [
    '# TOOLS',
    '',
    ...sorted.map((skill) => `- ${skill.name} (${skill.id})`),
  ].join('\n');
}

export function compileUserMd(workspace: WorkspaceSpec): string {
  return ['# USER', '', `Workspace: ${workspace.name}`, `Owner: ${workspace.owner ?? 'n/a'}`].join('\n');
}

export function compileHeartbeatMd(workspace: WorkspaceSpec): string {
  return [
    '# HEARTBEAT',
    '',
    ...workspace.routines.map((routine) => `- [ ] ${routine}`),
    '',
    'Si no hay novedades importantes: HEARTBEAT_OK',
  ].join('\n');
}

export function compileRoutingJson(workspace: WorkspaceSpec): string {
  return JSON.stringify(
    {
      workspaceId: workspace.id,
      rules: workspace.routingRules,
    },
    null,
    2,
  );
}

export function compileOpenClawWorkspace(input: CompileOpenClawWorkspaceInput): CompileResult {
  const diagnostics = crossValidate(input);
  if (diagnostics.length > 0) {
    return { artifacts: [], diagnostics };
  }

  const artifacts: DeployableArtifact[] = [
    toArtifact({
      id: `${input.workspace.id}:agents-md`,
      type: 'prompt-file',
      name: 'AGENTS.md',
      path: 'AGENTS.md',
      mediaType: 'text/markdown',
      content: compileAgentsMd(input.agents),
    }),
    toArtifact({
      id: `${input.workspace.id}:soul-md`,
      type: 'prompt-file',
      name: 'SOUL.md',
      path: 'SOUL.md',
      mediaType: 'text/markdown',
      content: compileSoulMd(input.workspace),
    }),
    toArtifact({
      id: `${input.workspace.id}:tools-md`,
      type: 'prompt-file',
      name: 'TOOLS.md',
      path: 'TOOLS.md',
      mediaType: 'text/markdown',
      content: compileToolsMd(input.skills),
    }),
    toArtifact({
      id: `${input.workspace.id}:user-md`,
      type: 'prompt-file',
      name: 'USER.md',
      path: 'USER.md',
      mediaType: 'text/markdown',
      content: compileUserMd(input.workspace),
    }),
    toArtifact({
      id: `${input.workspace.id}:heartbeat-md`,
      type: 'prompt-file',
      name: 'HEARTBEAT.md',
      path: 'HEARTBEAT.md',
      mediaType: 'text/markdown',
      content: compileHeartbeatMd(input.workspace),
    }),
    toArtifact({
      id: `${input.workspace.id}:routing`,
      type: 'routing',
      name: 'routing.json',
      path: '.openclaw-studio/routing.json',
      mediaType: 'application/json',
      content: compileRoutingJson(input.workspace),
    }),
    toArtifact({
      id: `${input.workspace.id}:workspace-spec`,
      type: 'workspace',
      name: 'workspace.spec.json',
      path: '.openclaw-studio/workspace.spec.json',
      mediaType: 'application/json',
      content: JSON.stringify(input.workspace, null, 2),
    }),
    toArtifact({
      id: `${input.workspace.id}:agents-spec`,
      type: 'agent',
      name: 'agents.spec.json',
      path: '.openclaw-studio/agents.spec.json',
      mediaType: 'application/json',
      content: JSON.stringify(input.agents, null, 2),
    }),
    toArtifact({
      id: `${input.workspace.id}:skills-spec`,
      type: 'skill',
      name: 'skills.spec.json',
      path: '.openclaw-studio/skills.spec.json',
      mediaType: 'application/json',
      content: JSON.stringify(input.skills, null, 2),
    }),
    toArtifact({
      id: `${input.workspace.id}:flows-spec`,
      type: 'flow',
      name: 'flows.spec.json',
      path: '.openclaw-studio/flows.spec.json',
      mediaType: 'application/json',
      content: JSON.stringify(input.flows, null, 2),
    }),
    toArtifact({
      id: `${input.workspace.id}:profiles-spec`,
      type: 'profile',
      name: 'profiles.spec.json',
      path: '.openclaw-studio/profiles.spec.json',
      mediaType: 'application/json',
      content: JSON.stringify(input.profiles, null, 2),
    }),
    toArtifact({
      id: `${input.workspace.id}:policies-spec`,
      type: 'policy',
      name: 'policies.spec.json',
      path: '.openclaw-studio/policies.spec.json',
      mediaType: 'application/json',
      content: JSON.stringify(input.policies ?? [], null, 2),
    }),
  ];

  return {
    artifacts,
    diagnostics: [],
  };
}
