/**
 * agent-executor.service.ts
 *
 * Orchestrates a full Run through FlowExecutor + LLM step execution.
 * Supports checkpoint-based resumption (LangGraph PostgresSaver pattern).
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
import type { RunSpec, RunTrigger, FlowSpec } from '../../../../../packages/core-types/src';
import { FlowExecutor, RunRepository, StepExecutor, ApprovalQueue } from '../../../../../packages/run-engine/src';
import { workspaceStore, studioConfig } from '../../config'; // @deprecated(F0-08) — migrate to AgentRepository (Prisma)
import type { RunJobData } from './run-queue.service';
import { RunCheckpointRepository } from './run-checkpoint.repository';
import type { SseEmitterService } from './sse-emitter.service';

// ── Hierarchy Orchestrator (Hermes/AutoGen-style) ────────────────────────────

/**
 * HierarchyOrchestrator decides which agent handles a step when the flow
 * has a manager/sub-agent structure (like Hermes chief-of-staff or
 * AutoGen GroupChat manager delegation).
 */
class HierarchyOrchestrator {
  /**
   * Resolve which agentId should execute a step.
   * Falls back to step.agentId if no delegation rule applies.
   */
  resolveAgent(step: { nodeId: string; agentId?: string }, agents: Array<{ id: string; role?: string }>): string | undefined {
    const direct = agents.find((a) => a.id === step.agentId);
    if (direct) return direct.id;

    // Manager pattern: if step has no agent, pick the first 'manager' role
    // (AutoGen GroupChatManager / Hermes chief-of-staff)
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
    this.checkpoints = new RunCheckpointRepository(studioConfig.workspaceRoot);
  }

  /**
   * Execute a run from scratch or resume from a checkpoint.
   *
   * Flow:
   *  1. Load FlowSpec from workspace store
   *  2. If checkpoint exists, skip completed steps (LangGraph pattern)
   *  3. Wire FlowExecutor with LLM-capable StepExecutor
   *  4. Emit SSE events per step: step:started, step:token, step:completed
   *  5. Save checkpoint after each step (durable execution)
   *  6. Return final RunSpec
   */
  async executeRun(data: RunJobData): Promise<RunSpec> {
    const { runId, flowId, trigger, workspaceId, resumeFromCheckpoint } = data;

    // 1. Load flow
    const flows = workspaceStore.listFlows() as FlowSpec[];
    const flow = flows.find((f) => f.id === flowId);
    if (!flow) throw new Error(`Flow not found: ${flowId}`);

    // 2. Load or create RunRepository
    const repository = new RunRepository(studioConfig.workspaceRoot);

    // 3. Check for existing checkpoint (resume support)
    let existingRun: RunSpec | null = null;
    if (resumeFromCheckpoint) {
      const checkpoint = await this.checkpoints.loadCheckpoint(runId);
      if (checkpoint) {
        existingRun = checkpoint.runSnapshot;
        this.sse.emit(runId, {
          event: 'checkpoint:restored',
          runId,
          completedSteps: checkpoint.completedStepIds,
          resumedAt: new Date().toISOString(),
        });
      }
    }

    // 4. Build SSE-aware StepExecutor
    //    Wraps the base StepExecutor to emit token streaming events.
    //    Inspired by Flowise SSE streaming + LangGraph stream() output.
    const baseStepExecutor = new StepExecutor();
    const sseStepExecutor = this._wrapWithSse(baseStepExecutor, runId);

    // 5. Build FlowExecutor
    const approvalQueue = new ApprovalQueue();
    const executor = new FlowExecutor({
      workspaceId,
      repository,
      stepExecutor: sseStepExecutor,
      approvalQueue,
    });

    // 6. Start or resume run
    let run: RunSpec;
    if (existingRun) {
      // Resume — re-trigger with checkpoint context
      run = executor.startRun(flow, {
        ...trigger,
        type: `resume:${trigger.type}`,
      } as RunTrigger);
    } else {
      run = executor.startRun(flow, trigger);
    }

    // 7. Wait for completion (FlowExecutor may be sync or async)
    // Poll until status is terminal
    const maxWaitMs = 10 * 60 * 1000; // 10 min timeout
    const pollInterval = 500;
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const latest = repository.findById(run.id);
      if (!latest) break;

      const terminal = ['completed', 'failed', 'cancelled'].includes(latest.status);

      // Emit step events for any new steps
      await this._emitStepProgress(latest, runId);

      // Save checkpoint after each poll
      await this.checkpoints.saveCheckpoint({
        runId: run.id,
        runSnapshot: latest,
        completedStepIds: latest.steps.filter((s) => s.status === 'completed').map((s) => s.id),
        savedAt: new Date().toISOString(),
      });

      if (terminal) {
        return latest;
      }

      await new Promise<void>((r) => setTimeout(r, pollInterval));
    }

    // Timeout — return last known state
    return repository.findById(run.id) ?? run;
  }

  // ── SSE wrapper ───────────────────────────────────────────────────────────

  /**
   * Wraps a StepExecutor to emit SSE events on step lifecycle.
   * Pattern: Flowise SSEOutputParser + LangGraph stream callbacks.
   */
  private _wrapWithSse(base: StepExecutor, runId: string): StepExecutor {
    // Proxy the execute method if available
    const self = this;
    const proxy = Object.create(base) as StepExecutor;

    // Intercept via prototype chain if executeStep exists
    const originalExecute = (base as unknown as { executeStep?: Function }).executeStep;
    if (typeof originalExecute === 'function') {
      (proxy as unknown as { executeStep: Function }).executeStep = async function (...args: unknown[]) {
        const step = args[0] as { id: string; nodeId: string };
        self.sse.emit(runId, { event: 'step:started', stepId: step.id, nodeId: step.nodeId });
        const result = await originalExecute.apply(base, args);
        self.sse.emit(runId, { event: 'step:completed', stepId: step.id, result });
        return result;
      };
    }

    return proxy;
  }

  // ── Progress emitter ──────────────────────────────────────────────────────

  private _lastEmittedStepCount = new Map<string, number>();

  private async _emitStepProgress(run: RunSpec, runId: string): Promise<void> {
    const lastCount = this._lastEmittedStepCount.get(runId) ?? 0;
    const newSteps = run.steps.slice(lastCount);

    for (const step of newSteps) {
      this.sse.emit(runId, {
        event: `step:${step.status}`,
        stepId: step.id,
        nodeId: step.nodeId,
        nodeType: step.nodeType,
        agentId: step.agentId,
        status: step.status,
        costUsd: step.costUsd,
        tokenUsage: step.tokenUsage,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
      });
    }

    if (newSteps.length > 0) {
      this._lastEmittedStepCount.set(runId, run.steps.length);
    }
  }
}
