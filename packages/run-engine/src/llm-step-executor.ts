/**
 * llm-step-executor.ts
 *
 * Full implementation of LlmStepExecutor.
 *
 * Features:
 *  1. Multi-provider routing — OpenAI native SDK, Anthropic native SDK,
 *     and any OpenAI-compatible endpoint (OpenRouter, Qwen/ModelStudio,
 *     DeepSeek) via the openai package with a custom baseURL.
 *  2. Agentic tool_calls loop — continues until the model stops calling
 *     tools or maxToolRounds is reached. Each tool call is dispatched to
 *     SkillInvoker and the result is fed back as a tool message.
 *  3. Cost calculation — uses COST_TABLE from core-types. Accumulates
 *     token usage across all rounds in the loop.
 *  4. PolicyResolver integration — resolves ModelPolicy (which model to
 *     use + fallback) and BudgetPolicy (spend limit) before execution.
 *     Throws BudgetExceededError if the rolling limit is already breached.
 *  5. HierarchyOrchestrator wiring — when agent.executionMode is
 *     'orchestrated' (or node.config.executionMode === 'orchestrated'),
 *     delegates to HierarchyOrchestrator instead of direct LLM loop.
 *     The orchestrator receives an AgentExecutorFn that recursively
 *     calls this same LlmStepExecutor for each leaf agent.
 *  6. ProfilePropagatorService — resolveForAgent() provides the compiled
 *     system prompt when AgentProfile exists.
 *
 * Provider routing key (ModelPolicy.primaryModel format):
 *   'openai/*'    → OpenAI API  (requires OPENAI_API_KEY)
 *   'anthropic/*' → Anthropic API (requires ANTHROPIC_API_KEY)
 *   anything else → OpenRouter-compat (requires OPENROUTER_API_KEY or
 *                   OPENAI_COMPAT_BASE_URL + OPENAI_COMPAT_API_KEY)
 */

import type { PrismaClient } from '@prisma/client';
import type { FlowNode } from '../../core-types/src';
import type { RunStep, RunSpec } from '../../core-types/src';
import { calculateTokenCost } from '../../core-types/src';
import { StepExecutor, type StepExecutionResult } from './step-executor';
import { PolicyResolver, type PolicyResolverContext } from './policy-resolver';
import { SkillInvoker } from './skill-invoker';

// ─── Re-export for backward compat ─────────────────────────────────────────────

export interface GatewayRpcClient {
  call(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

// ─── Options ─────────────────────────────────────────────────────────────────

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

// ─── Errors ─────────────────────────────────────────────────────────────────

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

// ─── Provider adapters ───────────────────────────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCallRequest[];
  name?: string;
}

interface ToolCallRequest {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

interface LlmResponse {
  content: string | null;
  tool_calls: ToolCallRequest[];
  usage: { input: number; output: number };
  model: string;
  finishReason: string;
}

interface ProviderAdapter {
  chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: { model: string; temperature: number; maxTokens: number },
  ): Promise<LlmResponse>;
}

// ── OpenAI adapter ──────────────────────────────────────────────────────────

class OpenAIAdapter implements ProviderAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly baseURL?: string,
    private readonly defaultHeaders?: Record<string, string>,
  ) {}

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: { model: string; temperature: number; maxTokens: number },
  ): Promise<LlmResponse> {
    let client: OpenAIClientLike | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { default: OpenAI } = require('openai') as { default: new (opts: Record<string, unknown>) => OpenAIClientLike };
      client = new OpenAI({
        apiKey: this.apiKey,
        ...(this.baseURL ? { baseURL: this.baseURL } : {}),
        ...(this.defaultHeaders ? { defaultHeaders: this.defaultHeaders } : {}),
      });
    } catch {
      // openai package not installed — fall through to fetch
    }

    if (client) return this.chatViaSDK(client, messages, tools, options);
    return this.chatViaFetch(messages, tools, options);
  }

  private async chatViaSDK(
    client: OpenAIClientLike,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: { model: string; temperature: number; maxTokens: number },
  ): Promise<LlmResponse> {
    const modelId = options.model.includes('/') ? options.model.split('/').slice(1).join('/') : options.model;
    const resp = await client.chat.completions.create({
      model:       modelId,
      messages:    messages as unknown[],
      tools:       tools.length ? tools : undefined,
      temperature: options.temperature,
      max_tokens:  options.maxTokens,
    }) as OpenAICompletionResponse;

    const choice = resp.choices[0];
    return {
      content:      choice.message.content ?? null,
      tool_calls:   (choice.message.tool_calls as ToolCallRequest[]) ?? [],
      usage: {
        input:  resp.usage?.prompt_tokens    ?? 0,
        output: resp.usage?.completion_tokens ?? 0,
      },
      model:        resp.model ?? options.model,
      finishReason: choice.finish_reason ?? 'stop',
    };
  }

  private async chatViaFetch(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: { model: string; temperature: number; maxTokens: number },
  ): Promise<LlmResponse> {
    const baseURL = this.baseURL ?? 'https://api.openai.com/v1';
    const modelId = options.model.includes('/') ? options.model.split('/').slice(1).join('/') : options.model;
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...this.defaultHeaders,
      },
      body: JSON.stringify({
        model:       modelId,
        messages,
        tools:       tools.length ? tools : undefined,
        temperature: options.temperature,
        max_tokens:  options.maxTokens,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI-compat API error ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json() as OpenAICompletionResponse;
    const choice = data.choices[0];
    return {
      content:      choice.message.content ?? null,
      tool_calls:   (choice.message.tool_calls as ToolCallRequest[]) ?? [],
      usage: {
        input:  data.usage?.prompt_tokens    ?? 0,
        output: data.usage?.completion_tokens ?? 0,
      },
      model:        data.model ?? options.model,
      finishReason: choice.finish_reason ?? 'stop',
    };
  }
}

