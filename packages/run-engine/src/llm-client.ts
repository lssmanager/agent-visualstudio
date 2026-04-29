/**
 * llm-client.ts
 *
 * Unified LLM client factory for run-engine.
 *
 * Provides:
 *   - LLMProvider            — enum of all 51 provider families
 *   - ProviderConfig         — metadata record: adapter, apiKeyEnv, baseURL
 *   - PROVIDER_CONFIG_MAP    — canonical map of model-prefix → ProviderConfig
 *   - resolveProviderConfig  — extract ProviderConfig from a "provider/model" id
 *   - resolveProvider        — backward-compat alias (returns LLMProvider)
 *   - buildLLMClient         — factory that returns the correct ProviderAdapter
 *
 * Model ID format:  "<provider>/<model>"
 *   openai/gpt-4.1
 *   anthropic/claude-sonnet-4
 *   google/gemini-2.5-pro
 *   kimi/kimi-code                 → AnthropicAdapter (Anthropic-compat)
 *   ollama/llama3.3                → OpenAIAdapter (local, no key)
 *   <unknown>/<model>              → falls through to COMPAT / OpenRouter
 *
 * API key resolution order (per provider):
 *   1. apiKeyEnv (primary)
 *   2. apiKeyEnvAlt[] (alternatives, in order)
 *   3. OPENROUTER_API_KEY (universal fallback)
 *   4. OPENAI_COMPAT_API_KEY (legacy fallback)
 *   Local providers (adapter='local') never throw on missing key.
 */

// ─── Provider enum ────────────────────────────────────────────────────────────

export enum LLMProvider {
  OPENAI          = 'openai',
  ANTHROPIC       = 'anthropic',
  OPENROUTER      = 'openrouter',

  // OpenAI-compat with dedicated API key + own baseURL
  GOOGLE          = 'google',
  XAI             = 'xai',
  DEEPSEEK        = 'deepseek',
  QWEN            = 'qwen',
  MISTRAL         = 'mistral',
  GROQ            = 'groq',
  TOGETHER        = 'together',
  CEREBRAS        = 'cerebras',
  NVIDIA          = 'nvidia',
  MOONSHOT        = 'moonshot',
  STEPFUN         = 'stepfun',
  STEPFUN_PLAN    = 'stepfun-plan',
  QIANFAN         = 'qianfan',
  MINIMAX         = 'minimax',
  MINIMAX_PORTAL  = 'minimax-portal',
  VOLCENGINE      = 'volcengine',
  VOLCENGINE_PLAN = 'volcengine-plan',
  BYTEPLUS        = 'byteplus',
  BYTEPLUS_PLAN   = 'byteplus-plan',
  HUGGINGFACE     = 'huggingface',
  DEEPINFRA       = 'deepinfra',
  ZAI             = 'zai',
  XIAOMI          = 'xiaomi',
  VENICE          = 'venice',
  FIREWORKS       = 'fireworks',
  PERPLEXITY      = 'perplexity',
  ARCEE           = 'arcee',
  GRADIUM         = 'gradium',
  CHUTES          = 'chutes',
  INFERRS         = 'inferrs',
  VYDRA           = 'vydra',
  TENCENT         = 'tencent',

  // Gateways (proxy OpenAI-compat)
  KILOCODE              = 'kilocode',
  VERCEL_AI_GATEWAY     = 'vercel-ai-gateway',
  CLOUDFLARE_AI_GATEWAY = 'cloudflare-ai-gateway',
  LITELLM               = 'litellm',
  OPENCODE              = 'opencode',
  OPENCODE_GO           = 'opencode-go',
  GITHUB_COPILOT        = 'github-copilot',

  // Anthropic-compatible (NOT openai-compat)
  KIMI      = 'kimi',
  SYNTHETIC = 'synthetic',

  // OpenAI-Codex OAuth (subscription — no per-token billing)
  OPENAI_CODEX = 'openai-codex',

