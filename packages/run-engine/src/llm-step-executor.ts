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
 *  5. GatewayRpcClient kept for backward compat but bypassed when
 *     a PrismaClient is provided.
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

// Common shapes used across adapters
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
    arguments: string; // JSON string
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
    options: {
      model:       string;
      temperature: number;
      maxTokens:   number;
    },
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
    // Use the openai npm package if available, otherwise fall back to raw fetch.
    // This avoids hard-coding a peer dependency version.
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

    if (client) {
      return this.chatViaSDK(client, messages, tools, options);
    }
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
    // Separate system message from the rest
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');
    const modelId = options.model.includes('/') ? options.model.split('/').slice(1).join('/') : options.model;

    // Convert tool format: OpenAI → Anthropic
    const anthropicTools = tools.map(t => ({
      name:        t.function.name,
      description: t.function.description ?? '',
      input_schema: t.function.parameters ?? { type: 'object', properties: {} },
    }));

    // Convert messages: tool role → Anthropic tool_result
    const anthropicMessages = chatMessages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          content: [{
            type: 'tool_result',
            tool_use_id: m.tool_call_id,
            content: m.content ?? '',
          }],
        };
      }
      if (m.role === 'assistant' && m.tool_calls?.length) {
        return {
          role: 'assistant' as const,
          content: m.tool_calls.map(tc => ({
            type: 'tool_use',
            id:   tc.id,
            name: tc.function.name,
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
    if (systemMsg?.content) body.system = systemMsg.content;
    if (anthropicTools.length)  body.tools  = anthropicTools;

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

    // Convert response back to OpenAI-like shape
    const textContent  = data.content.find(c => c.type === 'text')?.text ?? null;
    const toolUseItems = data.content.filter(c => c.type === 'tool_use');

    const toolCalls: ToolCallRequest[] = toolUseItems.map(tc => ({
      id:   tc.id ?? '',
      type: 'function' as const,
      function: {
        name:      tc.name ?? '',
        arguments: JSON.stringify(tc.input ?? {}),
      },
    }));

    return {
      content:      textContent,
      tool_calls:   toolCalls,
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

  // OpenRouter / Qwen ModelStudio / DeepSeek — all speak OpenAI-compat
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

// ─── Type shims (avoid importing full SDK types) ────────────────────────────

interface OpenAIClientLike {
  chat: {
    completions: {
      create(params: Record<string, unknown>): Promise<unknown>;
    };
  };
}

interface OpenAICompletionResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: unknown[];
    };
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
    // ── 1. Load agent + resolve hierarchy context ────────────────────────
    const agentId = (node.config.agentId as string) ?? step.agentId ?? '';
    if (!agentId) {
      return { status: 'failed', error: 'agent node missing agentId in config' };
    }

    const agent = await this.db.agent.findUnique({
      where: { id: agentId },
      include: {
        workspace: { include: { department: { include: { agency: true } } } },
        skills:    { include: { skill: true } },
      },
    });

    if (!agent) {
      return { status: 'failed', error: `Agent '${agentId}' not found` };
    }

    const policyCtx: PolicyResolverContext = {
      agentId,
      workspaceId:  agent.workspaceId,
      departmentId: agent.workspace.departmentId,
      agencyId:     agent.workspace.department.agencyId,
    };

    // ── 2. Resolve effective policies ────────────────────────────────
    const effectivePolicy = await this.policyResolver.resolve(policyCtx);
    const budgetPolicy    = effectivePolicy.budget;
    const modelPolicy     = effectivePolicy.model;

    // ── 3. Budget pre-check ──────────────────────────────────────────
    if (budgetPolicy) {
      const windowStart = new Date(
        Date.now() - budgetPolicy.periodDays * 24 * 60 * 60 * 1000,
      );
      const { _sum } = await this.db.runStep.aggregate({
        where: {
          run: {
            flow: { agentId },
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

    // ── 4. Determine model ─────────────────────────────────────────────
    const modelId    = (node.config.model as string)
                    ?? modelPolicy?.primaryModel
                    ?? agent.model
                    ?? 'openai/gpt-4o-mini';
    const temperature = modelPolicy?.temperature ?? 0.7;
    const maxTokens   = modelPolicy?.maxTokens   ?? 4096;
    const systemPrompt = (node.config.systemPrompt as string)
                      ?? agent.systemPrompt
                      ?? 'You are a helpful assistant.';

    // ── 5. Build tools list from agent skills ─────────────────────────
    const tools: ToolDefinition[] = agent.skills.map(({ skill }) => ({
      type: 'function' as const,
      function: {
        name:        skill.name,
        description: skill.description ?? undefined,
        parameters:  (skill.schema as Record<string, unknown>) ?? {
          type: 'object',
          properties: {},
        },
      },
    }));

    // ── 6. Build initial messages ─────────────────────────────────
    const userContent = (node.config.prompt as string)
                     ?? JSON.stringify(run.trigger.payload ?? {})
                     ?? 'Continue.';

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent  },
    ];

    // ── 7. Agentic tool_calls loop ─────────────────────────────────
    const adapter = buildAdapter(modelId);
    let totalInput  = 0;
    let totalOutput = 0;
    let lastContent: string | null = null;
    let lastModel = modelId;

    for (let round = 0; round < this.maxToolRounds; round++) {
      let llmResp: LlmResponse;
      try {
        llmResp = await adapter.chat(messages, tools, {
          model:       modelId,
          temperature,
          maxTokens,
        });
      } catch (err) {
        // If primary model fails and there’s a fallback, retry once
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

      // No tool calls — model is done
      if (!llmResp.tool_calls.length) break;

      // Append assistant message with tool_calls
      messages.push({
        role:       'assistant',
        content:    llmResp.content,
        tool_calls: llmResp.tool_calls,
      });

      // Dispatch all tool calls in this round in parallel
      const toolResults = await Promise.all(
        llmResp.tool_calls.map(async tc => {
          const args = parseToolArgs(tc.function.arguments);
          const res  = await this.skillInvoker.invoke(tc.function.name, args);
          return {
            tool_call_id: tc.id,
            skillName:    tc.function.name,
            result:       res,
          };
        }),
      );

      // Feed tool results back as tool messages
      for (const tr of toolResults) {
        messages.push({
          role:         'tool',
          content:      JSON.stringify(tr.result.ok ? tr.result.result : { error: tr.result.error }),
          tool_call_id: tr.tool_call_id,
          name:         tr.skillName,
        });
      }
    }

    // ── 8. Calculate cost ────────────────────────────────────────────
    const costUsd = calculateTokenCost(lastModel, totalInput, totalOutput);

    // ── 9. Return result ─────────────────────────────────────────────
    return {
      status: 'completed',
      output: {
        agentId,
        response: lastContent,
        model:    lastModel,
        toolRoundsUsed: Math.ceil(
          messages.filter(m => m.role === 'tool').length /
          Math.max(tools.length, 1)
        ),
      },
      tokenUsage: { input: totalInput, output: totalOutput },
      costUsd,
    };
  }

  // ─── Tool node execution ──────────────────────────────────────────────
  // Direct skill invocation without LLM — used for 'tool' node type
  // when a flow step calls a skill deterministically (no model involved).

  protected override async executeTool(
    node: FlowNode,
    step: RunStep,
    _run: RunSpec,
  ): Promise<StepExecutionResult> {
    const skillName = (node.config.skillName as string)
                   ?? (node.config.skillId   as string)
                   ?? 'unknown';
    const args = (node.config.params as Record<string, unknown>) ?? {};

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
      output: {
        skillName,
        result:     res.result,
        durationMs: res.durationMs,
      },
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