// ── Anthropic adapter ─────────────────────────────────────────────────────

class AnthropicAdapter implements ProviderAdapter {
  constructor(private readonly apiKey: string) {}

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: { model: string; temperature: number; maxTokens: number },
  ): Promise<LlmResponse> {
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');
    const modelId = options.model.includes('/') ? options.model.split('/').slice(1).join('/') : options.model;

    const anthropicTools = tools.map(t => ({
      name:         t.function.name,
      description:  t.function.description ?? '',
      input_schema: t.function.parameters ?? { type: 'object', properties: {} },
    }));

    const anthropicMessages = chatMessages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content ?? '' }],
        };
      }
      if (m.role === 'assistant' && m.tool_calls?.length) {
        return {
          role: 'assistant' as const,
          content: m.tool_calls.map(tc => ({
            type:  'tool_use',
            id:    tc.id,
            name:  tc.function.name,
            input: JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>,
          })),
        };
      }
      return { role: m.role as 'user' | 'assistant', content: m.content ?? '' };
    });

    const body: Record<string, unknown> = {
      model:       modelId,
      max_tokens:  options.maxTokens,
      temperature: options.temperature,
      messages:    anthropicMessages,
    };
    if (systemMsg?.content)    body.system = systemMsg.content;
    if (anthropicTools.length) body.tools  = anthropicTools;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json() as AnthropicResponse;
    const textContent  = data.content.find(c => c.type === 'text')?.text ?? null;
    const toolUseItems = data.content.filter(c => c.type === 'tool_use');

    return {
      content:    textContent,
      tool_calls: toolUseItems.map(tc => ({
        id:   tc.id ?? '',
        type: 'function' as const,
        function: {
          name:      tc.name ?? '',
          arguments: JSON.stringify(tc.input ?? {}),
        },
      })),
      usage: {
        input:  data.usage?.input_tokens  ?? 0,
        output: data.usage?.output_tokens ?? 0,
      },
      model:        data.model ?? options.model,
      finishReason: data.stop_reason ?? 'end_turn',
    };
  }
}

// ─── Provider factory ──────────────────────────────────────────────────────────

