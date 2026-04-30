/**
 * AgentExecutor — F1a-05 + F1a-06
 *
 * Servicio intermediario que rompe la dependencia circular entre FlowExecutor
 * y LLMStepExecutor. Es el único punto que actualiza el estado de RunStep en BD.
 *
 *   FlowExecutor → AgentExecutor → LLMStepExecutor
 *                ↖________________________↙  (ya no hay ciclo)
 */
import type { PrismaClient, RunStep } from '@prisma/client';
import type { StepExecutionResult } from './step-executor';
import { executeCondition } from './execute-condition';

/**
 * Minimal interface for the step execution service as seen by AgentExecutor.
 * Kept separate from LlmStepExecutor to avoid circular imports and allow mocking.
 */
export interface LLMStepExecutor {
  executeStep(runStep: any): Promise<any>;
}

export interface AgentExecutorDeps {
  prisma: PrismaClient;
  llmStepExecutor: LLMStepExecutor;
}

/** Tipo liviano para que FlowExecutor pueda referenciar AgentExecutor sin importar LLMStepExecutor */
export type AgentExecutorFn = (runStepId: string) => Promise<StepExecutionResult>;

export class AgentExecutor {
  constructor(private readonly deps: AgentExecutorDeps) {}

  /**
   * F1a-06: Ejecuta un RunStep con ciclo de vida completo.
   *
   * Transiciones:
   *   pending → running  (al empezar)
   *   running → completed (éxito)
   *   running → failed    (error)
   */
  async execute(runStepId: string): Promise<StepExecutionResult> {
    const { prisma, llmStepExecutor } = this.deps;

    // 1. Marcar como running
    await prisma.runStep.update({
      where: { id: runStepId },
      data: { status: 'running', startedAt: new Date() },
    });

    let runStep: RunStep & { run: { flow: { spec: unknown } } };
    try {
      runStep = await prisma.runStep.findUniqueOrThrow({
        where: { id: runStepId },
        include: {
          run: {
            include: { flow: true },
          },
        },
      }) as any;
    } catch (err) {
      // Si no existe el step, marcarlo como failed y relanzar
      await prisma.runStep.update({
        where: { id: runStepId },
        data: {
          status:      'failed',
          error:       `RunStep ${runStepId} not found`,
          completedAt: new Date(),
        },
      });
      throw err;
    }

    // 2. Ejecutar según tipo de nodo
    try {
      let result: StepExecutionResult;

      const nodeType: string = (runStep as any).nodeType ?? 'agent';

      if (nodeType === 'condition') {
        // Evaluar condición de forma segura.
        // conditionExpr puede estar en runStep.input.conditionExpr (nuevo) o
        // directamente en runStep.conditionExpr (columna legacy si existe).
        const previousOutputs = await this._getPreviousOutputs(prisma, runStep);
        const nodeInput = (runStep as any).input ?? {};
        const conditionExpr: string =
          (nodeInput as any).conditionExpr ??
          (runStep as any).conditionExpr ??
          'false';
        const conditionResult = executeCondition(conditionExpr, previousOutputs);
        result = {
          status: 'completed',
          output: { conditionResult },
          branch: conditionResult ? 'true' : 'false',
        };
      } else {
        // Delegar al LLMStepExecutor real
        result = await llmStepExecutor.executeStep(runStep as any);
      }

      // 3a. Éxito → completed
      await prisma.runStep.update({
        where: { id: runStepId },
        data: {
          status:      'completed',
          output:      result.output as any,
          tokenUsage:  { total: (result as any).tokensUsed } as any,
          costUsd:     result.costUsd,
          completedAt: new Date(),
        },
      });

      return result;
    } catch (error) {
      // 3b. Fallo → failed
      const errMsg = error instanceof Error ? error.message : String(error);
      await prisma.runStep.update({
        where: { id: runStepId },
        data: {
          status:      'failed',
          error:       errMsg,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /** Recoge los outputs de RunSteps completados anteriores del mismo Run */
  private async _getPreviousOutputs(
    prisma: PrismaClient,
    runStep: RunStep,
  ): Promise<Record<string, unknown>> {
    const previous = await prisma.runStep.findMany({
      where: {
        runId: runStep.runId,
        status: 'completed',
        startedAt: { lt: runStep.startedAt ?? new Date() },
      },
      select: { id: true, output: true },
    });
    return Object.fromEntries(previous.map((s) => [s.id, s.output]));
  }

  /** Factoría para obtener la fn tipada AgentExecutorFn */
  toFn(): AgentExecutorFn {
    return (runStepId) => this.execute(runStepId);
  }
}