  // Local (no API key required, hardcoded local baseURL)
  OLLAMA   = 'ollama',
  LMSTUDIO = 'lmstudio',
  VLLM     = 'vllm',
  SGLANG   = 'sglang',

  /** Any OpenAI-compatible endpoint not listed above */
  COMPAT = 'compat',
}

// ─── ProviderConfig ──────────────────────────────────────────────────────────

export interface ProviderConfig {
  provider: LLMProvider;
  /** Primary env var for the API key */
  apiKeyEnv?: string;
  /** Alternative env vars (tried in order after apiKeyEnv) */
  apiKeyEnvAlt?: string[];
  /** Fixed baseURL for this provider (absent = use OpenAI default) */
  baseURL?: string;
  /** Transport adapter to use */
  adapter: 'openai' | 'anthropic' | 'local';
}

// ─── PROVIDER_CONFIG_MAP ─────────────────────────────────────────────────────

/**
 * Canonical mapping from model-id prefix → ProviderConfig.
 *
 * Keys are the first segment of the model id before the first "/".
 * Unknown prefixes fall through to COMPAT (OpenRouter-compat gateway).
 */
export const PROVIDER_CONFIG_MAP: Readonly<Record<string, ProviderConfig>> = {

  // ── Native adapters ─────────────────────────────────────────────────────
  'openai': {
    provider: LLMProvider.OPENAI,
    apiKeyEnv: 'OPENAI_API_KEY',
    adapter: 'openai',
  },
  'openai-codex': {
    provider: LLMProvider.OPENAI_CODEX,
    apiKeyEnv: 'OPENAI_API_KEY',
    adapter: 'openai',
  },
  'anthropic': {
    provider: LLMProvider.ANTHROPIC,
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    adapter: 'anthropic',
  },

  // ── OpenAI-compat with own baseURL ──────────────────────────────────────
  'google': {
    provider: LLMProvider.GOOGLE,
    apiKeyEnv: 'GEMINI_API_KEY',
    apiKeyEnvAlt: ['GOOGLE_API_KEY'],
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    adapter: 'openai',
  },
  'xai': {
    provider: LLMProvider.XAI,
    apiKeyEnv: 'XAI_API_KEY',
    baseURL: 'https://api.x.ai/v1',
    adapter: 'openai',
  },
  'deepseek': {
    provider: LLMProvider.DEEPSEEK,
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com/v1',
    adapter: 'openai',
  },
  'qwen': {
    provider: LLMProvider.QWEN,
    apiKeyEnv: 'QWEN_API_KEY',
    apiKeyEnvAlt: ['MODELSTUDIO_API_KEY', 'DASHSCOPE_API_KEY'],
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    adapter: 'openai',
  },
  'mistral': {
    provider: LLMProvider.MISTRAL,
    apiKeyEnv: 'MISTRAL_API_KEY',
    baseURL: 'https://api.mistral.ai/v1',
    adapter: 'openai',
  },
  'groq': {
    provider: LLMProvider.GROQ,
    apiKeyEnv: 'GROQ_API_KEY',
    baseURL: 'https://api.groq.com/openai/v1',
    adapter: 'openai',
  },
  'together': {
    provider: LLMProvider.TOGETHER,
    apiKeyEnv: 'TOGETHER_API_KEY',
    baseURL: 'https://api.together.xyz/v1',
    adapter: 'openai',
  },
  'cerebras': {
    provider: LLMProvider.CEREBRAS,
    apiKeyEnv: 'CEREBRAS_API_KEY',
    baseURL: 'https://api.cerebras.ai/v1',
    adapter: 'openai',
  },
  'nvidia': {
    provider: LLMProvider.NVIDIA,
    apiKeyEnv: 'NVIDIA_API_KEY',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    adapter: 'openai',
  },
  'moonshot': {
    provider: LLMProvider.MOONSHOT,
    apiKeyEnv: 'MOONSHOT_API_KEY',
    baseURL: 'https://api.moonshot.ai/v1',
    adapter: 'openai',
  },
  'stepfun': {
    provider: LLMProvider.STEPFUN,
    apiKeyEnv: 'STEPFUN_API_KEY',
    baseURL: 'https://api.stepfun.com/v1',
    adapter: 'openai',
  },
  'stepfun-plan': {
    provider: LLMProvider.STEPFUN_PLAN,
    apiKeyEnv: 'STEPFUN_API_KEY',
    baseURL: 'https://api.stepfun.com/v1',
    adapter: 'openai',
  },
  'qianfan': {
    provider: LLMProvider.QIANFAN,
    apiKeyEnv: 'QIANFAN_API_KEY',
    baseURL: 'https://qianfan.baidubce.com/v2',
    adapter: 'openai',
  },
  'minimax': {
    provider: LLMProvider.MINIMAX,
    apiKeyEnv: 'MINIMAX_API_KEY',
    baseURL: 'https://api.minimax.chat/v1',
    adapter: 'openai',
  },
  'minimax-portal': {
    provider: LLMProvider.MINIMAX_PORTAL,
    apiKeyEnv: 'MINIMAX_OAUTH_TOKEN',
    apiKeyEnvAlt: ['MINIMAX_API_KEY'],
    baseURL: 'https://api.minimax.chat/v1',
    adapter: 'openai',
  },
  'volcengine': {
    provider: LLMProvider.VOLCENGINE,
    apiKeyEnv: 'VOLCANO_ENGINE_API_KEY',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    adapter: 'openai',
  },
  'volcengine-plan': {
    provider: LLMProvider.VOLCENGINE_PLAN,
    apiKeyEnv: 'VOLCANO_ENGINE_API_KEY',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    adapter: 'openai',
  },
  'byteplus': {
    provider: LLMProvider.BYTEPLUS,
    apiKeyEnv: 'BYTEPLUS_API_KEY',
    baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
    adapter: 'openai',
  },
  'byteplus-plan': {
    provider: LLMProvider.BYTEPLUS_PLAN,
    apiKeyEnv: 'BYTEPLUS_API_KEY',
    baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
    adapter: 'openai',
  },
  'huggingface': {
    provider: LLMProvider.HUGGINGFACE,
    apiKeyEnv: 'HUGGINGFACE_HUB_TOKEN',
    apiKeyEnvAlt: ['HF_TOKEN'],
    baseURL: 'https://router.huggingface.co/v1',
    adapter: 'openai',
  },
  'deepinfra': {
    provider: LLMProvider.DEEPINFRA,
    apiKeyEnv: 'DEEPINFRA_API_KEY',
    baseURL: 'https://api.deepinfra.com/v1/openai',
    adapter: 'openai',
  },
  'zai': {
    provider: LLMProvider.ZAI,
    apiKeyEnv: 'ZAI_API_KEY',
    baseURL: 'https://api.z.ai/api/paas/v4',
    adapter: 'openai',
  },
  // aliases for zai
  'z.ai': {
    provider: LLMProvider.ZAI,
    apiKeyEnv: 'ZAI_API_KEY',
    baseURL: 'https://api.z.ai/api/paas/v4',
    adapter: 'openai',
  },
  'z-ai': {
    provider: LLMProvider.ZAI,
    apiKeyEnv: 'ZAI_API_KEY',
    baseURL: 'https://api.z.ai/api/paas/v4',
    adapter: 'openai',
  },
  'xiaomi': {
    provider: LLMProvider.XIAOMI,
    apiKeyEnv: 'XIAOMI_API_KEY',
    baseURL: 'https://api.micloud.xiaomi.net/v1',
    adapter: 'openai',
  },
  'venice': {
    provider: LLMProvider.VENICE,
    apiKeyEnv: 'VENICE_API_KEY',
    baseURL: 'https://api.venice.ai/api/v1',
    adapter: 'openai',
  },
  'fireworks': {
    provider: LLMProvider.FIREWORKS,
    apiKeyEnv: 'FIREWORKS_API_KEY',
    baseURL: 'https://api.fireworks.ai/inference/v1',
    adapter: 'openai',
  },
  'perplexity': {
    provider: LLMProvider.PERPLEXITY,
    apiKeyEnv: 'PERPLEXITY_API_KEY',
    baseURL: 'https://api.perplexity.ai',
    adapter: 'openai',
  },
  'arcee': {
    provider: LLMProvider.ARCEE,
    apiKeyEnv: 'ARCEE_API_KEY',
    baseURL: 'https://conductor.arcee.ai/v1',
    adapter: 'openai',
  },
  'gradium': {
    provider: LLMProvider.GRADIUM,
    apiKeyEnv: 'GRADIUM_API_KEY',
    baseURL: 'https://api.gradium.ai/v1',
    adapter: 'openai',
  },
  'chutes': {
    provider: LLMProvider.CHUTES,
    apiKeyEnv: 'CHUTES_API_KEY',
    baseURL: 'https://llm.chutes.ai/v1',
    adapter: 'openai',
  },
  'inferrs': {
    provider: LLMProvider.INFERRS,
    apiKeyEnv: 'INFERRS_API_KEY',
    baseURL: 'https://api.inferrs.com/v1',
    adapter: 'openai',
  },
  'vydra': {
    provider: LLMProvider.VYDRA,
    apiKeyEnv: 'VYDRA_API_KEY',
    baseURL: 'https://api.vydra.io/v1',
    adapter: 'openai',
  },
  'tencent': {
    provider: LLMProvider.TENCENT,
    apiKeyEnv: 'TENCENT_API_KEY',
    baseURL: 'https://api.hunyuan.cloud.tencent.com/v1',
    adapter: 'openai',
  },

  // ── Gateways (proxy OpenAI-compat) ──────────────────────────────────────
  'openrouter': {
    provider: LLMProvider.OPENROUTER,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    baseURL: 'https://openrouter.ai/api/v1',
    adapter: 'openai',
  },
  'kilocode': {
    provider: LLMProvider.KILOCODE,
    apiKeyEnv: 'KILOCODE_API_KEY',
    baseURL: 'https://api.kilo.ai/api/gateway',
    adapter: 'openai',
  },
  'vercel-ai-gateway': {
    provider: LLMProvider.VERCEL_AI_GATEWAY,
    apiKeyEnv: 'AI_GATEWAY_API_KEY',
    baseURL: 'https://ai-gateway.vercel.sh',
    adapter: 'openai',
  },
  'cloudflare-ai-gateway': {
    provider: LLMProvider.CLOUDFLARE_AI_GATEWAY,
    apiKeyEnv: 'CLOUDFLARE_AI_GATEWAY_API_KEY',
    baseURL: 'https://gateway.ai.cloudflare.com/v1',
    adapter: 'openai',
  },
  'litellm': {
    provider: LLMProvider.LITELLM,
    apiKeyEnv: 'LITELLM_API_KEY',
    baseURL: process.env['LITELLM_BASE_URL'] ?? 'http://localhost:4000',
    adapter: 'openai',
  },
  'opencode': {
    provider: LLMProvider.OPENCODE,
    apiKeyEnv: 'OPENCODE_API_KEY',
    baseURL: 'https://api.opencode.ai/v1',
    adapter: 'openai',
  },
  'opencode-go': {
    provider: LLMProvider.OPENCODE_GO,
    apiKeyEnv: 'OPENCODE_ZEN_API_KEY',
    apiKeyEnvAlt: ['OPENCODE_API_KEY'],
    baseURL: 'https://api.opencode.ai/v1',
    adapter: 'openai',
  },
  'github-copilot': {
    provider: LLMProvider.GITHUB_COPILOT,
    apiKeyEnv: 'COPILOT_GITHUB_TOKEN',
    apiKeyEnvAlt: ['GH_TOKEN', 'GITHUB_TOKEN'],
    baseURL: 'https://api.githubcopilot.com',
    adapter: 'openai',
  },

  // ── Anthropic-compat (use AnthropicAdapter with custom baseURL) ──────────
  'kimi': {
    provider: LLMProvider.KIMI,
    apiKeyEnv: 'KIMI_API_KEY',
    apiKeyEnvAlt: ['KIMICODE_API_KEY'],
    baseURL: 'https://api.moonshot.ai/anthropic',
    adapter: 'anthropic',
  },
  'synthetic': {
    provider: LLMProvider.SYNTHETIC,
    apiKeyEnv: 'SYNTHETIC_API_KEY',
    baseURL: 'https://api.synthetic.new/anthropic',
    adapter: 'anthropic',
  },

  // ── Local (no API key required, local baseURL) ───────────────────────────
  'ollama': {
    provider: LLMProvider.OLLAMA,
    adapter: 'local',
    baseURL: process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434/v1',
  },
  'lmstudio': {
    provider: LLMProvider.LMSTUDIO,
    apiKeyEnv: 'LM_API_TOKEN',
    adapter: 'local',
    baseURL: process.env['LM_STUDIO_BASE_URL'] ?? 'http://localhost:1234/v1',
  },
  'vllm': {
    provider: LLMProvider.VLLM,
    apiKeyEnv: 'VLLM_API_KEY',
    adapter: 'local',
    baseURL: process.env['VLLM_BASE_URL'] ?? 'http://127.0.0.1:8000/v1',
  },
  'sglang': {
    provider: LLMProvider.SGLANG,
    apiKeyEnv: 'SGLANG_API_KEY',
    adapter: 'local',
    baseURL: process.env['SGLANG_BASE_URL'] ?? 'http://127.0.0.1:30000/v1',
  },
} as const;

