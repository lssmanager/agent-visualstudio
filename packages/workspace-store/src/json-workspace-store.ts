import path from 'node:path';

import {
  AgentSpec,
  FlowSpec,
  SkillSpec,
  PolicySpec,
  WorkspaceSpec,
  HookSpec,
} from '../../core-types/src';
import { JsonFileStore } from '../../../apps/api/src/lib/file-store';
import { WorkspaceStore } from './workspace-store';

/**
 * JSON-based workspace store — wraps the existing JsonFileStore
 * to implement the WorkspaceStore contract. Drop-in replacement
 * for the current persistence layer (zero behavior change).
 */
export class JsonWorkspaceStore extends WorkspaceStore {
  private readonly workspaceStore: JsonFileStore<WorkspaceSpec | null>;
  private readonly agentsStore: JsonFileStore<AgentSpec[]>;
  private readonly flowsStore: JsonFileStore<FlowSpec[]>;
  private readonly skillsStore: JsonFileStore<SkillSpec[]>;
  private readonly policiesStore: JsonFileStore<PolicySpec[]>;
  private readonly hooksStore: JsonFileStore<HookSpec[]>;

  constructor(rootDir: string) {
    super();
    const studio = path.join(rootDir, '.openclaw-studio');
    this.workspaceStore = new JsonFileStore<WorkspaceSpec | null>(path.join(studio, 'workspace.spec.json'), null);
    this.agentsStore    = new JsonFileStore<AgentSpec[]>(path.join(studio, 'agents.spec.json'), []);
    this.flowsStore     = new JsonFileStore<FlowSpec[]>(path.join(studio, 'flows.spec.json'), []);
    this.skillsStore    = new JsonFileStore<SkillSpec[]>(path.join(studio, 'skills.spec.json'), []);
    this.policiesStore  = new JsonFileStore<PolicySpec[]>(path.join(studio, 'policies.spec.json'), []);
    this.hooksStore     = new JsonFileStore<HookSpec[]>(path.join(studio, 'hooks.spec.json'), []);
  }

  // ── Workspace ──────────────────────────────────────────────
  readWorkspace(): WorkspaceSpec | null { return this.workspaceStore.read(); }
  writeWorkspace(ws: WorkspaceSpec): WorkspaceSpec { return this.workspaceStore.write(ws); }

  // ── Agents ─────────────────────────────────────────────────
  listAgents(): AgentSpec[] { return this.agentsStore.read(); }
  getAgent(id: string): AgentSpec | null { return this.listAgents().find((a) => a.id === id) ?? null; }
  saveAgents(agents: AgentSpec[]): AgentSpec[] { return this.agentsStore.write(agents); }

  // ── Flows ──────────────────────────────────────────────────
  listFlows(): FlowSpec[] { return this.flowsStore.read(); }
  getFlow(id: string): FlowSpec | null { return this.listFlows().find((f) => f.id === id) ?? null; }
  saveFlows(flows: FlowSpec[]): FlowSpec[] { return this.flowsStore.write(flows); }

  // ── Skills ─────────────────────────────────────────────────
  listSkills(): SkillSpec[] { return this.skillsStore.read(); }
  getSkill(id: string): SkillSpec | null { return this.listSkills().find((s) => s.id === id) ?? null; }
  saveSkills(skills: SkillSpec[]): SkillSpec[] { return this.skillsStore.write(skills); }

  // ── Policies ───────────────────────────────────────────────
  listPolicies(): PolicySpec[] { return this.policiesStore.read(); }
  getPolicy(id: string): PolicySpec | null { return this.listPolicies().find((p) => p.id === id) ?? null; }
  savePolicies(policies: PolicySpec[]): PolicySpec[] { return this.policiesStore.write(policies); }

  // ── Hooks ──────────────────────────────────────────────────
  listHooks(): HookSpec[] { return this.hooksStore.read(); }
  getHook(id: string): HookSpec | null { return this.listHooks().find((h) => h.id === id) ?? null; }
  saveHooks(hooks: HookSpec[]): HookSpec[] { return this.hooksStore.write(hooks); }
}
