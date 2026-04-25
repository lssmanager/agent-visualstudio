import type { PrismaClient } from '@prisma/client';
import {
  AgentSpec,
  FlowSpec,
  SkillSpec,
  PolicySpec,
  WorkspaceSpec,
  HookSpec,
} from '../../core-types/src';
import { WorkspaceStore } from './workspace-store';

/**
 * PrismaWorkspaceStore — implementación PostgreSQL del contrato WorkspaceStore.
 *
 * Estrategia:
 *   • Workspace, Agent, Flow, Skill, Policy, Hook se guardan como filas Prisma.
 *   • Los campos que en la spec son objetos anidados se persisten como columna
 *     JSON (`config`, `tools`, `nodes`, etc.) para máxima fidelidad con los tipos
 *     existentes sin romper el contrato.
 *   • Todos los métodos son *síncronos* según la interfaz abstracta; se usan
 *     wrappers que devuelven el resultado cacheado tras una precarga async.
 *     Para producción real conviene refactorizar WorkspaceStore a async.
 */
export class PrismaWorkspaceStore extends WorkspaceStore {
  // Cache en memoria para mantener la API síncrona de WorkspaceStore
  private _workspace: WorkspaceSpec | null = null;
  private _agents:    AgentSpec[]          = [];
  private _flows:     FlowSpec[]           = [];
  private _skills:    SkillSpec[]          = [];
  private _policies:  PolicySpec[]         = [];
  private _hooks:     HookSpec[]           = [];

  constructor(
    private readonly prisma: PrismaClient,
    private readonly workspaceId: string,
  ) {
    super();
  }

  // ── Bootstrap: llama esto una sola vez al arrancar el módulo ──────────────
  async preload(): Promise<void> {
    const [ws, agents, flows, skills, policies, hooks] = await Promise.all([
      this.prisma.workspace.findUnique({ where: { id: this.workspaceId } }),
      this.prisma.agent.findMany({ where: { workspaceId: this.workspaceId } }),
      this.prisma.flow.findMany({ where: { workspaceId: this.workspaceId } }),
      this.prisma.skill.findMany({ where: { workspaceId: this.workspaceId } }),
      this.prisma.policy.findMany({ where: { workspaceId: this.workspaceId } }),
      this.prisma.hook.findMany({ where: { workspaceId: this.workspaceId } }),
    ]);

    this._workspace = ws ? this._mapWorkspace(ws) : null;
    this._agents    = agents.map(this._mapAgent);
    this._flows     = flows.map(this._mapFlow);
    this._skills    = skills.map(this._mapSkill);
    this._policies  = policies.map(this._mapPolicy);
    this._hooks     = hooks.map(this._mapHook);
  }

  // ── Workspace ──────────────────────────────────────────────────────────────
  readWorkspace(): WorkspaceSpec | null { return this._workspace; }

  writeWorkspace(ws: WorkspaceSpec): WorkspaceSpec {
    this._workspace = ws;
    // Escribe en background — no esperamos para mantener API síncrona
    // config property doesn't exist on WorkspaceSpec, so we omit it
    this.prisma.workspace.upsert({
      where:  { id: this.workspaceId },
      update: { name: ws.name, description: ws.description ?? '' },
      create: { id: this.workspaceId, name: ws.name, description: ws.description ?? '' },
    }).catch(console.error);
    return ws;
  }

  // ── Agents ─────────────────────────────────────────────────────────────────
  listAgents(): AgentSpec[] { return this._agents; }

  getAgent(id: string): AgentSpec | null {
    return this._agents.find((a) => a.id === id) ?? null;
  }

  saveAgents(agents: AgentSpec[]): AgentSpec[] {
    this._agents = agents;
    // Upsert en background
    const ops = agents.map((a) =>
      this.prisma.agent.upsert({
        where:  { id: a.id },
        update: this._agentToDb(a),
        create: { id: a.id, workspaceId: this.workspaceId, ...this._agentToDb(a) },
      }),
    );
    this.prisma.$transaction(ops).catch(console.error);
    return agents;
  }

  // ── Flows ──────────────────────────────────────────────────────────────────
  listFlows(): FlowSpec[] { return this._flows; }

  getFlow(id: string): FlowSpec | null {
    return this._flows.find((f) => f.id === id) ?? null;
  }

  saveFlows(flows: FlowSpec[]): FlowSpec[] {
    this._flows = flows;
    const ops = flows.map((f) =>
      this.prisma.flow.upsert({
        where:  { id: f.id },
        update: this._flowToDb(f),
        create: { id: f.id, workspaceId: this.workspaceId, ...this._flowToDb(f) },
      }),
    );
    this.prisma.$transaction(ops).catch(console.error);
    return flows;
  }

