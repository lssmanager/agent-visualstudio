/**
 * agent-runner.ts — Puente entre Prisma Agent → Flow → FlowExecutor
 *
 * Usa el schema real:
 *   Agent.flows[]          (Flow[],  campo: flows)
 *   Flow.spec              (Json,    la FlowDefinition serializada)
 *   Flow.isActive          (Boolean, solo el activo se ejecuta)
 *   Run.flowId             (String,  requerido)
 *   Run.agencyId           (String?, opcional)
 *   RunStep.runId / nodeId / nodeType / status / startedAt
 *
 * Variables de entorno por modelo:
 *   MODEL_API_KEY        — llave del proveedor LLM
 *   MODEL_BASE_URL       — base URL (OpenRouter, DeepSeek, Qwen…)
 *   MODEL_DEFAULT_MODEL  — modelo por defecto
 *
 * Fallback globales:
 *   OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_DEFAULT_MODEL
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
  reply:     string;
  /** Full FlowRunResult for logging / cost tracking */
  runResult: FlowRunResult;
  /** DB run ID */
  runId:     string;
}

// ---------------------------------------------------------------------------
// AgentRunner
// ---------------------------------------------------------------------------

export class AgentRunner {
  constructor(private readonly config: AgentRunnerConfig) {}

  /**
   * Execute the active Flow of an Agent for one conversation turn.
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

    // 1. Load agent + active flow from Prisma
    const agent = await this.config.db.agent.findUniqueOrThrow({
      where:   { id: agentId },
      include: {
        flows: {
          where:   { isActive: true },
          take:    1,
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    const flow = agent.flows[0];
    if (!flow) {
      throw new Error(
        `AgentRunner: agent ${agentId} has no active Flow. ` +
        'Create and activate a flow in the Studio before using this agent.',
      );
    }

    // 2. Compile the flow spec
    const compiled = compileFlow(
      flow.spec as Parameters<typeof compileFlow>[0],
    );

    // 3. Build LLM provider from env vars
    //    Agent.model is the model identifier (e.g. "openai/gpt-4o")
    //    It is used as the defaultModel fallback.
    const provider = this.buildProvider(agent.model);

    // 4. Build FlowExecutor
    const executorConfig: FlowExecutorConfig = {
      llmExecutor: {
        provider,
        defaultModel: this.resolveDefaultModel(agent.model),
        estimateCost: (model, usage) =>
          (provider as OpenAILLMProvider).estimateCost?.(model, {
            promptTokens:     usage.input,
            completionTokens: usage.output,
            totalTokens:      usage.input + usage.output,
          }) ?? 0,
      },
      maxNodes: this.config.maxNodes ?? 100,
      onStepComplete: async (step) => {
        await this.config.db.runStep
          .create({
            data: {
              id:          step.id,
              runId:       id,
              nodeId:      step.nodeId,
              nodeType:    String(step.nodeType),
              status:      step.status,
              startedAt:   new Date(step.startedAt),
              completedAt: step.completedAt ? new Date(step.completedAt) : null,
              input:       step.input  ?? {},
              output:      step.output ?? {},
              error:       step.error  ?? null,
              tokenUsage:  step.tokenUsage ?? null,
              costUsd:     step.costUsd   ?? 0,
            },
          })
          .catch((err: unknown) => {
            console.warn('[AgentRunner] Failed to persist RunStep:', err);
          });
      },
    };

    const executor = new FlowExecutor(executorConfig);

    // 5. Build initial state from session history
    const lastUserMsg = [...history].reverse().find(h => h.role === 'user');
    const initialState: Record<string, unknown> = {
      messages:  history,
      userInput: lastUserMsg?.content ?? '',
      agentId,
    };

    // 6. Create Run record in Prisma (flowId is required)
    await this.config.db.run
      .create({
        data: {
          id,
          flowId:   flow.id,
          status:   'running',
          trigger:  { type: 'gateway', source: 'conversation' },
          startedAt: new Date(),
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

    // 8. Update Run with final status
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

    const reply = this.extractReply(runResult);
    return { reply, runResult, runId: id };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildProvider(agentModel: string): OpenAILLMProvider {
    const apiKey =
      process.env.MODEL_API_KEY ??
      process.env.OPENAI_API_KEY ?? '';

    const baseUrl =
      process.env.MODEL_BASE_URL ??
      process.env.OPENAI_BASE_URL;

    if (!apiKey) {
      console.warn(
        '[AgentRunner] No API key configured. ' +
        'Set OPENAI_API_KEY or MODEL_API_KEY.',
      );
    }

    return new OpenAILLMProvider({
      apiKey,
      baseUrl,
      defaultModel: this.resolveDefaultModel(agentModel),
    });
  }

  /**
   * Resolve the default model string.
   * Agent.model format: "provider/model-id" or just "model-id"
   * Strip the provider prefix for the OpenAI-compat API if needed.
   */
  private resolveDefaultModel(agentModel: string): string {
    return (
      process.env.MODEL_DEFAULT_MODEL ??
      process.env.OPENAI_DEFAULT_MODEL ??
      agentModel ??
      'gpt-4o-mini'
    );
  }

  /**
   * Extract the assistant reply text from FlowRunResult.
   *
   * Order:
   *   1. finalState._reply  (explicit output key)
   *   2. Content of last completed agent/subagent step
   *   3. Content of last completed step of any type
   *   4. Status message for non-reply outcomes
   *   5. Empty string (never crash)
   */
  private extractReply(result: FlowRunResult): string {
    const { finalState, run } = result;

    if (typeof finalState._reply === 'string' && finalState._reply) {
      return finalState._reply;
    }

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

    if (run.status === 'waiting_approval') return '(esperando aprobación)';
    if (run.status === 'failed')           return `(error: ${run.error ?? 'desconocido'})`;

    return '';
  }
}
