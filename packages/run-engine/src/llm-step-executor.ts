/**
 * llm-step-executor.ts
 *
 * Full implementation of LlmStepExecutor.
 *
 * Features:
 *  1. Multi-provider routing — OpenAI native SDK, Anthropic native SDK,
 *     and any OpenAI-compatible endpoint (OpenRouter, Qwen/ModelStudio,
 *     DeepSeek) via buildLLMClient() from ./llm-client.
 *  2. Agentic tool_calls loop — extracted to executeToolCalls().
 *     Continues until the model stops calling tools or maxToolRounds is
 *     reached. Each tool call is dispatched to SkillInvoker and the result
 *     is fed back as a tool message (truncated to MAX_TOOL_RESULT_CHARS).
 *  3. Cost calculation — uses COST_TABLE from core-types. Accumulates
 *     token usage across all rounds in the loop.
 *  4. PolicyResolver integration — resolves ModelPolicy (which model to
 *     use + fallbackChain) and BudgetPolicy (spend limit) before execution.
 *     Throws BudgetExceededError if the rolling limit is already breached.
 *  5. HierarchyOrchestrator wiring — when agent.executionMode is
 *     'orchestrated' delegates to HierarchyOrchestrator.
 *  6. ProfilePropagatorService — resolveForAgent() provides the compiled
 *     system prompt when AgentProfile exists.
 *
 * NOTE: executeCondition() is intentionally NOT overridden here.
 *   The base class StepExecutor provides the full vm-sandbox implementation
 *   with buildOutputsMap() — see step-executor.ts.
 */

import type { PrismaClient } from '@prisma/client';
import type { FlowNode } from '../../core-types/src';
import type { RunStep, RunSpec } from '../../core-types/src';
import { calculateTokenCost } from '../../core-types/src';
import { StepExecutor, type StepExecutionResult } from './step-executor';
export type { StepExecutionResult };
import { PolicyResolver, type PolicyResolverContext } from './policy-resolver';
import { SkillInvoker } from './skill-invoker';
import { buildToolDefinitions } from './build-tool-definitions';
import {
  buildLLMClient,
  type ChatMessage,
  type ToolDefinition,
  type LlmResponse,
  type ToolCallRequest,
} from './llm-client';

// ─── Tool-call loop types ─────────────────────────────────────────────────────

/** Result of a single tool call dispatched by the LLM in one loop round. */
export interface ToolCallResult {
  tool_call_id: string;
  toolName:     string;
  ok:           boolean;
  result:       unknown;   // serializable result when ok === true
  error?:       string;    // error message when ok === false
  durationMs:   number;
}

