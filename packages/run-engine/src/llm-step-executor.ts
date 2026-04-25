import type { FlowNode } from '../../core-types/src';
import type { RunStep, RunSpec, RunStepTokenUsage } from '../../core-types/src';
import type { AgentSpec } from '../../core-types/src';
import { StepExecutor, StepExecutionResult } from './step-executor';

// ── Model policy ──────────────────────────────────────────────────────────

/**
 * Scope at which a model policy is evaluated.
 * Higher-specificity scopes override lower ones.
 */
export type ModelPolicyScope = 'global' | 'agency' | 'department' | 'workspace' | 'agent';

export interface ModelPolicy {
  scope: ModelPolicyScope;
  scopeId?: string;
  /** The model identifier to use (e.g. "gpt-4o", "claude-3-5-sonnet-20241022"). */
  model: string;
  /** Maximum tokens allowed per turn at this scope. */
  maxTokensPerTurn?: number;
  /** Allowed provider IDs at this scope. */
  allowedProviders?: string[];
}

/** Resolves the effective model for a given agent, walking from agent → workspace → global. */
export function resolveModelPolicy(
  agentSpec: Partial<AgentSpec> | undefined,
  policies: ModelPolicy[],
): ModelPolicy {
  const defaultPolicy: ModelPolicy = { scope: 'global', model: 'gpt-4o' };

  if (!policies.length) {
    // Fall back to the model stored directly on the agent spec
    const model = agentSpec?.model ?? defaultPolicy.model;
    return { ...defaultPolicy, model };
  }

  // Priority: agent > workspace > department > agency > global
  const scopePriority: ModelPolicyScope[] = ['agent', 'workspace', 'department', 'agency', 'global'];

  for (const scope of scopePriority) {
    const match = policies.find(
      (p) =>
        p.scope === scope &&
        // If a scopeId is provided, it must match the agent or workspace
        (p.scopeId === undefined ||
          (scope === 'agent' && p.scopeId === agentSpec?.id) ||
          (scope === 'workspace' && p.scopeId === agentSpec?.parentWorkspaceId)),
    );
    if (match) return match;
  }

  const model = agentSpec?.model ?? defaultPolicy.model;
  return { ...defaultPolicy, model };
}

// ── Provider client factory ───────────────────────────────────────────────

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'azure_openai' | 'custom';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  name?: string;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface LLMCompletionRequest {
  model: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMCompletionResponse {
  content: string | null;
  toolCalls?: LLMToolCall[];
  usage: RunStepTokenUsage;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

export interface LLMProviderClient {
  readonly provider: LLMProvider;
  complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;
}

/** Options for creating a provider client. */
export interface ProviderClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
}

/**
 * Factory that creates provider clients on-demand.
 * Extend or replace this to add real SDK clients.
 */
export class ProviderClientFactory {
  private readonly options: Map<LLMProvider, ProviderClientOptions>;

  constructor(options: Partial<Record<LLMProvider, ProviderClientOptions>> = {}) {
    this.options = new Map(Object.entries(options) as [LLMProvider, ProviderClientOptions][]);
  }

  /**
   * Detect the provider from a model identifier string.
   * Naming patterns (as of 2025):
   *   "claude-*"          → anthropic
   *   "gemini-*"          → google
   *   "gpt-*", "o1*", "o3*", "o4*" → openai (covers e.g. o1-preview, o3-mini, o4-mini)
   * NOTE: Verify patterns against current provider naming conventions as new
   * model families are released.
   */
  static detectProvider(model: string): LLMProvider {
    if (model.startsWith('claude-')) return 'anthropic';
    if (model.startsWith('gemini-')) return 'google';
    // Match "gpt-", "o1", "o1-", "o3", "o3-", "o4", "o4-" etc.
    if (model.startsWith('gpt-') || /^o\d/.test(model)) return 'openai';
    return 'openai';
  }

  /**
   * Create a client for the given provider.
   * TODO: Replace stub implementations with real provider SDKs
   * (openai npm package, @anthropic-ai/sdk, @google/generative-ai, etc.)
   */
  create(provider: LLMProvider): LLMProviderClient {
    const opts = this.options.get(provider) ?? {};

    // Return a stub client; swap in real SDK implementations as needed.
    return new StubLLMProviderClient(provider, opts);
  }

  createForModel(model: string): LLMProviderClient {
    return this.create(ProviderClientFactory.detectProvider(model));
  }
}

/**
 * Stub provider client used until real SDK clients are wired in.
 * Returns zeroed-out completions so the flow can still proceed in dev/test.
 */
class StubLLMProviderClient implements LLMProviderClient {
  constructor(
    readonly provider: LLMProvider,
    private readonly _opts: ProviderClientOptions,
  ) {}

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    // TODO: Replace with real provider SDK call
    return {
      content: `[${this.provider}] stub response for model ${request.model}`,
      usage: { input: 0, output: 0 },
      finishReason: 'stop',
    };
  }
}

