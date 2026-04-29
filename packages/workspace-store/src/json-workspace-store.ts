/**
 * @deprecated F0-08
 *
 * JsonWorkspaceStore reads / writes workspace state as a JSON file.
 * Replaced by Prisma repositories. Retain only for offline export/import CLI tools.
 *
 * @see packages/workspace-store/DEPRECATED.md
 */

import * as fs   from 'fs';
import * as path from 'path';
import { WorkspaceStore } from './workspace-store';
import {
  AgentSpec, FlowSpec, SkillSpec, PolicySpec, WorkspaceSpec, HookSpec,
} from '../../core-types/src';

type StoreData = {
  workspace?: WorkspaceSpec;
  agents?:    AgentSpec[];
  flows?:     FlowSpec[];
  skills?:    SkillSpec[];
  policies?:  PolicySpec[];
  hooks?:     HookSpec[];
};

/** @deprecated Use Prisma repositories. */
export class JsonWorkspaceStore extends WorkspaceStore {
  private data: StoreData = {};

  constructor(private readonly filePath: string) {
    super();
    this._load();
  }

  private _load() {
    try {
      const raw  = fs.readFileSync(this.filePath, 'utf8');
      this.data  = JSON.parse(raw);
    } catch {
      this.data = {};
    }
  }

  private _save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  readWorkspace()                          { return this.data.workspace ?? null; }
  writeWorkspace(w: WorkspaceSpec)         { this.data.workspace = w; this._save(); return w; }
  listAgents()                             { return this.data.agents   ?? []; }
  getAgent(id: string)                     { return this.data.agents?.find(a => a.id === id) ?? null; }
  saveAgents(agents: AgentSpec[])          { this.data.agents   = agents;   this._save(); return agents; }
  listFlows()                              { return this.data.flows    ?? []; }
  getFlow(id: string)                      { return this.data.flows?.find(f => f.id === id) ?? null; }
  saveFlows(flows: FlowSpec[])             { this.data.flows    = flows;    this._save(); return flows; }
  listSkills()                             { return this.data.skills   ?? []; }
  getSkill(id: string)                     { return this.data.skills?.find(s => s.id === id) ?? null; }
  saveSkills(skills: SkillSpec[])          { this.data.skills   = skills;   this._save(); return skills; }
  listPolicies()                           { return this.data.policies ?? []; }
  getPolicy(id: string)                    { return this.data.policies?.find(p => p.id === id) ?? null; }
  savePolicies(policies: PolicySpec[])     { this.data.policies = policies; this._save(); return policies; }
  listHooks()                              { return this.data.hooks    ?? []; }
  getHook(id: string)                      { return this.data.hooks?.find(h => h.id === id) ?? null; }
  saveHooks(hooks: HookSpec[])             { this.data.hooks    = hooks;    this._save(); return hooks; }
}
