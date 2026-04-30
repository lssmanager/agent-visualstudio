/**
 * Barrel — packages/run-engine/src/repositories/
 *
 * Jerarquía (F0-04):  Agency → Department → Workspace → Agent
 * Ejecución (F0-05):  Run → RunStep
 * Gateway (F0-06):    ConversationMessage (append-only)
 * Skills (F1b-08):    Skill + AgentSkill
 */

// ── Jerarquía ──────────────────────────────────────────────────────────────────

export { AgencyRepository } from './agency.repository'
export type {
  CreateAgencyInput,
  UpdateAgencyInput,
  FindAgenciesOptions,
} from './agency.repository'

export { DepartmentRepository } from './department.repository'
export type {
  CreateDepartmentInput,
  UpdateDepartmentInput,
  FindDepartmentsOptions,
} from './department.repository'

export { WorkspaceRepository } from './workspace.repository'
export type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  FindWorkspacesOptions,
} from './workspace.repository'

export { AgentRepository } from './agent.repository'
export type {
  CreateAgentInput,
  UpdateAgentInput,
  FindAgentsOptions,
} from './agent.repository'

// ── Ejecución ────────────────────────────────────────────────────────────────

export { RunRepository } from './run.repository'
export type {
  CreateRunInput,
  FindRunsOptions,
  CreateApprovalInput,
} from './run.repository'

export { RunStepRepository } from './run-step.repository'
export type {
  CreateStepInput,
  CompleteStepInput,
  FailStepInput,
  FindStepsOptions,
} from './run-step.repository'

// ── Gateway / Conversaciones ─────────────────────────────────────────────

export { ConversationMessageRepository } from './conversation-message.repository'
export type {
  AppendMessageInput,
  FindMessagesOptions,
  MessageRole,
} from './conversation-message.repository'

// ── Skills ───────────────────────────────────────────────────────────────────

export { SkillRepository } from './skill.repository.js'
export type {
  CreateSkillInput,
  UpdateSkillInput,
  FindSkillsOptions,
  AssignSkillInput,
  UpdateAssignmentInput,
} from './skill.repository.js'