// ── Tool execution hooks ──────────────────────────────────────────────────

export interface ToolExecutionHookContext {
  toolName: string;
  arguments: Record<string, unknown>;
  agentId?: string;
  runId: string;
  stepId: string;
}

export type ToolExecutionResult =
  | { ok: true; output: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Hook interface for intercepting tool calls made by an LLM agent.
 * Register implementations to connect real skill/tool endpoints.
 */
export interface ToolExecutionHook {
  /**
   * Called before a tool is executed. Return false to block execution.
   */
  beforeExecute?(ctx: ToolExecutionHookContext): Promise<boolean>;
  /**
   * Execute the tool and return a result.
   */
  execute(ctx: ToolExecutionHookContext): Promise<ToolExecutionResult>;
  /**
   * Called after a tool completes (success or failure).
   */
  afterExecute?(ctx: ToolExecutionHookContext, result: ToolExecutionResult): Promise<void>;
}

export class ToolHookRegistry {
  private readonly hooks = new Map<string, ToolExecutionHook>();

  register(toolName: string, hook: ToolExecutionHook): void {
    this.hooks.set(toolName, hook);
  }

  get(toolName: string): ToolExecutionHook | undefined {
    return this.hooks.get(toolName);
  }

  async runTool(ctx: ToolExecutionHookContext): Promise<ToolExecutionResult> {
    const hook = this.hooks.get(ctx.toolName);
    if (!hook) {
      // TODO: Route to the skill-registry once integrated
      return { ok: false, error: `No hook registered for tool: ${ctx.toolName}` };
    }

    const allowed = hook.beforeExecute ? await hook.beforeExecute(ctx) : true;
    if (!allowed) {
      return { ok: false, error: `Tool execution blocked by beforeExecute hook: ${ctx.toolName}` };
    }

    const result = await hook.execute(ctx);
    if (hook.afterExecute) {
      await hook.afterExecute(ctx, result);
    }
    return result;
  }
}

// ── Condition evaluation ──────────────────────────────────────────────────

export interface ConditionContext {
  expression: string;
  variables: Record<string, unknown>;
  previousOutput?: Record<string, unknown>;
}

/**
 * Evaluates simple condition expressions for flow branching.
 * Supports:
 *  - Literal "true" / "false"
 *  - Variable lookups: "$varName" or "${varName}"
 *  - Equality: "$var == value"
 *  - Negation prefix: "!"
 *
 * TODO: Integrate a proper expression evaluator (e.g. expr-eval, jexl) for
 * production use cases.
 */
export function evaluateCondition(ctx: ConditionContext): boolean {
  const { expression, variables, previousOutput } = ctx;
  const env = { ...variables, ...(previousOutput ?? {}) };

  const trimmed = expression.trim();

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Negation
  if (trimmed.startsWith('!')) {
    return !evaluateCondition({ ...ctx, expression: trimmed.slice(1).trim() });
  }

  // Variable lookup: $varName or ${varName}
  const varMatch = trimmed.match(/^\$\{?(\w+)\}?$/);
  if (varMatch) {
    const value = env[varMatch[1]];
    return Boolean(value);
  }

  // Equality: $var == value  or  $var != value
  // The right-hand side is compared as a literal string after stripping optional quotes.
  // Only word characters, hyphens, dots, and spaces are accepted to prevent expression injection.
  const eqMatch = trimmed.match(/^\$\{?(\w+)\}?\s*(==|!=)\s*(.+)$/);
  if (eqMatch) {
    const [, varName, op, rawValue] = eqMatch;
    const right = rawValue.trim().replace(/^["']|["']$/g, ''); // strip optional surrounding quotes
    // Reject right-hand values that contain characters outside safe literal set
    if (/[`$(){}[\]\\;|&<>]/.test(right)) {
      // Unsafe expression — treat as false rather than evaluating
      return false;
    }
    const left = String(env[varName] ?? '');
    return op === '==' ? left === right : left !== right;
  }

  // Fallback: treat non-empty string as truthy
  return trimmed.length > 0;
}

// ── Cost tracking ─────────────────────────────────────────────────────────

/**
 * Per-model pricing table (USD per 1 000 tokens).
 * Keep in sync with provider pricing pages.
 * Last verified: 2025-01. Prices may change — see provider dashboards.
 * TODO: Load this from a configurable database table or env file so updates
 * do not require a code change.
 */
export interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
}

export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { inputPer1k: 0.005, outputPer1k: 0.015 },
  'gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
  'gpt-4-turbo': { inputPer1k: 0.01, outputPer1k: 0.03 },
  'claude-3-5-sonnet-20241022': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-3-haiku-20240307': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  'gemini-1.5-pro': { inputPer1k: 0.00125, outputPer1k: 0.005 },
  'gemini-1.5-flash': { inputPer1k: 0.000075, outputPer1k: 0.0003 },
};

export function estimateCostUsd(model: string, usage: RunStepTokenUsage, pricingTable = DEFAULT_MODEL_PRICING): number {
  const pricing = pricingTable[model];
  if (!pricing) return 0;
  return (usage.input / 1000) * pricing.inputPer1k + (usage.output / 1000) * pricing.outputPer1k;
}

// ── LLMStepExecutor ───────────────────────────────────────────────────────

export interface LLMStepExecutorOptions {
  /** Model policies indexed by scope. Used to resolve which model to use per agent. */
  modelPolicies?: ModelPolicy[];
  /** Factory for creating provider clients. Defaults to a stub factory. */
  clientFactory?: ProviderClientFactory;
  /** Registry of tool execution hooks wired to real skill implementations. */
  toolHookRegistry?: ToolHookRegistry;
  /** Pricing table for cost estimation. Defaults to DEFAULT_MODEL_PRICING. */
  pricingTable?: Record<string, ModelPricing>;
}

/**
 * A StepExecutor implementation that performs real LLM inference.
 *
 * Responsibilities:
 *  1. Resolve the effective model via model policy scopes.
 *  2. Create the appropriate provider client via ProviderClientFactory.
 *  3. Build the prompt from the agent spec and step input.
 *  4. Execute tool calls via ToolHookRegistry when the model requests them.
 *  5. Evaluate condition expressions for branching.
 *  6. Track token usage and estimate cost per step.
 */
export class LLMStepExecutor extends StepExecutor {
  private readonly modelPolicies: ModelPolicy[];
  private readonly clientFactory: ProviderClientFactory;
  private readonly toolHookRegistry: ToolHookRegistry;
  private readonly pricingTable: Record<string, ModelPricing>;

  constructor(options: LLMStepExecutorOptions = {}) {
    super();
    this.modelPolicies = options.modelPolicies ?? [];
    this.clientFactory = options.clientFactory ?? new ProviderClientFactory();
    this.toolHookRegistry = options.toolHookRegistry ?? new ToolHookRegistry();
    this.pricingTable = options.pricingTable ?? DEFAULT_MODEL_PRICING;
  }

  /**
   * Override the base agent execution to perform real LLM inference.
   */
  protected override async executeAgent(
    node: FlowNode,
    step: RunStep,
    run: RunSpec,
  ): Promise<StepExecutionResult> {
    const agentId = (node.config.agentId as string) ?? 'unknown';
    // TODO: Load the full AgentSpec from WorkspaceStore / DB once integrated
    const agentSpec: Partial<AgentSpec> = {
      id: agentId,
      parentWorkspaceId: run.workspaceId,
    };

    const policy = resolveModelPolicy(agentSpec, this.modelPolicies);
    const client = this.clientFactory.createForModel(policy.model);

    const systemPrompt = (node.config.systemPrompt as string) ?? 'You are a helpful assistant.';
    const userMessage = (node.config.prompt as string) ?? JSON.stringify(step.input ?? {});

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    // Build tool definitions from node config
    const rawTools = node.config.tools as LLMToolDefinition[] | undefined;

    let accumulatedUsage: RunStepTokenUsage = { input: 0, output: 0 };
    let finalContent = '';
    let toolCallsExecuted: Record<string, unknown>[] = [];

    // Maximum number of agentic loop iterations to prevent infinite tool call cycles.
    // Each iteration is one LLM call + its tool executions. Typical workflows rarely
    // exceed 3-5 iterations; 10 provides a safety margin while bounding compute cost.
    const MAX_TOOL_CALL_ITERATIONS = 10;
    let remainingIterations = MAX_TOOL_CALL_ITERATIONS;

    // Agentic loop: keep calling LLM until finish_reason is 'stop'
    while (remainingIterations-- > 0) {
      const response = await client.complete({
        model: policy.model,
        messages,
        tools: rawTools,
        maxTokens: policy.maxTokensPerTurn,
      });

      accumulatedUsage = {
        input: accumulatedUsage.input + response.usage.input,
        output: accumulatedUsage.output + response.usage.output,
      };

      if (response.finishReason === 'tool_calls' && response.toolCalls?.length) {
        // Execute each tool call and feed results back into messages
        for (const toolCall of response.toolCalls) {
          const hookCtx: ToolExecutionHookContext = {
            toolName: toolCall.name,
            arguments: toolCall.arguments,
            agentId,
            runId: run.id,
            stepId: step.id,
          };

          const toolResult = await this.toolHookRegistry.runTool(hookCtx);
          toolCallsExecuted.push({ toolCallId: toolCall.id, name: toolCall.name, result: toolResult });

          // Append assistant message with tool call + tool result to messages
          messages.push({
            role: 'assistant',
            content: response.content ?? '',
          });
          messages.push({
            role: 'tool',
            content: toolResult.ok ? JSON.stringify(toolResult.output) : toolResult.error,
            toolCallId: toolCall.id,
            name: toolCall.name,
          });
        }
        continue; // Loop back to call LLM with tool results
      }

      // Terminal finish reason
      finalContent = response.content ?? '';
      break;
    }

    const costUsd = estimateCostUsd(policy.model, accumulatedUsage, this.pricingTable);

    return {
      status: 'completed',
      output: {
        agentId,
        model: policy.model,
        content: finalContent,
        toolCallsExecuted,
      },
      tokenUsage: accumulatedUsage,
      costUsd,
    };
  }

  /**
   * Override condition evaluation to use the real condition evaluator.
   */
  protected override async executeCondition(
    node: FlowNode,
    step: RunStep,
    _run: RunSpec,
  ): Promise<StepExecutionResult> {
    const expression = (node.config.expression as string) ?? 'true';
    const branches = (node.config.branches as string[]) ?? ['true', 'false'];
    const variables = (step.input ?? {}) as Record<string, unknown>;

    const result = evaluateCondition({ expression, variables });
    const branch = result ? (branches[0] ?? 'true') : (branches[1] ?? 'false');

    return {
      status: 'completed',
      output: { expression, evaluated: result, branch },
      branch,
    };
  }

  /**
   * Override tool execution to route through the ToolHookRegistry.
   */
  protected override async executeTool(
    node: FlowNode,
    step: RunStep,
    run: RunSpec,
  ): Promise<StepExecutionResult> {
    const skillId = (node.config.skillId as string) ?? 'unknown';
    const functionName = (node.config.functionName as string) ?? 'unknown';
    const toolName = `${skillId}.${functionName}`;

    const hookCtx: ToolExecutionHookContext = {
      toolName,
      arguments: (node.config.args as Record<string, unknown>) ?? {},
      runId: run.id,
      stepId: step.id,
    };

    const result = await this.toolHookRegistry.runTool(hookCtx);

    if (!result.ok) {
      return {
        status: 'failed',
        error: result.error,
        output: { skillId, functionName, toolName },
      };
    }

    return {
      status: 'completed',
      output: { skillId, functionName, toolName, result: result.output },
    };
  }
}
