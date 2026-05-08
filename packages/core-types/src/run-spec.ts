// run-spec.ts — tipos canónicos para runs y steps
// fix(tsc): agregar campos faltantes a RunStep/RunStepSpec que el runtime usa
// departmentId: string | null para soporte multi-tenant (Agency → Department → Workspace)

export type RunStatus =
  | 'queued'
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type StepStatus =
  | 'queued'
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'skipped'
  // F6-09: blocked state for failed delegation (HierarchyOrchestrator F2a-07)
  | 'blocked';

export interface RunTrigger {
  type: string;
  payload?: Record<string, unknown>;
}

export interface RunStepTokenUsage {
  input: number;
  output: number;
}

/**
 * RunStep — representación en memoria de un paso de ejecución.
 * fix(tsc): se agregan los campos que llm-step-executor y run-repository
 * leen/escriben pero que no existían en el tipo:
 *   - costUsd:       costo calculado por el step (Decimal en DB → number aquí)
 *   - departmentId:  scope multi-tenant; null cuando el workspace no pertenece a un department
 *   - model:         modelo LLM usado en este step
 *   - provider:      proveedor LLM (openai, anthropic, etc.)
 *   - tokenUsage:    desglose de tokens (alias de RunStepTokenUsage)
 */
export interface RunStep {
  id: string;
  runId: string;
  nodeId: string;
  nodeType: string;
  status: StepStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  agentId?: string;
  /** ID del Department al que pertenece el workspace del run. null si no aplica. */
  departmentId?: string | null;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  tokenUsage?: RunStepTokenUsage;
  /** Costo en USD calculado por el executor (Decimal de Prisma convertido a number). */
  costUsd?: number;
  retryCount?: number;
  /** Modelo LLM utilizado en este step (e.g. 'gpt-4o-mini'). */
  model?: string;
  /** Proveedor LLM (e.g. 'openai', 'anthropic', 'google'). */
  provider?: string;
}

/**
 * RunStepSpec — alias de RunStep para uso en el executor.
 * Algunos módulos importan RunStepSpec como forma más explícita del tipo.
 */
export type RunStepSpec = RunStep;

export interface RunSpec {
  id: string;
  workspaceId: string;
  flowId?: string;
  agentId?: string;
  status: RunStatus;
  trigger: RunTrigger;
  steps: RunStep[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}
