import {
  AgentSpec,
  FlowSpec,
  SkillSpec,
  PolicySpec,
  WorkspaceSpec,
  HookSpec,
} from '../../core-types/src';
import { WorkspaceStore } from './workspace-store';
import { parseOpenclawDir } from '../../openclaw-fs/src/parser';
import {
  writeWorkspaceConfig,
  writeAllAgents,
  writeAllFlows,
  writeAllSkills,
  writeAllPolicies,
  writeHooks,
} from '../../openclaw-fs/src/writer';

/**
 * YAML-based workspace store — reads/writes `.openclaw/` directory.
 *
 * The `.openclaw/config.yaml` acts as the workspace spec, but since the
 * backend still works with WorkspaceSpec, we convert between formats.
 */
export class YamlWorkspaceStore extends WorkspaceStore {
  constructor(private readonly rootDir: string) {
    super();
  }

  private parseDir() {
    return parseOpenclawDir(this.rootDir);
  }

  // ── Workspace ──────────────────────────────────────────────
  readWorkspace(): WorkspaceSpec | null {
    const parsed = this.parseDir();
    if (!parsed) return null;
    // Convert WorkspaceConfig → WorkspaceSpec (best-effort mapping)
    const c = parsed.config;
    return {
      id: c.slug,
      slug: c.slug,
      name: c.name,
      description: c.description,
      owner: c.owner,
      defaultModel: c.defaultModel,
      agentIds: parsed.agents.map((a) => a.id),
      skillIds: parsed.skills.map((s) => s.id),
      flowIds: parsed.flows.map((f) => f.id),
      profileIds: [],
      policyRefs: parsed.policies.map((p) => ({ id: p.id, scope: 'workspace' as const })),
      routingRules: [],
      routines: [],
      tags: c.tags ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  writeWorkspace(workspace: WorkspaceSpec): WorkspaceSpec {
    writeWorkspaceConfig(this.rootDir, {
      version: '1',
      name: workspace.name,
      slug: workspace.slug,
      description: workspace.description,
      owner: workspace.owner,
      defaultModel: workspace.defaultModel ?? 'openai/gpt-5.4-mini',
      agents: (this.listAgents()).map((a) => `agents/${a.id}.yaml`),
      flows: (this.listFlows()).map((f) => `flows/${f.id}.yaml`),
      skills: workspace.skillIds ?? [],
      policies: (this.listPolicies()).map((p) => `policies/${p.id}.yaml`),
      tags: workspace.tags ?? [],
    });
    return workspace;
  }

  // ── Agents ─────────────────────────────────────────────────
  listAgents(): AgentSpec[] { return this.parseDir()?.agents ?? []; }
  getAgent(id: string): AgentSpec | null { return this.listAgents().find((a) => a.id === id) ?? null; }
  saveAgents(agents: AgentSpec[]): AgentSpec[] { writeAllAgents(this.rootDir, agents); return agents; }

  // ── Flows ──────────────────────────────────────────────────
  listFlows(): FlowSpec[] { return this.parseDir()?.flows ?? []; }
  getFlow(id: string): FlowSpec | null { return this.listFlows().find((f) => f.id === id) ?? null; }
  saveFlows(flows: FlowSpec[]): FlowSpec[] { writeAllFlows(this.rootDir, flows); return flows; }

  // ── Skills ─────────────────────────────────────────────────
  listSkills(): SkillSpec[] { return this.parseDir()?.skills ?? []; }
  getSkill(id: string): SkillSpec | null { return this.listSkills().find((s) => s.id === id) ?? null; }
  saveSkills(skills: SkillSpec[]): SkillSpec[] { writeAllSkills(this.rootDir, skills); return skills; }

  // ── Policies ───────────────────────────────────────────────
  listPolicies(): PolicySpec[] { return this.parseDir()?.policies ?? []; }
  getPolicy(id: string): PolicySpec | null { return this.listPolicies().find((p) => p.id === id) ?? null; }
  savePolicies(policies: PolicySpec[]): PolicySpec[] { writeAllPolicies(this.rootDir, policies); return policies; }

  // ── Hooks ──────────────────────────────────────────────────
  listHooks(): HookSpec[] { return this.parseDir()?.hooks ?? []; }
  getHook(id: string): HookSpec | null { return this.listHooks().find((h) => h.id === id) ?? null; }
  saveHooks(hooks: HookSpec[]): HookSpec[] { writeHooks(this.rootDir, hooks); return hooks; }
}