function buildAdapter(model: string): ProviderAdapter {
  const [providerPrefix] = model.split('/');

  if (providerPrefix === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY env var is required for Anthropic models');
    return new AnthropicAdapter(key);
  }

  if (providerPrefix === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY env var is required for OpenAI models');
    return new OpenAIAdapter(key);
  }

  const key     = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_COMPAT_API_KEY;
  const baseURL = process.env.OPENAI_COMPAT_BASE_URL ?? 'https://openrouter.ai/api/v1';
  if (!key) {
    throw new Error(
      `No API key found for provider '${providerPrefix}'. ` +
      'Set OPENROUTER_API_KEY or OPENAI_COMPAT_API_KEY.',
    );
  }
  const defaultHeaders: Record<string, string> = {};
  if (process.env.OPENROUTER_SITE_URL)  defaultHeaders['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
  if (process.env.OPENROUTER_SITE_NAME) defaultHeaders['X-Title']      = process.env.OPENROUTER_SITE_NAME;

  return new OpenAIAdapter(key, baseURL, defaultHeaders);
}

// ─── Type shims ────────────────────────────────────────────────────────────

interface OpenAIClientLike {
  chat: { completions: { create(params: Record<string, unknown>): Promise<unknown> } };
}

interface OpenAICompletionResponse {
  choices: Array<{
    message: { content: string | null; tool_calls?: unknown[] };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
  model?: string;
}

interface AnthropicResponse {
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  usage?: { input_tokens: number; output_tokens: number };
  model?: string;
  stop_reason?: string;
}

// ─── LlmStepExecutor ───────────────────────────────────────────────────────────

export class LlmStepExecutor extends StepExecutor {
  private readonly db: PrismaClient;
  private readonly maxToolRounds: number;
  private readonly gateway?: GatewayRpcClient;
  private readonly policyResolver: PolicyResolver;
  private readonly skillInvoker: SkillInvoker;

  constructor(options: LlmStepExecutorOptions) {
    super();
    this.db             = options.db;
    this.maxToolRounds  = options.maxToolRounds ?? 10;
    this.gateway        = options.gateway;
    this.policyResolver = new PolicyResolver(this.db);
    this.skillInvoker   = new SkillInvoker(this.db);
  }

  // ─── Agent node execution ─────────────────────────────────────────────

  protected override async executeAgent(
    node: FlowNode,
    step: RunStep,
    run: RunSpec,
  ): Promise<StepExecutionResult> {
    // ── 1. Load agent ────────────────────────────────────────────────────
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

    // ── 2. Detect execution mode ─────────────────────────────────────────
    //
    // Priority: node.config.executionMode > agent.executionMode > 'direct'
    //
    // 'orchestrated' → delegate to HierarchyOrchestrator
    //   Used when the agent has subagents and needs to decompose/delegate.
    // 'direct' (default) → run the LLM tool_calls loop directly.
    // 'handoff' → treated as direct for now (handoff routing is in gateway).
    const executionMode =
      (node.config?.executionMode as string) ??
      (agent.executionMode as string) ??
      'direct';

    if (executionMode === 'orchestrated') {
      return this.executeOrchestrated(node, step, run, agent);
    }

    return this.executeDirect(node, step, run, agent);
  }

  // ─── Orchestrated path ─────────────────────────────────────────────────
  //
  // Builds a HierarchyNode tree from agent.subagents and delegates to
  // HierarchyOrchestrator.orchestrate().
  //
  // AgentExecutorFn is a closure that calls this same LlmStepExecutor
  // recursively for each leaf agent — so subagents also benefit from
  // policy resolution, budget checks, and skill invocation.

  private async executeOrchestrated(
    node:  FlowNode,
    _step: RunStep,
    run:   RunSpec,
    agent: AgentWithRelations,
  ): Promise<StepExecutionResult> {
    // Lazy require to avoid circular dependency at module parse time
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

    // Build HierarchyNode tree from agent + subagents
    const hierarchy = buildHierarchyNode(agent);

    // AgentExecutorFn: recursively calls this executor for each leaf agent.
    // Each call goes through the full direct path (policy, budget, tools).
    const executorFn: import('../../hierarchy/src').AgentExecutorFn = async (
      leafAgentId: string,
      systemPrompt: string,
      task: string,
    ) => {
      // Synthesize a minimal FlowNode and RunStep for the leaf
      const leafNode: FlowNode = {
        id:     `orchestrated-${leafAgentId}`,
        type:   'agent',
        config: {
          agentId:       leafAgentId,
          executionMode: 'direct',   // leaf agents always run direct
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

    // SupervisorFn: uses this agent's own model for decomposition + consolidation
    const modelId = (agent.model as string) ?? 'openai/gpt-4o-mini';
    const adapter  = buildAdapter(modelId);
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
      hierarchy,
      executorFn,
      this.db,
      supervisorFn,
      { parallel: true, maxRetries: 2 },
    );

    const result = await orchestrator.orchestrate(
      agent.workspaceId,
      task,
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

  // ─── Direct path (default) ──────────────────────────────────────────────
  //
  // agent may be null when called from executeOrchestrated for a leaf
  // (the leaf agent data is loaded fresh inside this method).

  private async executeDirect(
    node:  FlowNode,
    step:  RunStep,
    run:   RunSpec,
    agentOrNull: AgentWithRelations | null,
  ): Promise<StepExecutionResult> {
    // Load agent if not already provided (leaf agent path)
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

    const policyCtx: PolicyResolverContext = {
      agentId:      agent.id,
      workspaceId:  agent.workspaceId,
      departmentId: agent.workspace.departmentId,
      agencyId:     agent.workspace.department.agencyId,
    };

    // ── Policy resolution ────────────────────────────────────────────────
    const effectivePolicy = await this.policyResolver.resolve(policyCtx);
    const budgetPolicy    = effectivePolicy.budget;
    const modelPolicy     = effectivePolicy.model;

    // ── Budget pre-check ─────────────────────────────────────────────────
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

    // ── Model resolution ─────────────────────────────────────────────────
    const modelId     = (node.config?.model as string) ?? modelPolicy?.primaryModel ?? (agent.model as string) ?? 'openai/gpt-4o-mini';
    const temperature = modelPolicy?.temperature ?? 0.7;
    const maxTokens   = modelPolicy?.maxTokens   ?? 4096;

    // ── System prompt: ProfilePropagatorService > node.config > fallback ─
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
        // profile-engine not available or agent has no profile — use field fallback
        systemPrompt = (agent.instructions as string) ?? 'You are a helpful assistant.';
      }
    }

    // ── Tools from agent skills ──────────────────────────────────────────
    const skillLinks = agent.skillLinks ?? [];
    const tools: ToolDefinition[] = skillLinks.map(({ skill }) => ({
      type: 'function' as const,
      function: {
        name:        skill.name as string,
        description: (skill.description as string) ?? undefined,
        parameters:  (skill.functions as Record<string, unknown>) ?? { type: 'object', properties: {} },
      },
    }));

    // ── Initial messages ─────────────────────────────────────────────────
    const userContent = (node.config?.prompt as string)
                     ?? JSON.stringify(run.trigger.payload ?? {})
                     ?? 'Continue.';

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent  },
    ];

    // ── Agentic tool_calls loop ──────────────────────────────────────────
    const adapter = buildAdapter(modelId);
    let totalInput  = 0;
    let totalOutput = 0;
    let lastContent: string | null = null;
    let lastModel = modelId;

    for (let round = 0; round < this.maxToolRounds; round++) {
      let llmResp: LlmResponse;
      try {
        llmResp = await adapter.chat(messages, tools, { model: modelId, temperature, maxTokens });
      } catch (err) {
        if (modelPolicy?.fallbackModel && modelPolicy.fallbackModel !== modelId) {
          const fallbackAdapter = buildAdapter(modelPolicy.fallbackModel);
          llmResp = await fallbackAdapter.chat(messages, tools, {
            model:       modelPolicy.fallbackModel,
            temperature,
            maxTokens,
          });
          lastModel = modelPolicy.fallbackModel;
        } else {
          throw err;
        }
      }

      totalInput  += llmResp.usage.input;
      totalOutput += llmResp.usage.output;
      lastContent  = llmResp.content;

      if (!llmResp.tool_calls.length) break;

      messages.push({
        role:       'assistant',
        content:    llmResp.content,
        tool_calls: llmResp.tool_calls,
      });

      const toolResults = await Promise.all(
        llmResp.tool_calls.map(async tc => {
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

    const costUsd = calculateTokenCost(lastModel, totalInput, totalOutput);

    return {
      status: 'completed',
      output: {
        agentId:       agent.id,
        response:      lastContent,
        model:         lastModel,
        executionMode: 'direct',
        toolRoundsUsed: Math.ceil(
          messages.filter(m => m.role === 'tool').length / Math.max(tools.length, 1),
        ),
      },
      tokenUsage: { input: totalInput, output: totalOutput },
      costUsd,
    };
  }

  // ─── Tool node execution ──────────────────────────────────────────────

  protected override async executeTool(
    node:  FlowNode,
    _step: RunStep,
    _run:  RunSpec,
  ): Promise<StepExecutionResult> {
    const skillName = (node.config?.skillName as string)
                   ?? (node.config?.skillId   as string)
                   ?? 'unknown';
    const args = (node.config?.params as Record<string, unknown>) ?? {};

    const res = await this.skillInvoker.invoke(skillName, args);

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseToolArgs(argsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argsJson);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

// Minimal type for the agent with relations we need
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

/**
 * Converts the flat agent + subagents structure into the HierarchyNode tree
 * expected by HierarchyOrchestrator.
 */
function buildHierarchyNode(agent: AgentWithRelations): import('../../hierarchy/src').HierarchyNode {
  return {
    id:    agent.id,
    name:  agent.id,  // name from DB would require extra select; id is sufficient
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