/** What executeToolCalls() returns after the agentic loop completes. */
export interface ToolLoopResult {
  /** All messages accumulated — ready for the next LLM call or caller use */
  messages:        ChatMessage[];
  /** Total prompt tokens consumed across ALL rounds */
  totalInput:      number;
  /** Total completion tokens consumed across ALL rounds */
  totalOutput:     number;
  /** Text content of the last assistant message (the one without tool_calls) */
  lastContent:     string | null;
  /** Active model at loop exit — may differ from modelId if fallback fired */
  activeModel:     string;
  /** How many rounds had at least one tool_call (0 = LLM never called tools) */
  toolRoundsUsed:  number;
  /** true when loop exited because maxRounds was reached, not by LLM decision */
  hitMaxRounds:    boolean;
  /** All ToolCallResults across every round, in dispatch order */
  toolCallResults: ToolCallResult[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum characters of a tool result pushed back into the context window.
 * 8 000 chars ≈ 2 000 tokens — leaves headroom in 16k–32k context models.
 */
const MAX_TOOL_RESULT_CHARS = 8_000;

const TOOL_RESULT_TRUNCATION_NOTICE =
  '\n\n[RESULT TRUNCATED — original exceeded MAX_TOOL_RESULT_CHARS limit]';

// ─── Executor options ─────────────────────────────────────────────────────────

export interface GatewayRpcClient {
  call(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

export interface LlmStepExecutorOptions {
  /** Prisma client — required for PolicyResolver + SkillInvoker */
  db: PrismaClient;
  /**
   * Max tool_call rounds per agent node execution.
   * Prevents runaway loops. Default: 10.
   */
  maxToolRounds?: number;
  /** Optional gateway client for legacy RPC path */
  gateway?: GatewayRpcClient;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class BudgetExceededError extends Error {
  constructor(
    public readonly limitUsd: number,
    public readonly spentUsd: number,
    public readonly scope: string,
  ) {
    super(
      `Budget exceeded at ${scope} scope: spent $${spentUsd.toFixed(4)} of $${limitUsd.toFixed(4)} limit`,
    );
    this.name = 'BudgetExceededError';
  }
}

// ─── LlmStepExecutor ──────────────────────────────────────────────────────────

export class LlmStepExecutor extends StepExecutor {
  private readonly db: PrismaClient;
  private readonly maxToolRoundsOverride: number;
  private readonly gateway?: GatewayRpcClient;
  private readonly policyResolver: PolicyResolver;
  private readonly skillInvoker: SkillInvoker;

  constructor(options: LlmStepExecutorOptions) {
    super();
    this.db                    = options.db;
    this.maxToolRoundsOverride = options.maxToolRounds ?? 10;
    this.gateway               = options.gateway;
    this.policyResolver        = new PolicyResolver(this.db);
    this.skillInvoker          = new SkillInvoker(this.db);
  }

  // ─── Agent node execution ─────────────────────────────────────────────────

  protected override async executeAgent(
    node: FlowNode,
    step: RunStep,
    run:  RunSpec,
  ): Promise<StepExecutionResult> {
    const agentId = (node.config?.agentId as string) ?? step.agentId ?? '';
    if (!agentId) {
      return { status: 'failed', error: 'agent node missing agentId in config' };
    }

    const agent = await this.db.agent.findUnique({
      where: { id: agentId },
      include: {
        workspace:  { include: { department: { include: { agency: true } } } },
        skillLinks: { include: { skill: true } },
        subagents:  { include: { skillLinks: { include: { skill: true } } } },
      },
    });

    if (!agent) {
      return { status: 'failed', error: `Agent '${agentId}' not found` };
    }

    const executionMode =
      (node.config?.executionMode as string) ??
      (agent.executionMode as string) ??
      'direct';

    if (executionMode === 'orchestrated') {
      return this.executeOrchestrated(node, step, run, agent);
    }

    return this.executeDirect(node, step, run, agent);
  }

  // ─── Orchestrated path ────────────────────────────────────────────────────

  private async executeOrchestrated(
    node:  FlowNode,
    _step: RunStep,
    run:   RunSpec,
    agent: AgentWithRelations,
  ): Promise<StepExecutionResult> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HierarchyOrchestrator } = require('../../hierarchy/src/index.js') as {
      HierarchyOrchestrator: new (
        hierarchy:    import('../../hierarchy/src').HierarchyNode,
        executorFn:   import('../../hierarchy/src').AgentExecutorFn,
        prisma:       PrismaClient,
        supervisorFn?: import('../../hierarchy/src').SupervisorFn,
        opts?:        import('../../hierarchy/src').OrchestratorOptions,
      ) => { orchestrate(workspaceId: string, task: string, input?: Record<string, unknown>): Promise<import('../../hierarchy/src').OrchestrationResult> };
    };

    const hierarchy = buildHierarchyNode(agent);

    const executorFn: import('../../hierarchy/src').AgentExecutorFn = async (
      leafAgentId: string,
      systemPrompt: string,
      task: string,
    ) => {
      const leafNode: FlowNode = {
        id:     `orchestrated-${leafAgentId}`,
        type:   'agent',
        config: {
          agentId:       leafAgentId,
          executionMode: 'direct',
          systemPrompt,
          prompt:        task,
        },
      };

      const leafStep: RunStep = {
        id:         '',
        runId:      run.id,
        nodeId:     leafNode.id,
        nodeType:   'agent',
        status:     'running',
        agentId:    leafAgentId,
        retryCount: 0,
        startedAt:  new Date().toISOString(),
      };

      const result = await this.executeDirect(leafNode, leafStep, run, null);

      if (result.status === 'failed') {
        throw new Error(result.error ?? 'Leaf agent failed');
      }

      const out = result.output as Record<string, unknown> | undefined;
      return {
        response:          String(out?.['response'] ?? out?.['content'] ?? ''),
        model:             out?.['model']    as string | undefined,
        provider:          out?.['provider'] as string | undefined,
        promptTokens:      result.tokenUsage?.input,
        completionTokens:  result.tokenUsage?.output,
        totalTokens:       result.tokenUsage
                             ? result.tokenUsage.input + result.tokenUsage.output
                             : undefined,
        costUsd:           result.costUsd,
      };
    };

    const modelId    = (agent.model as string) ?? 'openai/gpt-4o-mini';
    const adapter    = buildLLMClient(modelId);
    const supervisorFn: import('../../hierarchy/src').SupervisorFn = async (prompt: string) => {
      const resp = await adapter.chat(
        [{ role: 'user', content: prompt }],
        [],
        { model: modelId, temperature: 0.3, maxTokens: 2048 },
      );
      return resp.content ?? '';
    };

    const task = (node.config?.prompt as string)
              ?? JSON.stringify(run.trigger.payload ?? {})
              ?? 'Complete the assigned task.';

    const orchestrator = new HierarchyOrchestrator(
      hierarchy, executorFn, this.db, supervisorFn,
      { parallel: true, maxRetries: 2 },
    );

    const result = await orchestrator.orchestrate(
      agent.workspaceId, task,
      run.trigger.payload as Record<string, unknown> | undefined,
    );

    return {
      status: result.status === 'failed' ? 'failed' : 'completed',
      output: {
        agentId:            agent.id,
        executionMode:      'orchestrated',
        orchestrationRunId: result.runId,
        consolidatedOutput: result.consolidatedOutput,
        subtaskResults:     result.subtaskResults,
        totalDurationMs:    result.totalDurationMs,
      },
      error: result.status === 'failed' ? result.consolidatedOutput.summary : undefined,
    };
  }

  // ─── Direct path (default) ────────────────────────────────────────────────

  private async executeDirect(
    node:        FlowNode,
    step:        RunStep,
    run:         RunSpec,
    agentOrNull: AgentWithRelations | null,
  ): Promise<StepExecutionResult> {
    const agentId = (node.config?.agentId as string) ?? step.agentId ?? '';
    let agent = agentOrNull;
    if (!agent) {
      const loaded = await this.db.agent.findUnique({
        where: { id: agentId },
        include: {
          workspace:  { include: { department: { include: { agency: true } } } },
          skillLinks: { include: { skill: true } },
          subagents:  { include: { skillLinks: { include: { skill: true } } } },
        },
      });
      if (!loaded) return { status: 'failed', error: `Agent '${agentId}' not found` };
      agent = loaded;
    }

    // ── Policy resolution ──────────────────────────────────────────────────
    const policyCtx: PolicyResolverContext = {
      agentId:      agent.id,
      workspaceId:  agent.workspaceId,
      departmentId: agent.workspace.departmentId,
      agencyId:     agent.workspace.department.agencyId,
    };

    const effectivePolicy = await this.policyResolver.resolve(policyCtx);
    const budgetPolicy    = effectivePolicy.budget;
    const modelPolicy     = effectivePolicy.model;

    // ── Budget guard ───────────────────────────────────────────────────────
    if (budgetPolicy) {
      const windowStart = new Date(
        Date.now() - budgetPolicy.periodDays * 24 * 60 * 60 * 1000,
      );
      const { _sum } = await this.db.runStep.aggregate({
        where: {
          run: {
            flow: { workspaceId: agent.workspaceId },
            startedAt: { gte: windowStart },
            status: { in: ['completed', 'failed'] },
          },
        },
        _sum: { costUsd: true },
      });
      const spent = _sum.costUsd ?? 0;
      if (spent >= budgetPolicy.limitUsd) {
        throw new BudgetExceededError(
          budgetPolicy.limitUsd,
          spent,
          effectivePolicy.budgetResolvedFrom ?? 'unknown',
        );
      }
    }

    // ── Model selection ────────────────────────────────────────────────────
    const modelId      = (node.config?.model as string) ?? modelPolicy?.primaryModel ?? (agent.model as string) ?? 'openai/gpt-4o-mini';
    const temperature  = modelPolicy?.temperature ?? 0.7;
    const maxTokens    = modelPolicy?.maxTokens   ?? 4096;
    const fallbackChain: string[] = modelPolicy?.fallbackChain ?? [];

    // ── System prompt (ProfilePropagatorService or agent.instructions) ─────
    let systemPrompt = (node.config?.systemPrompt as string) ?? '';
    if (!systemPrompt) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ProfilePropagatorService } = require('../../profile-engine/src/index.js') as {
          ProfilePropagatorService: new (prisma: PrismaClient) => {
            resolveForAgent(id: string): Promise<{ systemPrompt: string }>;
          };
        };
        const propagator = new ProfilePropagatorService(this.db);
        const resolved   = await propagator.resolveForAgent(agent.id);
        systemPrompt      = resolved.systemPrompt;
      } catch {
        systemPrompt = (agent.instructions as string) ?? 'You are a helpful assistant.';
      }
    }

    // ── Tools from skill links (F1b-03: buildToolDefinitions) ──────────────
    const skillLinks = agent.skillLinks ?? [];
    const tools      = buildToolDefinitions(skillLinks.map(({ skill }) => skill));

    const userContent = (node.config?.prompt as string)
                     ?? JSON.stringify(run.trigger.payload ?? {})
                     ?? 'Continue.';

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent  },
    ];

    // ── Agentic tool-call loop (F1b-04: delegated to executeToolCalls) ─────
    const loopResult = await this.executeToolCalls(
      messages,
      tools,
      modelId,
      fallbackChain,
      temperature,
      maxTokens,
      this.maxToolRoundsOverride,
    );

    const costUsd  = calculateTokenCost(
      loopResult.activeModel,
      loopResult.totalInput,
      loopResult.totalOutput,
    );
    const provider = loopResult.activeModel.includes('/')
      ? loopResult.activeModel.split('/')[0]
      : loopResult.activeModel;

    // Surface tool calls that failed so the consumer does not have to parse messages
    const failedToolCalls = loopResult.toolCallResults
      .filter(tc => !tc.ok)
      .map(tc => ({ toolName: tc.toolName, error: tc.error }));

    return {
      status: 'completed',
      output: {
        agentId:         agent.id,
        response:        loopResult.lastContent,
        model:           loopResult.activeModel,
        provider,
        executionMode:   'direct',
        toolRoundsUsed:  loopResult.toolRoundsUsed,
        hitMaxRounds:    loopResult.hitMaxRounds,
        failedToolCalls: failedToolCalls.length ? failedToolCalls : undefined,
      },
      tokenUsage: {
        input:  loopResult.totalInput,
        output: loopResult.totalOutput,
      },
      costUsd,
    };
  }

  // ─── executeToolCalls (F1b-04) ────────────────────────────────────────────

  /**
   * Runs the agentic tool-call loop until the LLM stops calling tools
   * or maxRounds is reached.
   *
   * Design decisions:
   *  - tool_calls within a single round are dispatched in parallel
   *    (Promise.all) because the LLM decided them simultaneously.
   *  - Tool results are truncated to MAX_TOOL_RESULT_CHARS before being
   *    pushed into the context window to prevent context overflow.
   *  - hitMaxRounds is set when the loop exits because of the round
   *    limit, NOT because the LLM finished naturally.
   *  - A tool call that fails (ok=false) is still pushed back to the LLM
   *    as a tool message containing the error — letting the model decide
   *    whether to retry or give up.
   *
   * @param initialMessages  Messages to start the loop with [system, user, ...]
   * @param tools            ToolDefinitions visible to the LLM
   * @param modelId          Primary model identifier (provider/model)
   * @param fallbackChain    Alternative models if the primary throws
   * @param temperature      Sampling temperature
   * @param maxTokens        Max completion tokens per LLM call
   * @param maxRounds        Hard cap on tool-calling rounds
   */
  private async executeToolCalls(
    initialMessages: ChatMessage[],
    tools:           ToolDefinition[],
    modelId:         string,
    fallbackChain:   string[],
    temperature:     number,
    maxTokens:       number,
    maxRounds:       number,
  ): Promise<ToolLoopResult> {
    const messages       = [...initialMessages];
    let adapter          = buildLLMClient(modelId);
    let activeModel      = modelId;
    let totalInput       = 0;
    let totalOutput      = 0;
    let lastContent:     string | null = null;
    let toolRoundsUsed   = 0;
    let hitMaxRounds     = false;
    const toolCallResults: ToolCallResult[] = [];

    for (let round = 0; round < maxRounds; round++) {
      // ── LLM call with fallback chain ──────────────────────────────────
      let llmResp: LlmResponse;
      try {
        llmResp = await adapter.chat(messages, tools, {
          model: activeModel, temperature, maxTokens,
        });
      } catch (primaryErr) {
        let recovered = false;
        for (const fallbackModel of fallbackChain) {
          try {
            const fallbackAdapter = buildLLMClient(fallbackModel);
            llmResp = await fallbackAdapter.chat(messages, tools, {
              model: fallbackModel, temperature, maxTokens,
            });
            adapter     = fallbackAdapter;
            activeModel = fallbackModel;
            recovered   = true;
            break;
          } catch {
            // try next in chain
          }
        }
        if (!recovered) throw primaryErr;
      }

      totalInput  += llmResp!.usage.input;
      totalOutput += llmResp!.usage.output;
      lastContent  = llmResp!.content;

      // ── No tool calls → LLM is done, exit loop ────────────────────────
      if (!llmResp!.tool_calls.length) break;

      // ── Count this round ──────────────────────────────────────────────
      toolRoundsUsed++;

      messages.push({
        role:       'assistant',
        content:    llmResp!.content,
        tool_calls: llmResp!.tool_calls,
      });

      // ── Dispatch tool calls in parallel (independent within one round) ─
      const roundResults = await Promise.all(
        llmResp!.tool_calls.map(async (tc: ToolCallRequest): Promise<ToolCallResult> => {
          const t0   = Date.now();
          const args = parseToolArgs(tc.function.arguments);
          const res  = await this.skillInvoker.invoke(tc.function.name, args);
          return {
            tool_call_id: tc.id,
            toolName:     tc.function.name,
            ok:           res.ok,
            result:       res.ok ? res.result : undefined,
            error:        res.ok ? undefined  : res.error,
            durationMs:   Date.now() - t0,
          };
        }),
      );

      toolCallResults.push(...roundResults);

      // ── Push tool results back (with truncation guard) ─────────────────
      for (const tr of roundResults) {
        const rawContent = JSON.stringify(
          tr.ok ? tr.result : { error: tr.error },
        );
        const content = rawContent.length > MAX_TOOL_RESULT_CHARS
          ? rawContent.slice(0, MAX_TOOL_RESULT_CHARS) + TOOL_RESULT_TRUNCATION_NOTICE
          : rawContent;

        messages.push({
          role:         'tool',
          content,
          tool_call_id: tr.tool_call_id,
          name:         tr.toolName,
        });
      }

      // ── Detect hard cutoff ────────────────────────────────────────────
      if (round === maxRounds - 1 && llmResp!.tool_calls.length > 0) {
        hitMaxRounds = true;
      }
    }

    return {
      messages,
      totalInput,
      totalOutput,
      lastContent,
      activeModel,
      toolRoundsUsed,
      hitMaxRounds,
      toolCallResults,
    };
  }

  // ─── Tool node execution (F1b-01) ─────────────────────────────────────────

  protected override async executeTool(
    node:  FlowNode,
    _step: RunStep,
    _run:  RunSpec,
  ): Promise<StepExecutionResult> {
    const t0 = Date.now();

    // Path 1: inline webhookUrl in node.config (no DB required)
    const inlineUrl = node.config?.webhookUrl as string | undefined;
    if (inlineUrl) {
      return this.executeInlineWebhook(node, t0);
    }

    // Path 2: registered skill in DB
    const skillName = (node.config?.skillName as string)
                   ?? (node.config?.skillId   as string)
                   ?? 'unknown';
    const args = (node.config?.params as Record<string, unknown>) ?? {};
    const res  = await this.skillInvoker.invoke(skillName, args);

    if (!res.ok) {
      return {
        status: 'failed',
        error:  res.error ?? `Skill '${skillName}' failed`,
        output: { skillName, durationMs: res.durationMs },
      };
    }

    return {
      status: 'completed',
      output: { skillName, result: res.result, durationMs: res.durationMs },
    };
  }

  /**
   * Executes an n8n webhook configured directly in node.config.
   * Does NOT require a Skill row in the database.
   */
  private async executeInlineWebhook(
    node: FlowNode,
    t0:   number,
  ): Promise<StepExecutionResult> {
    const webhookConfig: Record<string, unknown> = {
      webhookUrl:   node.config?.webhookUrl,
      method:       node.config?.method       ?? 'POST',
      authType:     node.config?.authType     ?? 'none',
      authHeader:   node.config?.authHeader,
      authValue:    node.config?.authValue,
      authUser:     node.config?.authUser,
      authPassword: node.config?.authPassword,
    };
    const args = (node.config?.params as Record<string, unknown>) ?? {};
    const res  = await this.skillInvoker.invokeWebhookDirect(webhookConfig, args);

    if (!res.ok) {
      return {
        status: 'failed',
        error:  res.error ?? 'Inline webhook failed',
        output: { webhookUrl: node.config?.webhookUrl, durationMs: Date.now() - t0 },
      };
    }

    return {
      status: 'completed',
      output: { webhookUrl: node.config?.webhookUrl, result: res.result, durationMs: Date.now() - t0 },
    };
  }
}

