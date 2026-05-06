/**
 * AgentExecutor — F1a-05 + F1a-06
 * F2a-10: inyecta RunStepEventEmitter para emitir StatusChangeEvent
 *         en cada transición de estado (D-23d).
 */
import type { PrismaClient, RunStep } from '@prisma/client';
import type { StepExecutionResult } from './step-executor';
import { executeCondition } from './execute-condition';
import {
  RunStepEventEmitter,
  buildStatusChangeEvent,
} from './events/index';

export interface LLMStepExecutor {
  executeStep(runStep: RunStep): Promise<StepExecutionResult>;
}

export interface AgentExecutorDeps {
  prisma:          PrismaClient;
  llmStepExecutor: LLMStepExecutor;
  /**
   * F2a-10: emitter de transiciones de RunStep.
   * Opcional para compatibilidad hacia atrás.
   */
  emitter?: RunStepEventEmitter;
}

export type AgentExecutorFn = (runStepId: string) => Promise<StepExecutionResult>;

export class AgentExecutor {
  constructor(private readonly deps: AgentExecutorDeps) {}

  /**
   * Ciclo de vida completo de un RunStep.
   * Cada transición emite un StatusChangeEvent DESPUÉS del write en BD.
   */
  async execute(runStepId: string): Promise<StepExecutionResult> {
    const { prisma, llmStepExecutor, emitter } = this.deps;

    // 1. queued → running
    await prisma.runStep.update({
      where: { id: runStepId },
      data: { status: 'running', startedAt: new Date() },
    });

    let runStep: any;
    try {
      runStep = await prisma.runStep.findUniqueOrThrow({
        where: { id: runStepId },
        include: { run: { include: { flow: true } } },
      });
    } catch (err) {
      await prisma.runStep.update({
        where: { id: runStepId },
        data: { status: 'failed', error: `RunStep ${runStepId} not found`, completedAt: new Date() },
      });
      throw err;
    }

    // Emitir queued → running (DESPUÉS del write en BD)
    if (emitter) {
      try {
        emitter.emitStepChanged(buildStatusChangeEvent({
          stepId:         runStepId,
          runId:          runStep.runId,
          nodeId:         runStep.nodeId,
          nodeType:       runStep.nodeType ?? 'agent',
          agentId:        runStep.agentId ?? null,
          workspaceId:    await this.resolveWorkspaceId(runStep),
          previousStatus: 'queued',
          currentStatus:  'running',
          output: null, error: null,
          model: null, provider: null,
          promptTokens: null, completionTokens: null,
          totalTokens: null, costUsd: null,
        }));
      } catch { /* best-effort — nunca relanzar */ }
    }

    try {
      let result: StepExecutionResult;
      const nodeType: string = runStep.nodeType ?? 'agent';

      if (nodeType === 'condition') {
        const previousOutputs = await this._getPreviousOutputs(prisma, runStep);
        const nodeInput = runStep.input ?? {};
        const conditionExpr: string =
          (nodeInput as any).conditionExpr ?? runStep.conditionExpr ?? 'false';
        const conditionResult = executeCondition(conditionExpr, previousOutputs);
        result = {
          status: 'completed',
          output: { conditionResult },
          branch: conditionResult ? 'true' : 'false',
        } as any;
      } else {
        result = await llmStepExecutor.executeStep(runStep);
      }

      // running → completed — write primero, emit después
      await prisma.runStep.update({
        where: { id: runStepId },
        data: {
          status:      'completed',
          output:      result.output as any,
          costUsd:     result.costUsd,
          completedAt: new Date(),
        },
      });

      if (emitter) {
        try {
          emitter.emitStepChanged(buildStatusChangeEvent({
            stepId:         runStepId,
            runId:          runStep.runId,
            nodeId:         runStep.nodeId,
            nodeType:       runStep.nodeType ?? 'agent',
            agentId:        runStep.agentId ?? null,
            workspaceId:    await this.resolveWorkspaceId(runStep),
            previousStatus: 'running',
            currentStatus:  'completed',
            output:          result.output ?? null,
            error:           null,
            model:           (result as any).model            ?? null,
            provider:        (result as any).provider         ?? null,
            promptTokens:    (result as any).promptTokens     ?? null,
            completionTokens: (result as any).completionTokens ?? null,
            totalTokens:     (result as any).totalTokens      ?? null,
            costUsd:         result.costUsd ?? null,
          }));
        } catch { /* best-effort */ }
      }

      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      // running → failed — write primero, emit después, re-lanzar al final
      await prisma.runStep.update({
        where: { id: runStepId },
        data: { status: 'failed', error: errMsg, completedAt: new Date() },
      });

      if (emitter) {
        try {
          emitter.emitStepChanged(buildStatusChangeEvent({
            stepId:         runStepId,
            runId:          runStep.runId,
            nodeId:         runStep.nodeId,
            nodeType:       runStep.nodeType ?? 'agent',
            agentId:        runStep.agentId ?? null,
            workspaceId:    await this.resolveWorkspaceId(runStep),
            previousStatus: 'running',
            currentStatus:  'failed',
            output: null,
            error:  errMsg,
            model: null, provider: null,
            promptTokens: null, completionTokens: null,
            totalTokens: null, costUsd: null,
          }));
        } catch { /* best-effort */ }
      }

      throw error; // re-lanzar para que el caller (FlowExecutor) maneje
    }
  }

  /**
   * TODO F2a-10: Implementar lookup real Run→Flow→Agent→workspaceId
   * cuando RunRepository esté disponible como dep de AgentExecutor.
   * Placeholder temporal: retorna runId como valor no-nulo garantizado.
   * workspaceId es OBLIGATORIO en StatusChangeEvent para routing WebSocket (F3a-09).
   */
  private async resolveWorkspaceId(step: RunStep): Promise<string> {
    return step.runId;
  }

  private async _getPreviousOutputs(
    prisma: PrismaClient,
    runStep: RunStep,
  ): Promise<Record<string, unknown>> {
    const previous = await prisma.runStep.findMany({
      where: {
        runId:     runStep.runId,
        status:    'completed',
        startedAt: { lt: runStep.startedAt ?? new Date() },
      },
      select: { id: true, output: true },
    });
    return Object.fromEntries(previous.map((s) => [s.id, s.output]));
  }

  toFn(): AgentExecutorFn {
    return (runStepId) => this.execute(runStepId);
  }
}