/**
 * Resolve the ProviderConfig for a given model identifier.
 *
 * @param modelId  e.g. "google/gemini-2.5-pro", "ollama/llama3.3", "z.ai/glm-5.1"
 * @returns        Resolved ProviderConfig, or COMPAT fallback for unknown prefixes
 */
export function resolveProviderConfig(modelId: string): ProviderConfig {
  const prefix = modelId.includes('/')
    ? modelId.split('/')[0].toLowerCase()
    : modelId.toLowerCase();
  return (
    PROVIDER_CONFIG_MAP[prefix] ?? {
      provider: LLMProvider.COMPAT,
      adapter: 'openai' as const,
    }
  );
}

/**
 * Backward-compatible alias — returns only the LLMProvider enum value.
 * Prefer resolveProviderConfig() for new code.
 */
export function resolveProvider(modelId: string): LLMProvider {
  return resolveProviderConfig(modelId).provider;
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

// ─── Error types ─────────────────────────────────────────────────────────────

export class MissingApiKeyError extends Error {
  constructor(provider: LLMProvider, triedEnvVars: string[]) {
    super(
      `[llm-client] No API key found for provider '${provider}'. ` +
      `Tried env vars: ${triedEnvVars.join(', ')}. ` +
      `Set one of these env vars or OPENROUTER_API_KEY as a universal fallback.`,
    );
    this.name = 'MissingApiKeyError';
  }
}

// ─── OpenAI adapter (covers openai/* and all compat endpoints) ───────────────

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
  constructor(
    private readonly apiKey: string,
    /** Override base URL for Anthropic-compat endpoints (e.g. kimi, synthetic) */
    private readonly baseURL?: string,
  ) {}

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

    const baseURL = this.baseURL ?? 'https://api.anthropic.com';
    const url     = `${baseURL}/v1/messages`;

    const res = await fetch(url, {
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

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Strip the provider prefix from a model id: "openai/gpt-4o" → "gpt-4o" */
function stripProviderPrefix(modelId: string): string {
  const idx = modelId.indexOf('/');
  return idx === -1 ? modelId : modelId.slice(idx + 1);
}

/**
 * Resolve the API key from env vars in priority order.
 * Local adapters never throw — they return '' if no key is set.
 */
function resolveApiKey(config: ProviderConfig): string {
  // Local providers don't need a key
  if (config.adapter === 'local') {
    return config.apiKeyEnv
      ? (process.env[config.apiKeyEnv] ?? '')
      : '';
  }

  // Walk env vars in priority order
  const envVars = [
    config.apiKeyEnv,
    ...(config.apiKeyEnvAlt ?? []),
  ].filter((v): v is string => Boolean(v));

  for (const envVar of envVars) {
    const key = process.env[envVar];
    if (key) return key;
  }

  // Universal fallback: OPENROUTER routes most providers
  const fallback =
    process.env['OPENROUTER_API_KEY'] ??
    process.env['OPENAI_COMPAT_API_KEY'];
  if (fallback) return fallback;

  throw new MissingApiKeyError(config.provider, envVars);
}

// ─── buildLLMClient factory ───────────────────────────────────────────────────

/**
 * Build the correct ProviderAdapter for a given model identifier.
 *
 * Routing logic:
 *   1. Resolve config via resolveProviderConfig()
 *   2. Resolve API key (env cascade → OpenRouter fallback)
 *   3. Dispatch to correct adapter
 *
 * @param modelId  Full model id in "<provider>/<model>" format.
 * @throws         MissingApiKeyError if no API key can be resolved.
 *
 * @example
 *   buildLLMClient('google/gemini-2.5-pro')
 *   // → OpenAIAdapter(GEMINI_API_KEY, 'https://generativelanguage.googleapis.com/v1beta/openai')
 *
 *   buildLLMClient('kimi/kimi-code')
 *   // → AnthropicAdapter(KIMI_API_KEY, 'https://api.moonshot.ai/anthropic')
 *
 *   buildLLMClient('ollama/llama3.3')
 *   // → OpenAIAdapter('', 'http://127.0.0.1:11434/v1')
 */
export function buildLLMClient(modelId: string): ProviderAdapter {
  const config = resolveProviderConfig(modelId);
  const apiKey = resolveApiKey(config);

  // ── Anthropic native ──────────────────────────────────────────────────────
  if (config.provider === LLMProvider.ANTHROPIC) {
    // No baseURL override — always hits api.anthropic.com
    return new AnthropicAdapter(apiKey);
  }

  // ── Anthropic-compat (kimi, synthetic) ───────────────────────────────────
  if (config.adapter === 'anthropic') {
    return new AnthropicAdapter(apiKey, config.baseURL);
  }

  // ── OpenAI native (no baseURL override) ──────────────────────────────────
  if (
    config.provider === LLMProvider.OPENAI ||
    config.provider === LLMProvider.OPENAI_CODEX
  ) {
    return new OpenAIAdapter(apiKey);
  }

  // ── Local + all OpenAI-compat (use config.baseURL or OpenRouter fallback) ─
  const baseURL =
    config.baseURL ??
    process.env['OPENAI_COMPAT_BASE_URL'] ??
    'https://openrouter.ai/api/v1';

  const defaultHeaders: Record<string, string> = {};
  if (config.provider === LLMProvider.OPENROUTER) {
    const siteUrl  = process.env['OPENROUTER_SITE_URL'];
    const siteName = process.env['OPENROUTER_SITE_NAME'];
    if (siteUrl)  defaultHeaders['HTTP-Referer'] = siteUrl;
    if (siteName) defaultHeaders['X-Title']      = siteName;
  }

  return new OpenAIAdapter(
    apiKey,
    baseURL,
    Object.keys(defaultHeaders).length ? defaultHeaders : undefined,
  );
}
