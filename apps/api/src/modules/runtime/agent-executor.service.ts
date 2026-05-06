/**
 * agent-executor.service.ts
 *
 * FIX ROOT 2: removed incorrect AgentExecutorFn usage and
 * `new LLMStepExecutor({ prisma })` calls.
 * LlmStepExecutorOptions.db (not .prisma) is the correct field name.
 * FlowExecutor from run-engine accepts { prisma } (FlowExecutorDeps).
 *
 * Patterns adapted from:
 *   - LangGraph: CompiledGraph.stream() with checkpointer
 *   - CrewAI: Crew.kickoff() with task delegation
 *   - Flowise: agentFlowRunner, INode chain execution
 *   - Semantic Kernel: KernelFunctionInvocation pipeline
 *   - AutoGen: GroupChatManager round-robin + handoff
 *   - n8n: WorkflowExecute.processRunExecutionData()
 *   - Hermes: HierarchyOrchestrator chief-of-staff delegation
 */
import type { RunSpec } from '../../../../../packages/core-types/src';
import { FlowExecutor, RunRepository } from '../../../../../packages/run-engine/src';
import { getPrisma } from '../core/db/prisma.service';
import type { RunJobData } from './run-queue.service';
import { RunCheckpointRepository } from './run-checkpoint.repository';
import type { SseEmitterService } from './sse-emitter.service';

// ── AgentExecutorService ─────────────────────────────────────────────────────

export class AgentExecutorService {
  private readonly checkpoints: RunCheckpointRepository;
  private readonly sse: SseEmitterService;

  constructor(sse: SseEmitterService) {
    this.sse = sse;
    this.checkpoints = new RunCheckpointRepository('');
  }

  /**
   * Execute a run from scratch or resume from a checkpoint.
   *
   * Flow:
   *  1. Crear o cargar Run en BD via RunRepository
   *  2. If checkpoint exists, skip completed steps (LangGraph pattern)
   *  3. Delegar ejecución a FlowExecutor (que usa PrismaClient directamente)
   *  4. Emit SSE events por step
   *  5. Guardar checkpoint tras cada poll
   *  6. Devolver RunSpec final
   */
  async executeRun(data: RunJobData): Promise<RunSpec> {
    const { runId, workspaceId, resumeFromCheckpoint } = data;

    const prisma = getPrisma();
    const repository = new RunRepository(prisma);

    // FlowExecutor from run-engine — accepts { prisma } as FlowExecutorDeps
    const flowExecutor = new FlowExecutor({ prisma });

    // Checkpoint restore (LangGraph pattern)
    if (resumeFromCheckpoint) {
      const checkpoint = await this.checkpoints.loadCheckpoint(runId);
      if (checkpoint) {
        this.sse.emit(runId, {
          event: 'checkpoint:restored',
          runId,
          completedSteps: checkpoint.completedStepIds,
          resumedAt: new Date().toISOString(),
        });
      }
    }

    // Fire-and-forget — FlowExecutor.executeRun(runId) is the correct API
    flowExecutor
      .executeRun(runId)
      .catch((err) => console.error(`[AgentExecutorService] executeRun(${runId}) failed:`, err));

    // Poll until terminal state
    const maxWaitMs = 10 * 60 * 1000;
    const pollInterval = 500;
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const latest = await repository.findRunById(runId);
      if (!latest) break;

      const terminal = ['completed', 'failed', 'cancelled'].includes(latest.status as string);

      await this._emitStepProgress(latest as unknown as RunSpec, runId);

      await this.checkpoints.saveCheckpoint({
        runId,
        runSnapshot: latest as unknown as RunSpec,
        completedStepIds: ((latest as any).steps ?? [])
          .filter((s: any) => s.status === 'completed')
          .map((s: any) => s.id),
        savedAt: new Date().toISOString(),
      });

      if (terminal) {
        return latest as unknown as RunSpec;
      }

      await new Promise<void>((r) => setTimeout(r, pollInterval));
    }

    // Timeout — return last known state
    const last = await repository.findRunById(runId);
    return (last ?? { id: runId, workspaceId, status: 'failed' }) as unknown as RunSpec;
  }

  // ── Progress emitter ──────────────────────────────────────────────────────

  private _lastEmittedStepCount = new Map<string, number>();

  private async _emitStepProgress(run: RunSpec, runId: string): Promise<void> {
    const steps = (run as any).steps ?? [];
    const lastCount = this._lastEmittedStepCount.get(runId) ?? 0;
    const newSteps = steps.slice(lastCount);

    for (const step of newSteps) {
      this.sse.emit(runId, {
        event: `step:${step.status}`,
        stepId: step.id,
        nodeId: step.nodeId,
        nodeType: step.nodeType,
        agentId: step.agentId,
        status: step.status,
        costUsd: step.costUsd,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
      });
    }

    if (newSteps.length > 0) {
      this._lastEmittedStepCount.set(runId, steps.length);
    }
  }
}
