/**
 * agent-executor.service.ts
 *
 * Orchestrates a full Run through FlowExecutor + LLM step execution.
 * Supports checkpoint-based resumption (LangGraph PostgresSaver pattern).
 *
 * FIXED (2026-05-06):
 *   - RunRepository usa Prisma (constructor PrismaClient), no workspaceRoot string
 *   - findRunById() en lugar de findById() (API real de RunRepository)
 *   - FlowExecutor.executeRun(runId) en lugar de startRun() (API real)
 *   - FlowExecutorDeps: { prisma, executeAgent } — sin workspaceId ni repository
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
import type { RunSpec, FlowSpec } from '../../../../../packages/core-types/src';
import { FlowExecutor, RunRepository, LLMStepExecutor } from '../../../../../packages/run-engine/src';
import type { AgentExecutorFn } from '../../../../../packages/run-engine/src';
import { getPrisma } from '../core/db/prisma.service';
import type { RunJobData } from './run-queue.service';
import { RunCheckpointRepository } from './run-checkpoint.repository';
import type { SseEmitterService } from './sse-emitter.service';

// ── Hierarchy Orchestrator (Hermes/AutoGen-style) ────────────────────────────

class HierarchyOrchestrator {
  resolveAgent(
    step: { nodeId: string; agentId?: string },
    agents: Array<{ id: string; role?: string }>,
  ): string | undefined {
    const direct = agents.find((a) => a.id === step.agentId);
    if (direct) return direct.id;
    const manager = agents.find((a) => a.role === 'manager' || a.role === 'orchestrator');
    return manager?.id ?? step.agentId;
  }
}

// ── AgentExecutorService ─────────────────────────────────────────────────────

export class AgentExecutorService {
  private readonly checkpoints: RunCheckpointRepository;
  private readonly orchestrator = new HierarchyOrchestrator();
  private readonly sse: SseEmitterService;

  constructor(sse: SseEmitterService) {
    this.sse = sse;
    // RunCheckpointRepository sólo necesita la raíz del workspace para el FS de checkpoints
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

    // AgentExecutorFn: ejecuta un RunStep via LLMStepExecutor
    const executeAgent: AgentExecutorFn = async (stepId: string) => {
      const executor = new LLMStepExecutor({ prisma });
      return executor.execute(stepId);
    };

    // FlowExecutor usa { prisma, executeAgent } — contrato real de FlowExecutorDeps
    const flowExecutor = new FlowExecutor({ prisma, executeAgent });

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

    // Ejecutar — FlowExecutor.executeRun(runId) es la API correcta
    // Fire-and-forget para no bloquear el caller
    flowExecutor
      .executeRun(runId)
      .catch((err) => console.error(`[AgentExecutorService] executeRun(${runId}) failed:`, err));

    // Poll hasta estado terminal
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

    // Timeout — devuelve último estado conocido
    const last = await repository.findRunById(runId);
    return (last ?? { id: runId, status: 'failed' }) as unknown as RunSpec;
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
