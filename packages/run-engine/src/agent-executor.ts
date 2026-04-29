import type { PrismaClient } from '@prisma/client';
import type { FlowSpec, RunTrigger } from '../../core-types/src';

import { FlowExecutor } from './flow-executor';
import { RunRepository } from './run-repository';
import { InMemoryRunRepository } from './in-memory-run-repository';
import { ApprovalQueue } from './approval-queue';

export interface AgentExecutorOptions {
  db: PrismaClient;
  maxToolRounds?: number;
}

export interface ExecuteFlowInput {
  workspaceId:  string;
  agentId?:     string;
  flow:         FlowSpec;
  trigger:      RunTrigger;
  sessionId?:   string;
  channelKind?: string;
}

export interface ExecuteFlowResult {
  runId:       string;
  status:      'completed' | 'failed' | 'cancelled';
  outputData?: unknown;
  error?:      string;
  steps: Array<{
    nodeId:             string;
    nodeType:           string;
    status:             string;
    costUsd?:           number;
    promptTokens?:      number;
    completionTokens?:  number;
    model?:             string;
  }>;
}

/**
 * AgentExecutor — NestJS-injectable service that orchestrates full agent execution.
 *
 * Architecture:
 *   1. createRun()  → create Run row in Prisma (durable, before execution starts)
 *   2. InMemoryRunRepository → synchronous adapter that FlowExecutor requires
 *   3. FlowExecutor.startRun() → async execution against in-memory store
 *   4. waitForCompletion() → poll until terminal state
 *   5. Sync each RunStep result back to Prisma via RunRepository
 *
 * This pattern decouples FlowExecutor's synchronous graph-walk from
 * the async Prisma writes, while guaranteeing every completed run is
 * durably persisted even if the process restarts between steps.
 */
export class AgentExecutor {
  private readonly runRepo:       RunRepository;
  private readonly approvalQueue: ApprovalQueue;

  constructor(private readonly opts: AgentExecutorOptions) {
    this.runRepo       = new RunRepository(opts.db);
    this.approvalQueue = new ApprovalQueue();
  }

  async execute(input: ExecuteFlowInput): Promise<ExecuteFlowResult> {
    // ── 1. Create Run in Prisma ─────────────────────────────────────────────
    const prismaRun = await this.runRepo.createRun({
      workspaceId: input.workspaceId,
      agentId:     input.agentId,
      flowId:      input.flow.id,
      sessionId:   input.sessionId,
      channelKind: input.channelKind,
      inputData:   input.trigger.payload as Record<string, unknown>,
    });
    await this.runRepo.startRun(prismaRun.id);

    // ── 2. In-memory repository for FlowExecutor ────────────────────────────
    const memRepo = new InMemoryRunRepository();

    // ── 3. Build FlowExecutor with real db (LlmStepExecutor) ────────────────
    const flowExec = new FlowExecutor({
      workspaceId:   input.workspaceId,
      repository:    memRepo,
      approvalQueue: this.approvalQueue,
      db:            this.opts.db,
      maxToolRounds: this.opts.maxToolRounds,
    });

    // ── 4. Kick off execution (async, returns immediately) ──────────────────
    const runSpec = flowExec.startRun(input.flow, input.trigger);

    // ── 5. Poll until terminal state ────────────────────────────────────────
    await this.waitForCompletion(memRepo, runSpec.id);

    const finalRun = memRepo.findById(runSpec.id);
    if (!finalRun) {
      throw new Error(
        `AgentExecutor: run '${runSpec.id}' disappeared from memory after completion`,
      );
    }

    // ── 6. Sync each RunStep to Prisma ──────────────────────────────────────
    let stepIndex = 0;
    for (const step of finalRun.steps) {
      if (step.status === 'completed') {
        const prismaStep = await this.runRepo.upsertStep({
          runId:    prismaRun.id,
          nodeId:   step.nodeId,
          nodeType: step.nodeType,
          index:    stepIndex++,
          input:    {},
        });
        await this.runRepo.completeStep({
          stepId:           prismaStep.id,
          output:           step.output ?? {},
          model:            (step.output as Record<string, unknown> | undefined)?.['model'] as string | undefined,
          promptTokens:     step.tokenUsage?.input,
          completionTokens: step.tokenUsage?.output,
          totalTokens:      step.tokenUsage
            ? step.tokenUsage.input + step.tokenUsage.output
            : undefined,
          costUsd:          step.costUsd,
        });
      } else if (step.status === 'failed') {
        const prismaStep = await this.runRepo.upsertStep({
          runId:    prismaRun.id,
          nodeId:   step.nodeId,
          nodeType: step.nodeType,
          index:    stepIndex++,
          input:    {},
        });
        await this.runRepo.failStep({
          stepId: prismaStep.id,
          error:  step.error ?? 'Unknown error',
        });
      }
      // skipped / waiting_approval steps are intentionally not persisted
    }

    // ── 7. Close Run in Prisma ───────────────────────────────────────────────
    if (finalRun.status === 'completed') {
      const lastStep = finalRun.steps.at(-1);
      await this.runRepo.completeRun(prismaRun.id, lastStep?.output ?? {});
    } else if (finalRun.status === 'failed') {
      await this.runRepo.failRun(prismaRun.id, finalRun.error ?? 'Run failed');
    } else if (finalRun.status === 'cancelled') {
      await this.runRepo.cancelRun(prismaRun.id);
    }

    // ── 8. Return result ─────────────────────────────────────────────────────
    return {
      runId:      prismaRun.id,
      status:     finalRun.status as ExecuteFlowResult['status'],
      outputData: finalRun.steps.at(-1)?.output,
      error:      finalRun.error,
      steps:      finalRun.steps.map((s) => ({
        nodeId:           s.nodeId,
        nodeType:         s.nodeType,
        status:           s.status,
        costUsd:          s.costUsd,
        promptTokens:     s.tokenUsage?.input,
        completionTokens: s.tokenUsage?.output,
        model:            (s.output as Record<string, unknown> | undefined)?.['model'] as string | undefined,
      })),
    };
  }

  /**
   * Poll the in-memory repository until the run reaches a terminal state.
   *
   * FlowExecutor uses setImmediate internally — we yield the event loop
   * every 10 ms so those microtasks can run between checks.
   *
   * @param repo        The InMemoryRunRepository passed to FlowExecutor.
   * @param runId       The run to watch.
   * @param timeoutMs   Hard deadline (default: 5 minutes).
   */
  private async waitForCompletion(
    repo:      InMemoryRunRepository,
    runId:     string,
    timeoutMs: number = 5 * 60 * 1_000,
  ): Promise<void> {
    const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const run = repo.findById(runId);
      if (run && TERMINAL.has(run.status)) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }

    throw new Error(
      `AgentExecutor: run '${runId}' did not reach a terminal state within ${timeoutMs}ms`,
    );
  }
}
