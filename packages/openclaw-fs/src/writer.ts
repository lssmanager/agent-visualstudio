import fs from 'node:fs';
import path from 'node:path';

import {
  AgentSpec,
  FlowSpec,
  SkillSpec,
  PolicySpec,
  HookSpec,
  WorkspaceConfig,
} from '../../core-types/src';
import { dumpYaml } from './yaml-utils';

function writeYamlFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, dumpYaml(data), 'utf-8');
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Write workspace config to `.openclaw/config.yaml`.
 */
export function writeWorkspaceConfig(rootDir: string, config: WorkspaceConfig): void {
  writeYamlFile(path.join(rootDir, '.openclaw', 'config.yaml'), config);
}

/**
 * Write an agent to `.openclaw/agents/<slug>.yaml`.
 */
export function writeAgent(rootDir: string, agent: AgentSpec): void {
  const filename = `${slugify(agent.name || agent.id)}.yaml`;
  writeYamlFile(path.join(rootDir, '.openclaw', 'agents', filename), agent);
}

/**
 * Write all agents, removing old files first.
 */
export function writeAllAgents(rootDir: string, agents: AgentSpec[]): void {
  const dir = path.join(rootDir, '.openclaw', 'agents');
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  for (const agent of agents) {
    writeAgent(rootDir, agent);
  }
}

/**
 * Write a flow to `.openclaw/flows/<slug>.yaml`.
 */
export function writeFlow(rootDir: string, flow: FlowSpec): void {
  const filename = `${slugify(flow.name || flow.id)}.yaml`;
  writeYamlFile(path.join(rootDir, '.openclaw', 'flows', filename), flow);
}

export function writeAllFlows(rootDir: string, flows: FlowSpec[]): void {
  const dir = path.join(rootDir, '.openclaw', 'flows');
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  for (const flow of flows) {
    writeFlow(rootDir, flow);
  }
}

/**
 * Write a skill to `.openclaw/skills/<slug>.yaml`.
 */
export function writeSkill(rootDir: string, skill: SkillSpec): void {
  const filename = `${slugify(skill.name || skill.id)}.yaml`;
  writeYamlFile(path.join(rootDir, '.openclaw', 'skills', filename), skill);
}

export function writeAllSkills(rootDir: string, skills: SkillSpec[]): void {
  const dir = path.join(rootDir, '.openclaw', 'skills');
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  for (const skill of skills) {
    writeSkill(rootDir, skill);
  }
}

/**
 * Write a policy to `.openclaw/policies/<slug>.yaml`.
 */
export function writePolicy(rootDir: string, policy: PolicySpec): void {
  const filename = `${slugify(policy.name || policy.id)}.yaml`;
  writeYamlFile(path.join(rootDir, '.openclaw', 'policies', filename), policy);
}

export function writeAllPolicies(rootDir: string, policies: PolicySpec[]): void {
  const dir = path.join(rootDir, '.openclaw', 'policies');
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  for (const policy of policies) {
    writePolicy(rootDir, policy);
  }
}

/**
 * Write hooks to `.openclaw/hooks.yaml`.
 */
export function writeHooks(rootDir: string, hooks: HookSpec[]): void {
  writeYamlFile(path.join(rootDir, '.openclaw', 'hooks.yaml'), hooks);
}