// ─── Module-level helpers ──────────────────────────────────────────────────────

function parseToolArgs(argsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argsJson);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

type AgentWithRelations = {
  id: string;
  workspaceId: string;
  model: unknown;
  instructions: unknown;
  executionMode: unknown;
  workspace: {
    departmentId: string;
    department: { agencyId: string };
  };
  skillLinks: Array<{ skill: { name: unknown; description: unknown; functions: unknown } }>;
  subagents: Array<{
    id: string;
    name: string;
    model: unknown;
    instructions: unknown;
    executionMode: unknown;
    skillLinks: Array<{ skill: unknown }>;
    agentConfig?: {
      model: string;
      systemPrompt: string;
      skills?: string[];
      requiresApproval?: boolean;
    };
  }>;
};

function buildHierarchyNode(agent: AgentWithRelations): import('../../hierarchy/src').HierarchyNode {
  return {
    id:    agent.id,
    name:  agent.id,
    level: 'agent',
    children: (agent.subagents ?? []).map(sub => ({
      id:    sub.id,
      name:  sub.id,
      level: 'subagent' as const,
      agentConfig: sub.agentConfig ?? {
        model:        (sub.model as string) ?? 'openai/gpt-4o-mini',
        systemPrompt: (sub.instructions as string) ?? 'You are a helpful assistant.',
      },
    })),
  };
}

// Suppress potential --noUnusedLocals warning for ToolDefinition
// (imported for type-checking the tools parameter in executeToolCalls)
void (undefined as unknown as ToolDefinition);

// ── Backward-compatible alias ─────────────────────────────────────────────────
// agent-executor.service.ts and index.ts reference `LLMStepExecutor` (all-caps).
// Keep both names pointing to the same class to avoid breaking existing consumers.
export { LlmStepExecutor as LLMStepExecutor };
