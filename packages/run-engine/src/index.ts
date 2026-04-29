export { FlowExecutor, type FlowExecutorOptions } from './flow-executor';
export { StepExecutor, type StepExecutionResult } from './step-executor';
export {
  LlmStepExecutor,
  type GatewayRpcClient,
  type LlmStepExecutorOptions,
  BudgetExceededError,
} from './llm-step-executor';
/**
 * @deprecated Usar RunRepository + RunStepRepository de './repositories'.
 * Este export se mantiene por compatibilidad con FlowExecutor / HierarchyOrchestrator.
 */
export { RunRepository as RunRepositoryLegacy } from './run-repository';
export { ApprovalQueue, type PendingApproval } from './approval-queue';
export { PolicyResolver, type PolicyResolverContext } from './policy-resolver';
export { SkillInvoker, type SkillInvokeResult } from './skill-invoker';

// ── F0-04 / F0-05: Repositories ─────────────────────────────────────────────
export {
  // Jerarquía
  AgencyRepository,
  type CreateAgencyInput,
  type UpdateAgencyInput,
  type FindAgenciesOptions,
  DepartmentRepository,
  type CreateDepartmentInput,
  type UpdateDepartmentInput,
  type FindDepartmentsOptions,
  WorkspaceRepository,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
  type FindWorkspacesOptions,
  AgentRepository,
  type CreateAgentInput,
  type UpdateAgentInput,
  type FindAgentsOptions,
  // Ejecución
  RunRepository,
  type CreateRunInput,
  type FindRunsOptions,
  type CreateApprovalInput,
  RunStepRepository,
  type CreateStepInput,
  type CompleteStepInput,
  type FailStepInput,
  type FindStepsOptions,
} from './repositories';
