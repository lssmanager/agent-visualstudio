import crypto from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type { FlowSpec, FlowNode } from '../../core-types/src';
import type { RunSpec, RunStep, RunStatus, StepStatus, RunTrigger } from '../../core-types/src';

import { StepExecutor, type StepExecutionResult } from './step-executor';
import { RunRepository } from './run-repository';
import { ApprovalQueue } from './approval-queue';

/**
 * Minimal synchronous repository interface.
 * Exported for backward compatibility with InMemoryRunRepository
 * (used in tests and the F1a-05 adapter pattern).
 * FlowExecutor itself uses RunRepository (Prisma) directly.
 */
export interface IRunRepository {
  save(run: RunSpec): void;
  findById(runId: string): RunSpec | null;
}

export interface FlowExecutorOptions {
  workspaceId: string;
  /**
   * Prisma RunRepository — used for durable persistence.
   * Every run/step state transition is written to PostgreSQL.
   */
  repository: RunRepository;
  approvalQueue: ApprovalQueue;
  /**
   * Explicit StepExecutor — useful for tests and mock implementations.
   * Takes priority over `db` when provided.
   */
  stepExecutor?: StepExecutor;
  /**
   * PrismaClient — when provided (without stepExecutor),
   * FlowExecutor auto-constructs a StepExecutor backed by LlmStepExecutor.
   */
  db?: PrismaClient;
  maxToolRounds?: number;
}

/**
 * Traverses a FlowSpec graph and executes nodes sequentially.
 *
 * Dual-write pattern:
 *   - In-memory RunSpec/RunStep kept for StepExecutor context (previous step outputs).
 *   - Every state transition persisted to Prisma via RunRepository.
 *
 * Uses setImmediate-based scheduling to avoid blocking the event loop.
 *
 * Minimum usage with real LLM:
 *   new FlowExecutor({ workspaceId, repository, approvalQueue, db: prisma })
 *
 * Usage with custom executor (tests):
 *   new FlowExecutor({ workspaceId, repository, approvalQueue, stepExecutor: myExec })
 */
export class FlowExecutor {
  private readonly workspaceId: string;
  private readonly repository: RunRepository;
  private readonly stepExecutor: StepExecutor;
  private readonly approvalQueue: ApprovalQueue;

  constructor(options: FlowExecutorOptions) {
    this.workspaceId   = options.workspaceId;
    this.repository    = options.repository;
    this.approvalQueue = options.approvalQueue;

    if (options.stepExecutor) {
      this.stepExecutor = options.stepExecutor;
    } else if (options.db) {
      this.stepExecutor = new StepExecutor({
        db:            options.db,
        maxToolRounds: options.maxToolRounds,
      });
    } else {
      this.stepExecutor = new StepExecutor();
    }
  }

  /**
   * Create a Run in Prisma, build an in-memory RunSpec, and schedule async execution.
   * Returns the RunSpec immediately (status: 'queued'). Execution continues in background.
   */
  async startRun(
    flow:    FlowSpec,
    trigger: RunTrigger,
    opts?:   { agentId?: string; sessionId?: string; channelKind?: string },
  ): Promise<RunSpec> {
    // 1. Create durable Run record in Prisma (status: 'pending')
    const dbRun = await this.repository.createRun({
      workspaceId: this.workspaceId,
      flowId:      flow.id,
      agentId:     opts?.agentId,
      sessionId:   opts?.sessionId,
      channelKind: opts?.channelKind,
      inputData:   trigger.payload  as Record<string, unknown> | undefined,
      metadata:    (trigger as Record<string, unknown>)['metadata'] as Record<string, unknown> | undefined,
    });

    // 2. Build in-memory RunSpec — shares ID with the Prisma row
    const run: RunSpec = {
      id:          dbRun.id,
      workspaceId: this.workspaceId,
      flowId:      flow.id,
      status:      'queued',
      trigger,
      steps:       [],
      startedAt:   dbRun.createdAt.toISOString(),
    };

    // 3. Schedule async execution (yields control to caller first)
    setImmediate(() => void this.executeRun(run.id, flow, run));

    return run;
  }

  /**
   * Cancel a run — persists 'cancelled' status to Prisma.
   * In-memory RunSpec (if any) is not modified here; callers own that reference.
   */
  async cancelRun(runId: string): Promise<void> {
    await this.repository.cancelRun(runId);
  }

  // ── Private execution methods ─────────────────────────────────────────────

  private async executeRun(runId: string, flow: FlowSpec, run: RunSpec): Promise<void> {
    // Transition Prisma run to 'running'
    await this.repository.startRun(runId);
    run.status = 'running';

    try {
      const startNode = this.findStartNode(flow);
      if (!startNode) {
        const msg = 'No trigger or start node found in flow';
        run.status = 'failed';
        run.error  = msg;
        await this.repository.failRun(runId, msg);
        return;
      }

      await this.walkGraph(run, flow, startNode.id);

      // Cancelled during walk — Prisma already updated by cancelRun()
      if (run.status === 'cancelled') return;

      if (run.status !== 'waiting_approval') {
        const hasFailed = run.steps.some((s) => s.status === 'failed');
        run.completedAt = new Date().toISOString();

        if (hasFailed) {
          const failedStep = run.steps.find((s) => s.status === 'failed');
          const errMsg = failedStep?.error ?? 'Step failed';
          run.status = 'failed';
          run.error  = errMsg;
          await this.repository.failRun(runId, errMsg);
        } else {
          run.status = 'completed';
          const lastOutput = run.steps.at(-1)?.output ?? {};
          await this.repository.completeRun(runId, lastOutput);
        }
      }
    } catch (err) {
      if (run.status !== 'cancelled') {
        const errMsg = err instanceof Error ? err.message : String(err);
        run.status = 'failed';
        run.error  = errMsg;
        await this.repository.failRun(runId, errMsg);
      }
    }
  }

