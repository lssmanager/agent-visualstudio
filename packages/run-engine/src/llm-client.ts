/**
 * llm-client.ts
 *
 * Unified LLM client factory for run-engine.
 *
 * Provides:
 *   - PROVIDER_MAP     — canonical map of model-prefix → LLMProvider enum
 *   - resolveProvider  — extract the LLMProvider from a "provider/model" id
 *   - buildLLMClient   — factory that returns the correct ProviderAdapter
 *
 * Model ID format:  "<provider>/<model>"
 *   openai/gpt-4o
 *   anthropic/claude-3-7-sonnet-20250219
 *   qwen/qwen-plus
 *   deepseek/deepseek-chat
 *   mistral/mistral-large-latest
 *   groq/llama-3-70b-8192
 *   openrouter/<anything>        → OpenRouter gateway
 *   <unknown>/<model>            → falls through to OpenRouter-compat
 *
 * Environment variables consumed:
 *   OPENAI_API_KEY            — required for openai/* models
 *   ANTHROPIC_API_KEY         — required for anthropic/* models
 *   OPENROUTER_API_KEY        — preferred for all other providers
 *   OPENAI_COMPAT_API_KEY     — fallback for non-OpenRouter compat endpoints
 *   OPENAI_COMPAT_BASE_URL    — override base URL (default: OpenRouter)
 *   OPENROUTER_SITE_URL       — optional HTTP-Referer header for OpenRouter
 *   OPENROUTER_SITE_NAME      — optional X-Title header for OpenRouter
 */

// ─── Provider enum ─────────────────────────────────────────────────────────

export enum LLMProvider {
  OPENAI      = 'openai',
  ANTHROPIC   = 'anthropic',
  OPENROUTER  = 'openrouter',
  QWEN        = 'qwen',
  DEEPSEEK    = 'deepseek',
  MISTRAL     = 'mistral',
  GROQ        = 'groq',
  /** Any OpenAI-compatible endpoint not listed above */
  COMPAT      = 'compat',
}

/**
 * Canonical mapping from model-id prefix to LLMProvider.
 *
 * Keys are the first segment of the model id before the first "/".
 * Prefixes NOT in this map fall through to COMPAT (OpenRouter-compat).
 */
export const PROVIDER_MAP: Readonly<Record<string, LLMProvider>> = {
  openai:     LLMProvider.OPENAI,
  anthropic:  LLMProvider.ANTHROPIC,
  openrouter: LLMProvider.OPENROUTER,
  qwen:       LLMProvider.QWEN,
  deepseek:   LLMProvider.DEEPSEEK,
  mistral:    LLMProvider.MISTRAL,
  groq:       LLMProvider.GROQ,
} as const;

/**
 * Resolve the LLMProvider for a given model identifier.
 *
 * @param modelId  e.g. "openai/gpt-4o", "qwen/qwen-plus", "gpt-4o"
 * @returns        The resolved LLMProvider (COMPAT for unknown prefixes)
 */
export function resolveProvider(modelId: string): LLMProvider {
  if (!modelId.includes('/')) return LLMProvider.COMPAT;
  const prefix = modelId.split('/')[0].toLowerCase();
  return PROVIDER_MAP[prefix] ?? LLMProvider.COMPAT;
}

// ─── Shared message / tool types ─────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCallRequest[];
  name?: string;
}

export interface ToolCallRequest {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface LlmResponse {
  content: string | null;
  tool_calls: ToolCallRequest[];
  usage: { input: number; output: number };
  model: string;
  finishReason: string;
}

export interface ChatOptions {
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface ProviderAdapter {
  chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: ChatOptions,
  ): Promise<LlmResponse>;
}

// ─── OpenAI adapter (covers openai/* and all compat endpoints) ─────────────

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

export class OpenAIAdapter implements ProviderAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly baseURL?: string,
    private readonly defaultHeaders?: Record<string, string>,
  ) {}

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: ChatOptions,
  ): Promise<LlmResponse> {
    let sdkClient: OpenAIClientLike | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { default: OpenAI } = require('openai') as {
        default: new (opts: Record<string, unknown>) => OpenAIClientLike;
      };
      sdkClient = new OpenAI({
        apiKey: this.apiKey,
        ...(this.baseURL        ? { baseURL:         this.baseURL }        : {}),
        ...(this.defaultHeaders ? { defaultHeaders:  this.defaultHeaders } : {}),
      });
    } catch {
      // openai npm package not installed — fall through to fetch path
    }

    if (sdkClient) return this._chatViaSDK(sdkClient, messages, tools, options);
    return this._chatViaFetch(messages, tools, options);
  }

  /** @internal — exposed for testing */
  async _chatViaSDK(
    client: OpenAIClientLike,
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: ChatOptions,
  ): Promise<LlmResponse> {
    const modelId = stripProviderPrefix(options.model);
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
        input:  resp.usage?.prompt_tokens     ?? 0,
        output: resp.usage?.completion_tokens ?? 0,
      },
      model:        resp.model ?? options.model,
      finishReason: choice.finish_reason ?? 'stop',
    };
  }

  /** @internal — exposed for testing */
  async _chatViaFetch(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: ChatOptions,
  ): Promise<LlmResponse> {
    const baseURL = this.baseURL ?? 'https://api.openai.com/v1';
    const modelId = stripProviderPrefix(options.model);
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
        input:  data.usage?.prompt_tokens     ?? 0,
        output: data.usage?.completion_tokens ?? 0,
      },
      model:        data.model ?? options.model,
      finishReason: choice.finish_reason ?? 'stop',
    };
  }
}

