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
import { PolicyResolver, type PolicyResolverContext } from './policy-resolver';
import { SkillInvoker } from './skill-invoker';
import {
  buildLLMClient,
  type ChatMessage,
  type ToolDefinition,
  type LlmResponse,
  type ToolCallRequest,
} from './llm-client';

// ─── Re-export for backward compat ───────────────────────────────────────────────────────

export interface GatewayRpcClient {
  call(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

// ─── Options ────────────────────────────────────────────────────────────────────────

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

// ─── Errors ────────────────────────────────────────────────────────────────────────

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

// ─── LlmStepExecutor ──────────────────────────────────────────────────────────────────────────

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

  // ─── Agent node execution ────────────────────────────────────────────────

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

  // ─── Orchestrated path ───────────────────────────────────────────────────────────

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

    /**
     * executorFn — called by HierarchyOrchestrator.executeWithRetry() for each leaf agent.
     *
     * IMPORTANT: HierarchyOrchestrator already created the real RunStep in Prisma
     * via repo.createStep() before calling this function.
     * We must NOT create another RunStep here — that would duplicate steps in Prisma.
     *
     * We build a transient in-memory RunStep solely to satisfy executeDirect()'s
     * type contract (node + step + run + agent). The id is intentionally empty
     * because persistence is owned by HierarchyOrchestrator.
     */
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

      // Transient in-memory step — NOT persisted to Prisma.
      // HierarchyOrchestrator manages the real RunStep lifecycle.
      const leafStep: RunStep = {
        id:         '',            // empty: not a real Prisma ID
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

      // Return AgentExecutionResult with full LLM consumption metadata
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

  // ─── Direct path (default) ─────────────────────────────────────────────────────────────

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

    // ── Policy resolution ────────────────────────────────────────────────
    const policyCtx: PolicyResolverContext = {
      agentId:      agent.id,
      workspaceId:  agent.workspaceId,
      departmentId: agent.workspace.departmentId,
      agencyId:     agent.workspace.department.agencyId,
    };

    const effectivePolicy = await this.policyResolver.resolve(policyCtx);
    const budgetPolicy    = effectivePolicy.budget;
    const modelPolicy     = effectivePolicy.model;

    // ── Budget guard ──────────────────────────────────────────────────
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

    // ── Model selection ────────────────────────────────────────────────
    const modelId     = (node.config?.model as string) ?? modelPolicy?.primaryModel ?? (agent.model as string) ?? 'openai/gpt-4o-mini';
    const temperature = modelPolicy?.temperature ?? 0.7;
    const maxTokens   = modelPolicy?.maxTokens   ?? 4096;
    const fallbackChain: string[] = modelPolicy?.fallbackChain ?? [];

    // ── System prompt (ProfilePropagatorService or agent.instructions) ──────
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

    // ── Tools from skill links ────────────────────────────────────────────
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

    // ── Agentic tool-call loop ────────────────────────────────────────────
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

    const costUsd    = calculateTokenCost(activeModel, totalInput, totalOutput);
    // Derive provider from model ID: 'openai/gpt-4o-mini' → 'openai'
    const provider   = activeModel.includes('/') ? activeModel.split('/')[0] : activeModel;

    return {
      status: 'completed',
      output: {
        agentId:        agent.id,
        response:       lastContent,
        model:          activeModel,
        provider,
        executionMode:  'direct',
        toolRoundsUsed: Math.ceil(
          messages.filter(m => m.role === 'tool').length / Math.max(tools.length, 1),
        ),
      },
      tokenUsage: { input: totalInput, output: totalOutput },
      costUsd,
    };
  }

  // ─── Tool node execution ───────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────────────────────

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
