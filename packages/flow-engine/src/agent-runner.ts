/**
 * agent-runner.ts — Puente entre Prisma Agent y FlowExecutor
 *
 * AgentRunner es el punto de entrada único que el GatewayService usa
 * para ejecutar un agente dado su ID y el historial de la sesión.
 *
 * Flujo:
 *   1. Carga el Agent de Prisma (con su FlowVersion activa)
 *   2. Compila el FlowDefinition con compileFlow()
 *   3. Construye FlowRunOptions inyectando el historial como estado inicial
 *   4. Llama FlowExecutor.run() con onStepComplete → persiste RunSteps
 *   5. Extrae el texto de respuesta del estado final y lo devuelve
 *
 * Variables de entorno por agente (prefijo MODEL_):
 *   MODEL_API_KEY        — llave API del proveedor LLM del agente
 *   MODEL_BASE_URL       — base URL (para OpenRouter, DeepSeek, Qwen, etc.)
 *   MODEL_DEFAULT_MODEL  — modelo por defecto para este agente
 *
 * Fallback globales:
 *   OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_DEFAULT_MODEL
 *
 * Los agentes pueden sobreescribir estos valores almacenándolos en
 * Agent.modelConfig (JSON field) en la DB, que toma prioridad sobre env.
 */

import { randomUUID }        from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { compileFlow }       from './flow-compiler.js';
import { FlowExecutor }      from './flow-executor.js';
import { OpenAILLMProvider } from './llm-provider.js';
import type {
  FlowExecutorConfig,
  FlowRunResult,
} from './flow-executor.js';
import type { SessionHistoryEntry } from '@agent-vs/gateway-sdk';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AgentRunnerConfig {
  db: PrismaClient;
  /** Max flow nodes before aborting (circuit breaker). Default: 100 */
  maxNodes?: number;
}

export interface AgentRunResult {
  /** The text reply to send back to the user */
  reply:    string;
  /** Full FlowRunResult for logging / cost tracking */
  runResult: FlowRunResult;
  /** DB run ID (persisted in Run table) */
  runId:    string;
}

// ---------------------------------------------------------------------------
// AgentRunner
// ---------------------------------------------------------------------------

export class AgentRunner {
  constructor(private readonly config: AgentRunnerConfig) {}