// ─── Anthropic adapter ───────────────────────────────────────────────────────

interface AnthropicApiResponse {
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

export class AnthropicAdapter implements ProviderAdapter {
  constructor(private readonly apiKey: string) {}

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: ChatOptions,
  ): Promise<LlmResponse> {
    const systemMsg    = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');
    const modelId      = stripProviderPrefix(options.model);

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

    const data = await res.json() as AnthropicApiResponse;
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

// ─── buildLLMClient factory ────────────────────────────────────────────────

/**
 * Build the correct ProviderAdapter for a given model identifier.
 *
 * Routes by provider prefix (see PROVIDER_MAP). Unknown prefixes are
 * routed to the OpenAI-compat endpoint (OpenRouter by default).
 *
 * @param modelId  Full model id in "<provider>/<model>" format.
 * @throws         Error if the required API key env var is not set.
 *
 * @example
 *   const client = buildLLMClient('openai/gpt-4o');
 *   const resp   = await client.chat(messages, tools, { model, temperature: 0.7, maxTokens: 4096 });
 */
export function buildLLMClient(modelId: string): ProviderAdapter {
  const provider = resolveProvider(modelId);

  // ── Anthropic ───────────────────────────────────────────────────────
  if (provider === LLMProvider.ANTHROPIC) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new MissingApiKeyError('ANTHROPIC_API_KEY', 'anthropic', modelId);
    return new AnthropicAdapter(key);
  }

  // ── OpenAI native ───────────────────────────────────────────────
  if (provider === LLMProvider.OPENAI) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new MissingApiKeyError('OPENAI_API_KEY', 'openai', modelId);
    return new OpenAIAdapter(key);
  }

  // ── All other providers → OpenRouter / compat endpoint ────────────────
  //
  // Provider precedence:
  //   1. OPENROUTER_API_KEY + openrouter.ai base URL (default)
  //   2. OPENAI_COMPAT_API_KEY + OPENAI_COMPAT_BASE_URL (self-hosted)
  //
  // Optional OpenRouter headers:
  //   OPENROUTER_SITE_URL  → HTTP-Referer   (rate-limit tier / attribution)
  //   OPENROUTER_SITE_NAME → X-Title        (displayed in dashboard)
  const key     = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_COMPAT_API_KEY;
  const baseURL = process.env.OPENAI_COMPAT_BASE_URL ?? 'https://openrouter.ai/api/v1';
  if (!key) {
    throw new MissingApiKeyError(
      'OPENROUTER_API_KEY',
      resolveProvider(modelId),
      modelId,
      'Also accepts OPENAI_COMPAT_API_KEY for self-hosted endpoints.',
    );
  }

  const extraHeaders: Record<string, string> = {};
  if (process.env.OPENROUTER_SITE_URL)  extraHeaders['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
  if (process.env.OPENROUTER_SITE_NAME) extraHeaders['X-Title']      = process.env.OPENROUTER_SITE_NAME;

  return new OpenAIAdapter(key, baseURL, Object.keys(extraHeaders).length ? extraHeaders : undefined);
}

// ─── MissingApiKeyError ────────────────────────────────────────────────

export class MissingApiKeyError extends Error {
  constructor(
    public readonly envVar: string,
    public readonly provider: LLMProvider | string,
    public readonly modelId: string,
    hint?: string,
  ) {
    const base = `Missing API key: ${envVar} is required for provider '${provider}' (model: ${modelId})`;
    super(hint ? `${base}. ${hint}` : base);
    this.name = 'MissingApiKeyError';
  }
}

// ─── Internal helpers ──────────────────────────────────────────────────

/**
 * Strip the provider prefix from a model id.
 * "openai/gpt-4o" → "gpt-4o"
 * "gpt-4o"         → "gpt-4o"  (no-op)
 */
export function stripProviderPrefix(modelId: string): string {
  return modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId;
}