  private async walkGraph(run: RunSpec, flow: FlowSpec, currentNodeId: string): Promise<void> {
    const visited   = new Set<string>();
    let nodeId: string | null = currentNodeId;
    let stepIndex = 0;

    while (nodeId) {
      if (run.status === 'cancelled') return;
      if (visited.has(nodeId)) break;
      visited.add(nodeId);

      const node = flow.nodes.find((n) => n.id === nodeId);
      if (!node) break;

      // ── 1. Build in-memory step ────────────────────────────────────────
      const step: RunStep = {
        id:         crypto.randomUUID(),   // temporary ID until Prisma generates real one
        runId:      run.id,
        nodeId:     node.id,
        nodeType:   node.type,
        status:     'queued',
        startedAt:  new Date().toISOString(),
        retryCount: 0,
      };
      run.steps.push(step);

      // ── 2. Persist step (status: 'running') to Prisma ─────────────────
      let dbStep: { id: string } | undefined;
      try {
        dbStep = await this.repository.createStep({
          runId:    run.id,
          nodeId:   node.id,
          nodeType: node.type,
          index:    stepIndex,
          input:    { nodeConfig: (node as Record<string, unknown>)['config'] ?? {} },
        });
        step.id = dbStep.id;  // replace temp UUID with Prisma-generated ID
      } catch (createErr) {
        console.error('[FlowExecutor] createStep failed (non-fatal):', createErr);
      }

      step.status = 'running';

      // ── 3. Approval node — pause and wait for human input ─────────────
      if (node.type === 'approval') {
        step.status = 'waiting_approval';
        run.status  = 'waiting_approval';
        this.approvalQueue.enqueue(run.id, step.id);
        return;
      }

      // ── 4. Execute node via StepExecutor ──────────────────────────────
      await new Promise<void>((resolve) => setImmediate(resolve));
      const result = await this.stepExecutor.execute(node, step, run);

      // ── 5. Update in-memory step (needed by later steps for context) ──
      step.status      = result.status;
      step.output      = result.output;
      step.error       = result.error;
      step.tokenUsage  = result.tokenUsage;
      step.costUsd     = result.costUsd;
      step.completedAt = new Date().toISOString();

      // ── 6. Persist step result to Prisma ──────────────────────────────
      if (dbStep) {
        const out = result.output as Record<string, unknown> | undefined;
        if (result.status === 'completed') {
          this.repository.completeStep({
            stepId:           dbStep.id,
            output:           result.output ?? {},
            model:            out?.['model']    as string | undefined,
            provider:         out?.['provider'] as string | undefined,
            promptTokens:     result.tokenUsage?.input,
            completionTokens: result.tokenUsage?.output,
            totalTokens:      result.tokenUsage
              ? result.tokenUsage.input + result.tokenUsage.output
              : undefined,
            costUsd:          result.costUsd,
          }).catch((e) => console.error('[FlowExecutor] completeStep failed:', e));
        } else if (result.status === 'failed') {
          this.repository.failStep({
            stepId: dbStep.id,
            error:  result.error ?? 'Unknown error',
          }).catch((e) => console.error('[FlowExecutor] failStep failed:', e));
        } else if (result.status === 'skipped') {
          this.repository.skipStep(dbStep.id)
            .catch((e) => console.error('[FlowExecutor] skipStep failed:', e));
        }
      }

      stepIndex++;

      if (result.status === 'failed') break;
      if (node.type === 'end')        break;

      nodeId = this.resolveNextNode(flow, node, result);
    }
  }

  private findStartNode(flow: FlowSpec): FlowNode | undefined {
    const trigger = flow.nodes.find((n) => n.type === 'trigger');
    if (trigger) return trigger;
    const targets = new Set(flow.edges.map((e) => e.to));
    const roots = flow.nodes.filter((n) => !targets.has(n.id));
    return roots[0] ?? flow.nodes[0];
  }

  private resolveNextNode(
    flow:        FlowSpec,
    currentNode: FlowNode,
    result:      StepExecutionResult,
  ): string | null {
    const outEdges = flow.edges.filter((e) => e.from === currentNode.id);
    if (outEdges.length === 0) return null;

    if (currentNode.type === 'condition' && outEdges.length > 1) {
      const outcomeEdge = outEdges.find((e) => e.condition === result.branch);
      if (outcomeEdge) return outcomeEdge.to;
      const defaultEdge = outEdges.find((e) => !e.condition) ?? outEdges[0];
      return defaultEdge.to;
    }

    return outEdges[0].to;
  }

  /**
   * Handle human-in-the-loop approval response.
   * Persists step + run status to Prisma regardless of outcome.
   *
   * After approval, resuming graph execution from the next node is the
   * caller's responsibility (e.g. a webhook handler that calls startRun again
   * from the node following the approval step).
   */
  async resumeAfterApproval(
    runId:    string,
    stepId:   string,
    approved: boolean,
    reason?:  string,
  ): Promise<void> {
    if (!approved) {
      await this.repository.failStep({
        stepId,
        error: reason ?? 'Approval rejected',
      });
      await this.repository.failRun(
        runId,
        `Approval rejected: ${reason ?? 'No reason'}`,
      );
      return;
    }

    // Approved: mark step completed, resume run
    await this.repository.completeStep({
      stepId,
      output: { approved: true },
    });
    await this.repository.setRunStatus(runId, 'running');
  }
}
