import {
  AgentSpec,
  FlowSpec,
  SkillSpec,
  PolicySpec,
  WorkspaceSpec,
  HookSpec,
} from '../../core-types/src';
import { WorkspaceStore } from './workspace-store';
import { JsonWorkspaceStore } from './json-workspace-store';
import { YamlWorkspaceStore } from './yaml-workspace-store';

export type StoreFormat = 'json' | 'yaml' | 'dual';

/**
 * Dual-format store — reads from both JSON and YAML sources,
 * writes to the configured target format.
 *
 * Read priority:
 *   - If format='json' → read from JSON only
 *   - If format='yaml' → read from YAML only
 *   - If format='dual' → read from JSON first, fall back to YAML
 *
 * Write behavior:
 *   - Always writes to the configured target (json or yaml)
 *   - In 'dual' mode, writes default to json (configurable via writeTarget)
 */
export class DualFormatStore extends WorkspaceStore {
  private readonly jsonStore: JsonWorkspaceStore;
  private readonly yamlStore: YamlWorkspaceStore;
  private readonly format: StoreFormat;
  private readonly writeTarget: 'json' | 'yaml';

  constructor(
    rootDir: string,
    format: StoreFormat = 'json',
    writeTarget?: 'json' | 'yaml',
  ) {
    super();
    this.jsonStore = new JsonWorkspaceStore(rootDir);
    this.yamlStore = new YamlWorkspaceStore(rootDir);
    this.format = format;
    this.writeTarget = writeTarget ?? (format === 'yaml' ? 'yaml' : 'json');
  }

  private get reader(): WorkspaceStore {
    if (this.format === 'yaml') return this.yamlStore;
    if (this.format === 'json') return this.jsonStore;
    // dual: try JSON first, but individual methods will merge
    return this.jsonStore;
  }

  private get writer(): WorkspaceStore {
    return this.writeTarget === 'yaml' ? this.yamlStore : this.jsonStore;
  }

  // ── Workspace ──────────────────────────────────────────────
  readWorkspace(): WorkspaceSpec | null {
    if (this.format === 'dual') {
      return this.jsonStore.readWorkspace() ?? this.yamlStore.readWorkspace();
    }
    return this.reader.readWorkspace();
  }
  writeWorkspace(ws: WorkspaceSpec): WorkspaceSpec { return this.writer.writeWorkspace(ws); }

  // ── Agents ─────────────────────────────────────────────────
  listAgents(): AgentSpec[] {
    if (this.format === 'dual') {
      const json = this.jsonStore.listAgents();
      return json.length > 0 ? json : this.yamlStore.listAgents();
    }
    return this.reader.listAgents();
  }
  getAgent(id: string): AgentSpec | null { return this.listAgents().find((a) => a.id === id) ?? null; }
  saveAgents(agents: AgentSpec[]): AgentSpec[] { return this.writer.saveAgents(agents); }

  // ── Flows ──────────────────────────────────────────────────
  listFlows(): FlowSpec[] {
    if (this.format === 'dual') {
      const json = this.jsonStore.listFlows();
      return json.length > 0 ? json : this.yamlStore.listFlows();
    }
    return this.reader.listFlows();
  }
  getFlow(id: string): FlowSpec | null { return this.listFlows().find((f) => f.id === id) ?? null; }
  saveFlows(flows: FlowSpec[]): FlowSpec[] { return this.writer.saveFlows(flows); }

  // ── Skills ─────────────────────────────────────────────────
  listSkills(): SkillSpec[] {
    if (this.format === 'dual') {
      const json = this.jsonStore.listSkills();
      return json.length > 0 ? json : this.yamlStore.listSkills();
    }
    return this.reader.listSkills();
  }
  getSkill(id: string): SkillSpec | null { return this.listSkills().find((s) => s.id === id) ?? null; }
  saveSkills(skills: SkillSpec[]): SkillSpec[] { return this.writer.saveSkills(skills); }

  // ── Policies ───────────────────────────────────────────────
  listPolicies(): PolicySpec[] {
    if (this.format === 'dual') {
      const json = this.jsonStore.listPolicies();
      return json.length > 0 ? json : this.yamlStore.listPolicies();
    }
    return this.reader.listPolicies();
  }
  getPolicy(id: string): PolicySpec | null { return this.listPolicies().find((p) => p.id === id) ?? null; }
  savePolicies(policies: PolicySpec[]): PolicySpec[] { return this.writer.savePolicies(policies); }

  // ── Hooks ──────────────────────────────────────────────────
  listHooks(): HookSpec[] {
    if (this.format === 'dual') {
      const json = this.jsonStore.listHooks();
      return json.length > 0 ? json : this.yamlStore.listHooks();
    }
    return this.reader.listHooks();
  }
  getHook(id: string): HookSpec | null { return this.listHooks().find((h) => h.id === id) ?? null; }
  saveHooks(hooks: HookSpec[]): HookSpec[] { return this.writer.saveHooks(hooks); }
}
