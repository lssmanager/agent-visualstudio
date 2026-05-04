export type RunStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type StepStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'skipped'
  // Added F6-09: blocked state for failed delegation (HierarchyOrchestrator F2a-07)
  | 'blocked';

export interface RunTrigger {
  type: string;
  payload?: Record<string, unknown>;
}

export interface RunStepTokenUsage {
  input: number;
  output: number;
}

export interface RunStep {
  id: string;
  runId: string;
  nodeId: string;
  nodeType: string;
  status: StepStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  agentId?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  tokenUsage?: RunStepTokenUsage;
  costUsd?: number;
  retryCount?: number;
}

export interface RunSpec {
  id: string;
  workspaceId: string;
  flowId: string;
  status: RunStatus;
  trigger: RunTrigger;
  steps: RunStep[];
  startedAt: string;
  completedAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}
