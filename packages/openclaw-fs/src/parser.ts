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
import { parseYaml } from './yaml-utils';

/**
 * Reads a `.openclaw/` directory and returns all specs.
 */
export interface ParsedWorkspace {
  config: WorkspaceConfig;
  agents: AgentSpec[];
  flows: FlowSpec[];
  skills: SkillSpec[];
  policies: PolicySpec[];
  hooks: HookSpec[];
}

function readYamlFile<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseYaml<T>(content);
}

function readYamlDir<T extends { id: string }>(dirPath: string): T[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => readYamlFile<T>(path.join(dirPath, f)));
}

/**
 * Parse the full `.openclaw/` directory into structured specs.
 */
export function parseOpenclawDir(rootDir: string): ParsedWorkspace | null {
  const openclawDir = path.join(rootDir, '.openclaw');

  const configPath = path.join(openclawDir, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const config = readYamlFile<WorkspaceConfig>(configPath);
  const agents = readYamlDir<AgentSpec>(path.join(openclawDir, 'agents'));
  const flows = readYamlDir<FlowSpec>(path.join(openclawDir, 'flows'));
  const skills = readYamlDir<SkillSpec>(path.join(openclawDir, 'skills'));
  const policies = readYamlDir<PolicySpec>(path.join(openclawDir, 'policies'));

  let hooks: HookSpec[] = [];
  const hooksPath = path.join(openclawDir, 'hooks.yaml');
  if (fs.existsSync(hooksPath)) {
    hooks = readYamlFile<HookSpec[]>(hooksPath) ?? [];
  }

  return { config, agents, flows, skills, policies, hooks };
}