  /**
   * Execute an agent for a given conversation turn.
   *
   * @param agentId  UUID of the Agent row in Prisma
   * @param history  Session message history from SessionManager
   * @param runId    Optional: pass an existing runId for resumable runs
   */
  async run(
    agentId: string,
    history: SessionHistoryEntry[],
    runId?: string,
  ): Promise<AgentRunResult> {
    const id = runId ?? randomUUID();

    // 1. Load agent + active flow version from Prisma
    const agent = await this.config.db.agent.findUniqueOrThrow({
      where:   { id: agentId },
      include: {
        flowVersions: {
          where:   { isActive: true },
          take:    1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const flowVersion = agent.flowVersions[0];
    if (!flowVersion) {
      throw new Error(
        `AgentRunner: agent ${agentId} has no active FlowVersion. ` +
        'Publish a flow version in the Studio before activating this agent.',
      );
    }

    // 2. Compile the flow
    const flowDef = flowVersion.definition as Parameters<typeof compileFlow>[0];
    const compiled = compileFlow(flowDef);

    // 3. Build LLM provider from agent config or env fallback
    const provider = this.buildProvider(
      (agent.modelConfig as Record<string, unknown> | null) ?? {},
    );

    // 4. Build FlowExecutor
    const executorConfig: FlowExecutorConfig = {
      llmExecutor: {
        provider,
        defaultModel: this.resolveDefaultModel(
          (agent.modelConfig as Record<string, unknown> | null) ?? {},
        ),
        estimateCost: (model, usage) =>
          (provider as OpenAILLMProvider).estimateCost?.(model, {
            promptTokens:     usage.input,
            completionTokens: usage.output,
            totalTokens:      usage.input + usage.output,
          }) ?? 0,
      },
      maxNodes: this.config.maxNodes ?? 100,
      // Persist each step to Prisma as it completes
      onStepComplete: async (step) => {
        await this.config.db.runStep
          .create({
            data: {
              id:          step.id,
              runId:       id,
              nodeId:      step.nodeId,
              nodeType:    step.nodeType,
              status:      step.status,
              startedAt:   new Date(step.startedAt),
              completedAt: step.completedAt ? new Date(step.completedAt) : null,
              input:       step.input   ?? {},
              output:      step.output  ?? {},
              error:       step.error   ?? null,
              tokenUsage:  step.tokenUsage ?? null,
              costUsd:     step.costUsd  ?? null,
            },
          })
          .catch((err: unknown) => {
            // Non-fatal: log and continue. Run persistence should not block
            // the conversation from proceeding.
            console.warn('[AgentRunner] Failed to persist RunStep:', err);
          });
      },
    };

    const executor = new FlowExecutor(executorConfig);

    // 5. Build initial state from session history
    //    The LLMStepExecutor will pick up `messages` from state and
    //    inject them into the prompt via the `input` field of the trigger.
    const lastUserMsg = [...history].reverse().find(h => h.role === 'user');
    const initialState: Record<string, unknown> = {
      messages: history,
      userInput: lastUserMsg?.content ?? '',
      agentId,
    };

    // 6. Create Run record in Prisma
    await this.config.db.run
      .create({
        data: {
          id,
          agentId,
          workspaceId: agent.workspaceId,
          status:      'running',
          trigger:     { type: 'gateway', source: 'conversation' },
          startedAt:   new Date(),
        },
      })
      .catch((err: unknown) => {
        console.warn('[AgentRunner] Failed to create Run record:', err);
      });

    // 7. Execute
    const runResult = await executor.run(compiled, {
      runId:        id,
      workspaceId:  agent.workspaceId,
      trigger: {
        type:    'gateway',
        payload: initialState,
      },
      initialState,
    });

    // 8. Update Run record with final status
    await this.config.db.run
      .update({
        where: { id },
        data: {
          status:      runResult.run.status,
          completedAt: new Date(),
          error:       runResult.run.error ?? null,
        },
      })
      .catch((err: unknown) => {
        console.warn('[AgentRunner] Failed to update Run status:', err);
      });

    // 9. Extract reply text from final state
    const reply = this.extractReply(runResult);

    return { reply, runResult, runId: id };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Build an OpenAILLMProvider from agent modelConfig or env vars.
   * Priority: agent.modelConfig > MODEL_* env > OPENAI_* env
   */
  private buildProvider(
    modelConfig: Record<string, unknown>,
  ): OpenAILLMProvider {
    const apiKey =
      (modelConfig.apiKey   as string | undefined) ??
      process.env.MODEL_API_KEY ??
      process.env.OPENAI_API_KEY ?? '';

    const baseUrl =
      (modelConfig.baseUrl  as string | undefined) ??
      process.env.MODEL_BASE_URL ??
      process.env.OPENAI_BASE_URL;

    if (!apiKey) {
      console.warn(
        '[AgentRunner] No API key configured. ' +
        'Set OPENAI_API_KEY or MODEL_API_KEY env var, or agent.modelConfig.apiKey.',
      );
    }

    return new OpenAILLMProvider({
      apiKey,
      baseUrl,
      defaultModel: this.resolveDefaultModel(modelConfig),
    });
  }

  private resolveDefaultModel(modelConfig: Record<string, unknown>): string {
    return (
      (modelConfig.defaultModel as string | undefined) ??
      process.env.MODEL_DEFAULT_MODEL ??
      process.env.OPENAI_DEFAULT_MODEL ??
      'gpt-4o-mini'
    );
  }

  /**
   * Extract the assistant reply text from the FlowRunResult.
   *
   * Strategy (in order):
   *   1. finalState._reply (agents can explicitly set this key)
   *   2. Content of the last completed agent/subagent step
   *   3. String representation of finalState.userInput (echo fallback)
   *   4. Empty string (never crash the gateway)
   */
  private extractReply(result: FlowRunResult): string {
    const { finalState, run } = result;

    // Explicit reply key
    if (typeof finalState._reply === 'string' && finalState._reply) {
      return finalState._reply;
    }

    // Last completed agent/subagent step output
    const agentSteps = run.steps
      .filter(s =>
        (s.nodeType === 'agent' || s.nodeType === 'subagent') &&
        s.status === 'completed' &&
        s.output,
      )
      .reverse();

    for (const step of agentSteps) {
      const content = (step.output as Record<string, unknown> | null)?.content;
      if (typeof content === 'string' && content) return content;
    }

    // Last completed step of any type
    const lastStep = [...run.steps]
      .reverse()
      .find(s => s.status === 'completed' && s.output);
    if (lastStep) {
      const raw = lastStep.output;
      if (typeof raw === 'string') return raw;
      if (raw && typeof raw === 'object') {
        const c = (raw as Record<string, unknown>).content;
        if (typeof c === 'string' && c) return c;
      }
    }

    // Status message for non-reply outcomes
    if (run.status === 'waiting_approval') {
      return '(esperando aprobación)';
    }
    if (run.status === 'failed') {
      return `(error en el flujo: ${run.error ?? 'desconocido'})`;
    }

    return '';
  }
}
