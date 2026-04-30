/**
 * @deprecated F0-08 — WorkspaceStore (JSON/YAML in-memory persistence) is
 * superseded by Prisma repositories. All consumers must migrate before F1.
 *
 * Migration map:
 *   listAgents / getAgent / saveAgents  →  AgentRepository   (apps/api/src/modules/agents/agents.repository.ts)
 *   listFlows  / getFlow  / saveFlows   →  FlowRepository    (apps/api/src/modules/flows/flows.repository.ts)
 *   listSkills / getSkill / saveSkills  →  SkillRepository   (apps/api/src/modules/skills/skills.repository.ts)
 *   listPolicies / getPolicy / …        →  PoliciesRepository(apps/api/src/modules/policies/policies.repository.ts)
 *   readWorkspace / writeWorkspace      →  WorkspaceRepository(apps/api/src/modules/workspaces/workspaces.repository.ts)
 *   listHooks / getHook / saveHooks     →  (to be added in F1-hooks module)
 *
 * @see packages/workspace-store/DEPRECATED.md
 */

import {
  AgentSpec,
  FlowSpec,
  SkillSpec,
  PolicySpec,
  WorkspaceSpec,
  HookSpec,
} from '../../core-types/src';

/**
 * @deprecated Use Prisma repositories instead.
 * See migration guide: packages/workspace-store/DEPRECATED.md
 */
export abstract class WorkspaceStore {
  // ── Workspace ──────────────────────────────────────────────
  /** @deprecated Use WorkspaceRepository.findById() */
  abstract readWorkspace(): WorkspaceSpec | null;
  /** @deprecated Use WorkspaceRepository.upsert() */
  abstract writeWorkspace(workspace: WorkspaceSpec): WorkspaceSpec;

  // ── Agents ─────────────────────────────────────────────────
  /** @deprecated Use AgentRepository.findAll() */
  abstract listAgents(): AgentSpec[];
  /** @deprecated Use AgentRepository.findById() */
  abstract getAgent(id: string): AgentSpec | null;
  /** @deprecated Use AgentRepository.upsertMany() */
  abstract saveAgents(agents: AgentSpec[]): AgentSpec[];

  // ── Flows ──────────────────────────────────────────────────
  /** @deprecated Use FlowRepository.findAll() */
  abstract listFlows(): FlowSpec[];
  /** @deprecated Use FlowRepository.findById() */
  abstract getFlow(id: string): FlowSpec | null;
  /** @deprecated Use FlowRepository.upsertMany() */
  abstract saveFlows(flows: FlowSpec[]): FlowSpec[];

  // ── Skills ─────────────────────────────────────────────────
  /** @deprecated Use SkillRepository.findAll() */
  abstract listSkills(): SkillSpec[];
  /** @deprecated Use SkillRepository.findById() */
  abstract getSkill(id: string): SkillSpec | null;
  /** @deprecated Use SkillRepository.upsertMany() */
  abstract saveSkills(skills: SkillSpec[]): SkillSpec[];

  // ── Policies ───────────────────────────────────────────────
  /** @deprecated Use PoliciesRepository.findAll() */
  abstract listPolicies(): PolicySpec[];
  /** @deprecated Use PoliciesRepository.findById() */
  abstract getPolicy(id: string): PolicySpec | null;
  /** @deprecated Use PoliciesRepository.upsertMany() */
  abstract savePolicies(policies: PolicySpec[]): PolicySpec[];

  // ── Hooks ──────────────────────────────────────────────────
  /** @deprecated Use HookRepository (F1) */
  abstract listHooks(): HookSpec[];
  /** @deprecated Use HookRepository (F1) */
  abstract getHook(id: string): HookSpec | null;
  /** @deprecated Use HookRepository (F1) */
  abstract saveHooks(hooks: HookSpec[]): HookSpec[];
}
