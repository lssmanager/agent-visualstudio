/**
 * llm-step-executor.ts
 *
 * Full implementation of LlmStepExecutor.
 *
 * Features:
 *  1. Multi-provider routing — OpenAI native SDK, Anthropic native SDK,
 *     and any OpenAI-compatible endpoint (OpenRouter, Qwen/ModelStudio,
 *     DeepSeek) via buildLLMClient() from ./llm-client.
 *  2. Agentic tool_calls loop — continues until the model stops calling
 *     tools or maxToolRounds is reached. Each tool call is dispatched to
 *     SkillInvoker and the result is fed back as a tool message.
 *  3. Cost calculation — uses COST_TABLE from core-types. Accumulates
 *     token usage across all rounds in the loop.
 *  4. PolicyResolver integration — resolves ModelPolicy (which model to
 *     use + fallbackChain) and BudgetPolicy (spend limit) before execution.
 *     Throws BudgetExceededError if the rolling limit is already breached.
 *  5. HierarchyOrchestrator wiring — when agent.executionMode is
 *     'orchestrated' delegates to HierarchyOrchestrator.
 *  6. ProfilePropagatorService — resolveForAgent() provides the compiled
 *     system prompt when AgentProfile exists.
 *  7. executeCondition — override completo, Named-arg Function constructor,
 *     compatible con "use strict", expone outputs de pasos anteriores.
 *
 * Provider routing is delegated to buildLLMClient() in ./llm-client:
 *   'openai/*'    → OpenAI API  (OPENAI_API_KEY)
 *   'anthropic/*' → Anthropic   (ANTHROPIC_API_KEY)
 *   anything else → OpenRouter-compat (OPENROUTER_API_KEY)
 */

import type { PrismaClient } from '@prisma/client';
import type { FlowNode } from '../../core-types/src';
import type { RunStep, RunSpec } from '../../core-types/src';
import { calculateTokenCost } from '../../core-types/src';
import { StepExecutor, type StepExecutionResult } from './step-executor';
import { PolicyResolver, type PolicyResolverContext } from './policy-resolver';
import { SkillInvoker } from './skill-invoker';
import {
  buildLLMClient,
  type ChatMessage,
  type ToolDefinition,
  type LlmResponse,
  type ToolCallRequest,
} from './llm-client';

// ─── Re-export for backward compat ──────────────────────────────────────────

