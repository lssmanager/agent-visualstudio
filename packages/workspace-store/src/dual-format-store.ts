/**
 * @deprecated F0-08
 *
 * DualFormatStore bridges JSON ↔ YAML during the migration window.
 * Both formats are deprecated. Migrate to Prisma repositories.
 *
 * @see packages/workspace-store/DEPRECATED.md
 */

import * as path from 'path';
import { WorkspaceStore }    from './workspace-store';
import { JsonWorkspaceStore } from './json-workspace-store';
import { YamlWorkspaceStore } from './yaml-workspace-store';
import {
  AgentSpec, FlowSpec, SkillSpec, PolicySpec, WorkspaceSpec, HookSpec,
} from '../../core-types/src';

/**
 * @deprecated — allowed values for WORKSPACE_STORE_FORMAT.
 * Will be removed together with this package in F1.
 */
export type StoreFormat = 'json' | 'yaml';

/**
 * @deprecated Bridges JSON and YAML stores. Use Prisma repositories instead.
 */
export class DualFormatStore extends WorkspaceStore {
  private readonly json: JsonWorkspaceStore;
  private readonly yaml: YamlWorkspaceStore;

  /**
   * @deprecated
   * @param rootPath  Workspace root directory (OPENCLAW_WORKSPACE_ROOT).
   * @param _format   Kept for backward-compat; reads from JSON, writes to both.
   */
  constructor(rootPath: string, _format: StoreFormat = 'json') {
    super();
    const storeDir = path.join(rootPath, '.openclaw');
    this.json = new JsonWorkspaceStore(path.join(storeDir, 'workspace-state.json'));
    this.yaml = new YamlWorkspaceStore(path.join(storeDir, 'workspace-state.yaml'));
  }

  // Reads from JSON (primary), writes to both.
  readWorkspace()                          { return this.json.readWorkspace(); }
  writeWorkspace(w: WorkspaceSpec)         { this.yaml.writeWorkspace(w); return this.json.writeWorkspace(w); }
  listAgents()                             { return this.json.listAgents(); }
  getAgent(id: string)                     { return this.json.getAgent(id); }
  saveAgents(agents: AgentSpec[])          { this.yaml.saveAgents(agents); return this.json.saveAgents(agents); }
  listFlows()                              { return this.json.listFlows(); }
  getFlow(id: string)                      { return this.json.getFlow(id); }
  saveFlows(flows: FlowSpec[])             { this.yaml.saveFlows(flows); return this.json.saveFlows(flows); }
  listSkills()                             { return this.json.listSkills(); }
  getSkill(id: string)                     { return this.json.getSkill(id); }
  saveSkills(skills: SkillSpec[])          { this.yaml.saveSkills(skills); return this.json.saveSkills(skills); }
  listPolicies()                           { return this.json.listPolicies(); }
  getPolicy(id: string)                    { return this.json.getPolicy(id); }
  savePolicies(policies: PolicySpec[])     { this.yaml.savePolicies(policies); return this.json.savePolicies(policies); }
  listHooks()                              { return this.json.listHooks(); }
  getHook(id: string)                      { return this.json.getHook(id); }
  saveHooks(hooks: HookSpec[])             { this.yaml.saveHooks(hooks); return this.json.saveHooks(hooks); }
}
