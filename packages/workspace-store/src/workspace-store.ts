import {
  AgentSpec,
  FlowSpec,
  SkillSpec,
  PolicySpec,
  WorkspaceSpec,
  HookSpec,
} from '../../core-types/src';

/**
 * Abstract workspace store — the contract all persistence backends must implement.
 * Repositories consume this interface instead of reading files directly.
 */
export abstract class WorkspaceStore {
  // ── Workspace ──────────────────────────────────────────────
  abstract readWorkspace(): WorkspaceSpec | null;
  abstract writeWorkspace(workspace: WorkspaceSpec): WorkspaceSpec;

  // ── Agents ─────────────────────────────────────────────────
  abstract listAgents(): AgentSpec[];
  abstract getAgent(id: string): AgentSpec | null;
  abstract saveAgents(agents: AgentSpec[]): AgentSpec[];

  // ── Flows ──────────────────────────────────────────────────
  abstract listFlows(): FlowSpec[];
  abstract getFlow(id: string): FlowSpec | null;
  abstract saveFlows(flows: FlowSpec[]): FlowSpec[];

  // ── Skills ─────────────────────────────────────────────────
  abstract listSkills(): SkillSpec[];
  abstract getSkill(id: string): SkillSpec | null;
  abstract saveSkills(skills: SkillSpec[]): SkillSpec[];

  // ── Policies ───────────────────────────────────────────────
  abstract listPolicies(): PolicySpec[];
  abstract getPolicy(id: string): PolicySpec | null;
  abstract savePolicies(policies: PolicySpec[]): PolicySpec[];

  // ── Hooks ──────────────────────────────────────────────────
  abstract listHooks(): HookSpec[];
  abstract getHook(id: string): HookSpec | null;
  abstract saveHooks(hooks: HookSpec[]): HookSpec[];
}