export interface GatewayRpcClient {
  call(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

// ─── Options ────────────────────────────────────────────────────────────

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

// ─── Errors ───────────────────────────────────────────────────────────

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

// ─── Condition context ────────────────────────────────────────────────────

interface ConditionContext {
  payload:  Record<string, unknown>;
  metadata: Record<string, unknown>;
  status:   string;
  outputs:  Record<string, unknown>;
}

// ─── LlmStepExecutor ─────────────────────────────────────────────────────

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

  // ─── Condition node execution ───────────────────────────────────────

  protected override async executeCondition(
    node:  FlowNode,
    _step: RunStep,
    run:   RunSpec,
  ): Promise<StepExecutionResult> {
    const expression = (node.config?.expression as string)?.trim();
    const branches   = (node.config?.branches   as string[]) ?? ['true', 'false'];

    if (!expression) {
      console.warn(
        `[LlmStepExecutor] Condition node '${node.id}' has no expression — defaulting to branch[0]`,
      );
      return {
        status: 'completed',
        output: { expression: '', evaluated: true, branch: branches[0] ?? 'true' },
        branch: branches[0] ?? 'true',
      };
    }

    const ctx: ConditionContext = {
      payload:  (run.trigger?.payload  as Record<string, unknown>) ?? {},
      metadata: (run.metadata          as Record<string, unknown>) ?? {},
      status:   run.status ?? 'running',
      outputs:  (run as unknown as { outputs?: Record<string, unknown> }).outputs ?? {},
    };

    let evaluated: boolean;
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function(
        'payload', 'metadata', 'status', 'outputs',
        '"use strict"; return Boolean(' + expression + ');',
      ) as (p: unknown, m: unknown, s: unknown, o: unknown) => boolean;
      evaluated = fn(ctx.payload, ctx.metadata, ctx.status, ctx.outputs);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[LlmStepExecutor] Condition node '${node.id}' expression error: ${errMsg}`,
        { expression, context: ctx },
      );
      return {
        status: 'failed',
        error:  `Condition expression error in node '${node.id}': ${errMsg}`,
        output: { expression, evaluated: false, branch: branches[1] ?? 'false', context: ctx },
        branch: branches[1] ?? 'false',
      };
    }

    const branch = evaluated ? (branches[0] ?? 'true') : (branches[1] ?? 'false');
    return {
      status: 'completed',
      output: { expression, evaluated, branch, context: ctx },
      branch,
    };
  }

  // ─── Agent node execution ───────────────────────────────────────────

  protected override async executeAgent(
    node: FlowNode,
    step: RunStep,
    run: RunSpec,
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

  // ─── Orchestrated path ─────────────────────────────────────────────

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
          prompt: task,
        },
      };
      const leafStep: RunStep = {
        id:         `${_step.id}-leaf-${leafAgentId}`,
        runId:      run.id,
        nodeId:     leafNode.id,
        nodeType:   'agent',
        status:     'running',
        agentId:    leafAgentId,
        retryCount: 0,
        startedAt:  new Date().toISOString(),
      };
      const result = await this.executeDirect(leafNode, leafStep, run, null);
      if (result.status === 'failed') throw new Error(result.error ?? 'Leaf agent failed');
      return String((result.output as Record<string, unknown>)?.response ?? '');
    };

    const modelId  = (agent.model as string) ?? 'openai/gpt-4o-mini';
    const adapter   = buildLLMClient(modelId);
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
      error: result.status === 'failed' ? result.consolidatedOutput : undefined,
    };
  }

  // ─── Direct path (default) ───────────────────────────────────────────

  private async executeDirect(
    node:  FlowNode,
    step:  RunStep,
    run:   RunSpec,
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

    // ── Policy resolution ─────────────────────────────────────────────
    const policyCtx: PolicyResolverContext = {
      agentId:      agent.id,
      workspaceId:  agent.workspaceId,
      departmentId: agent.workspace.departmentId,
      agencyId:     agent.workspace.department.agencyId,
    };

    const effectivePolicy = await this.policyResolver.resolve(policyCtx);
    const budgetPolicy    = effectivePolicy.budget;
    const modelPolicy     = effectivePolicy.model;

    // ── Budget guard ──────────────────────────────────────────────
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

    // ── Model selection ─────────────────────────────────────────────
    const modelId    = (node.config?.model as string) ?? modelPolicy?.primaryModel ?? (agent.model as string) ?? 'openai/gpt-4o-mini';
    const temperature = modelPolicy?.temperature ?? 0.7;
    const maxTokens   = modelPolicy?.maxTokens   ?? 4096;
    //
    // fallbackChain: ordered list of fallback model ids (v6 schema).
    // Index 0 = first model to try when primary fails.
    // Bug-fix: was `modelPolicy?.fallbackModel` (singular, non-existent field).
    //
    const fallbackChain: string[] = modelPolicy?.fallbackChain ?? [];

    // ── System prompt (ProfilePropagatorService or agent.instructions) ────
    let systemPrompt = (node.config?.systemPrompt as string) ?? '';
    if (!systemPrompt) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ProfilePropagatorService } = require('../../profile-engine/src/index.js') as {
          ProfilePropagatorService: new (prisma: PrismaClient) => {
            resolveForAgent(id: string): Promise<{ systemPrompt: string }>;
          };
        };
        const propagator  = new ProfilePropagatorService(this.db);
        const resolved    = await propagator.resolveForAgent(agent.id);
        systemPrompt       = resolved.systemPrompt;
      } catch {
        systemPrompt = (agent.instructions as string) ?? 'You are a helpful assistant.';
      }
    }

    // ── Tools from skill links ────────────────────────────────────────
    const skillLinks = agent.skillLinks ?? [];
    const tools: ToolDefinition[] = skillLinks.map(({ skill }) => ({
      type: 'function' as const,
      function: {
        name:        skill.name as string,
        description: (skill.description as string) ?? undefined,
        parameters:  (skill.functions as Record<string, unknown>) ?? { type: 'object', properties: {} },
      },
    }));

    const userContent = (node.config?.prompt as string)
                     ?? JSON.stringify(run.trigger.payload ?? {})
                     ?? 'Continue.';

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent  },
    ];

    // ── Agentic tool-call loop ──────────────────────────────────────
    let adapter      = buildLLMClient(modelId);
    let activeModel  = modelId;
    let totalInput   = 0;
    let totalOutput  = 0;
    let lastContent: string | null = null;

    for (let round = 0; round < this.maxToolRoundsOverride; round++) {
      let llmResp: LlmResponse;
      try {
        llmResp = await adapter.chat(messages, tools, { model: activeModel, temperature, maxTokens });
      } catch (primaryErr) {
        // Try each model in the fallbackChain in order
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
            // next in chain
          }
        }
        if (!recovered) throw primaryErr;
      }

      totalInput  += llmResp!.usage.input;
      totalOutput += llmResp!.usage.output;
      lastContent  = llmResp!.content;

      if (!llmResp!.tool_calls.length) break;

      messages.push({
        role:       'assistant',
        content:    llmResp!.content,
        tool_calls: llmResp!.tool_calls,
      });

      const toolResults = await Promise.all(
        llmResp!.tool_calls.map(async (tc: ToolCallRequest) => {
          const args = parseToolArgs(tc.function.arguments);
          const res  = await this.skillInvoker.invoke(tc.function.name, args);
          return { tool_call_id: tc.id, skillName: tc.function.name, result: res };
        }),
      );

      for (const tr of toolResults) {
        messages.push({
          role:         'tool',
          content:      JSON.stringify(tr.result.ok ? tr.result.result : { error: tr.result.error }),
          tool_call_id: tr.tool_call_id,
          name:         tr.skillName,
        });
      }
    }

    const costUsd = calculateTokenCost(activeModel, totalInput, totalOutput);

    return {
      status: 'completed',
      output: {
        agentId:        agent.id,
        response:       lastContent,
        model:          activeModel,
        executionMode:  'direct',
        toolRoundsUsed: Math.ceil(
          messages.filter(m => m.role === 'tool').length / Math.max(tools.length, 1),
        ),
      },
      tokenUsage: { input: totalInput, output: totalOutput },
      costUsd,
    };
  }

  // ─── Tool node execution ─────────────────────────────────────────────

  protected override async executeTool(
    node:  FlowNode,
    _step: RunStep,
    _run:  RunSpec,
  ): Promise<StepExecutionResult> {
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
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseToolArgs(argsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argsJson);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
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
