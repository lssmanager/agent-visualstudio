/**
 * run-engine public API
 */

// ── Step execution ───────────────────────────────────────────────────────────
export { LLMStepExecutor } from './llm-step-executor';

export type {
  StepExecutionResult,
  StepExecutorOptions,
  ConditionContext,
} from './step-executor';
export { StepExecutor } from './step-executor';

// ── Agent executor ─────────────────────────────────────────────────────────
export { AgentExecutor } from './agent-executor.service';
export type { AgentExecutorFn } from './agent-executor.service';

// ── Flow executor ──────────────────────────────────────────────────────────
export { FlowExecutor } from './flow-executor';
export type {
  FlowSpec,
  FlowNode,
  IRunRepository,
  FlowExecutorDeps,
} from './flow-executor';

// ── Condition evaluation ─────────────────────────────────────────────────────
export { executeCondition, ConditionSyntaxError, ConditionRuntimeError } from './execute-condition';

// ── Run repository (Prisma) ───────────────────────────────────────────────────
export type {
  CreateRunInput,
  UpsertStepInput,
  CompleteStepInput,
  FailStepInput,
} from './run-repository';
export { RunRepository } from './run-repository';

// ── In-memory run repository (testing / no-DB path) ───────────────────────
export { InMemoryRunRepository } from './in-memory-run-repository';

// ── Approval queue (in-memory) ───────────────────────────────────────────────
export type { PendingApproval } from './approval-queue';
export { ApprovalQueue } from './approval-queue';

// ── Events — F2a-10 ──────────────────────────────────────────────────────────
export * from './events/index.js';