  // ── Skills ─────────────────────────────────────────────────────────────────
  listSkills(): SkillSpec[] { return this._skills; }

  getSkill(id: string): SkillSpec | null {
    return this._skills.find((s) => s.id === id) ?? null;
  }

  saveSkills(skills: SkillSpec[]): SkillSpec[] {
    this._skills = skills;
    const ops = skills.map((s) =>
      this.prisma.skill.upsert({
        where:  { id: s.id },
        update: this._skillToDb(s),
        create: { id: s.id, workspaceId: this.workspaceId, ...this._skillToDb(s) },
      }),
    );
    this.prisma.$transaction(ops).catch(console.error);
    return skills;
  }

  // ── Policies ───────────────────────────────────────────────────────────────
  listPolicies(): PolicySpec[] { return this._policies; }

  getPolicy(id: string): PolicySpec | null {
    return this._policies.find((p) => p.id === id) ?? null;
  }

  savePolicies(policies: PolicySpec[]): PolicySpec[] {
    this._policies = policies;
    const ops = policies.map((p) =>
      this.prisma.policy.upsert({
        where:  { id: p.id },
        update: this._policyToDb(p),
        create: { id: p.id, workspaceId: this.workspaceId, ...this._policyToDb(p) },
      }),
    );
    this.prisma.$transaction(ops).catch(console.error);
    return policies;
  }

  // ── Hooks ──────────────────────────────────────────────────────────────────
  listHooks(): HookSpec[] { return this._hooks; }

  getHook(id: string): HookSpec | null {
    return this._hooks.find((h) => h.id === id) ?? null;
  }

  saveHooks(hooks: HookSpec[]): HookSpec[] {
    this._hooks = hooks;
    const ops = hooks.map((h) =>
      this.prisma.hook.upsert({
        where:  { id: h.id },
        update: this._hookToDb(h),
        create: { id: h.id, workspaceId: this.workspaceId, ...this._hookToDb(h) },
      }),
    );
    this.prisma.$transaction(ops).catch(console.error);
    return hooks;
  }

  // ── Mappers: DB → Spec ─────────────────────────────────────────────────────
  private _mapWorkspace(row: any): WorkspaceSpec {
    return { id: row.id, name: row.name, description: row.description } as WorkspaceSpec;
  }

  private _mapAgent(row: any): AgentSpec {
    return {
      id: row.id, name: row.name, description: row.description,
      role: row.role, goal: row.goal, backstory: row.backstory,
      model: row.model, tools: row.tools ?? [], ...row.config,
    } as AgentSpec;
  }

  private _mapFlow(row: any): FlowSpec {
    return { id: row.id, name: row.name, description: row.description, nodes: row.nodes ?? [], edges: row.edges ?? [], ...row.config } as FlowSpec;
  }

  private _mapSkill(row: any): SkillSpec {
    return { id: row.id, name: row.name, description: row.description, type: row.type, ...row.config } as SkillSpec;
  }

  private _mapPolicy(row: any): PolicySpec {
    return { id: row.id, name: row.name, description: row.description, rules: row.rules ?? [], ...row.config } as PolicySpec;
  }

  private _mapHook(row: any): HookSpec {
    return { id: row.id, name: row.name, event: row.event, action: row.action ?? {}, enabled: row.enabled } as HookSpec;
  }

  // ── Mappers: Spec → DB ─────────────────────────────────────────────────────
  private _agentToDb(a: AgentSpec) {
    const { id, name, description, role, goal, backstory, model, tools, ...rest } = a as any;
    return { name, description: description ?? '', role: role ?? '', goal: goal ?? '', backstory: backstory ?? '', model: model ?? 'gpt-4o-mini', tools: tools ?? [], config: rest };
  }

  private _flowToDb(f: FlowSpec) {
    const { id, name, description, nodes, edges, ...rest } = f as any;
    return { name, description: description ?? '', nodes: nodes ?? [], edges: edges ?? [], config: rest };
  }

  private _skillToDb(s: SkillSpec) {
    const { id, name, description, type, ...rest } = s as any;
    return { name, description: description ?? '', type: type ?? 'function', config: rest };
  }

  private _policyToDb(p: PolicySpec) {
    const { id, name, description, rules, ...rest } = p as any;
    return { name, description: description ?? '', rules: rules ?? [], config: rest };
  }

  private _hookToDb(h: HookSpec) {
    return { name: h.name, event: h.event, action: (h as any).action ?? {}, enabled: (h as any).enabled ?? true };
  }
}
