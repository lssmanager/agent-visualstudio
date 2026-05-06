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
 *   - LlmResponse            — alias of ChatCompletionResult (for llm-step-executor)
 *   - ToolCallRequest        — alias of ToolCall (for tool-call routing)
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
 *   1. configOverride[envVar]      ← SystemConfig from Settings UI (if opts passed)
 *   2. process.env[envVar]         ← fallback for dev local and CI
 *   3. OPENROUTER_API_KEY          (universal fallback)
 *   4. OPENAI_COMPAT_API_KEY       (legacy fallback)
 *   Local providers (adapter='local') never throw on missing key.
 *
 * Passing opts is OPTIONAL — buildLLMClient('openai/gpt-4.1') still works
 * exactly as before (reads process.env). This guarantees zero breaking change
 * for existing tests and CLI usage.
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
  PERPLEXITY      = 'perplexity',
  GROQ            = 'groq',
  TOGETHER        = 'together',
  FIREWORKS       = 'fireworks',
  NVIDIA          = 'nvidia',
  DEEPINFRA       = 'deepinfra',
  CEREBRAS        = 'cerebras',
  HUGGINGFACE     = 'huggingface',
  KILOCODE        = 'kilocode',
  VENICE          = 'venice',
  ARCEE           = 'arcee',
  CHUTES          = 'chutes',
  TENCENT         = 'tencent',
  VOLCENGINE      = 'volcengine',

  // Moonshot / Kimi — Anthropic-compat
  KIMI            = 'kimi',

  // OpenAI Codex — OAuth
  OPENAI_CODEX    = 'openai-codex',

  // Local / self-hosted
  OLLAMA          = 'ollama',
  LM_STUDIO       = 'lmstudio',
  VLLM            = 'vllm',
  SGLANG          = 'sglang',
  LITELLM         = 'litellm',

  // Generic OpenAI-compat (no dedicated provider)
  COMPAT          = 'compat',
}

// ─── Adapter types ────────────────────────────────────────────────────────────

export type AdapterType = 'openai' | 'anthropic' | 'google' | 'local'

export interface ProviderConfig {
  provider:       LLMProvider
  adapter:        AdapterType
  apiKeyEnv:      string | null
  apiKeyEnvAlt?:  string[]
  baseURL?:       string
}

// ─── LLMClientOptions — configOverride support ───────────────────────────────

/**
 * Optional options for buildLLMClient.
 *
 * Pass `configOverride` to inject keys loaded from SystemConfig (Settings UI).
 * Omitting opts entirely preserves the original process.env-only behaviour,
 * so all existing tests and CLI usage are unaffected.
 *
 * Usage in production:
 *   const config = await systemConfigService.getAll()
 *   buildLLMClient('openai/gpt-4.1', { configOverride: config })
 *
 * Usage in tests / CLI (no change):
 *   buildLLMClient('openai/gpt-4.1')
 */
export interface LLMClientOptions {
  configOverride?: Record<string, string>
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class MissingApiKeyError extends Error {
  constructor(provider: LLMProvider, envVars: string[]) {
    super(
      `No API key found for provider "${provider}". ` +
      `Tried env vars: ${envVars.join(', ')}. ` +
      `Set one in Settings UI or as a process.env variable.`
    )
    this.name = 'MissingApiKeyError'
  }
}

export class UnknownProviderError extends Error {
  constructor(modelId: string) {
    super(`Cannot resolve provider from model ID "${modelId}"`)
    this.name = 'UnknownProviderError'
  }
}

// ─── Provider Adapter interface ──────────────────────────────────────────────

export interface ChatMessage {
  role:    'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  name?:         string
  /** Present on assistant messages that contain tool invocations */
  tool_calls?:   ToolCall[]
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name:        string
    description: string
    parameters:  Record<string, unknown>
  }
}

export interface ToolCall {
  id:       string
  type:     'function'
  function: { name: string; arguments: string }
}

export interface ChatCompletionOptions {
  model:        string
  temperature?: number
  maxTokens?:   number
  tools?:       ToolDefinition[]
  toolChoice?:  'auto' | 'none' | 'required'
}

export interface ChatCompletionResult {
  content:    string | null
  toolCalls?: ToolCall[]
  usage?: {
    promptTokens:     number
    completionTokens: number
    totalTokens:      number
  }
  model: string
}

/**
 * LlmResponse — semantic alias of ChatCompletionResult.
 * Used by llm-step-executor and agent-executor to type
 * the raw response before post-processing.
 */
export type LlmResponse = ChatCompletionResult

/**
 * ToolCallRequest — semantic alias of ToolCall.
 * Represents a single tool invocation requested by the LLM,
 * used in the tool-call routing layer of llm-step-executor.
 */
export type ToolCallRequest = ToolCall

export interface ProviderAdapter {
  chat(
    messages: ChatMessage[],
    tools:    ToolDefinition[],
    opts:     ChatCompletionOptions,
  ): Promise<ChatCompletionResult>
}

// ─── PROVIDER_CONFIG_MAP ─────────────────────────────────────────────────────
// Maps model-prefix (provider key) → ProviderConfig.
// DO NOT modify the enum values or add new entries here —
// use PROVIDER_MODELS in provider-models.ts for UI metadata.

export const PROVIDER_CONFIG_MAP: Record<string, ProviderConfig> = {
  openai: {
    provider:      LLMProvider.OPENAI,
    adapter:       'openai',
    apiKeyEnv:     'OPENAI_API_KEY',
  },
  'openai-codex': {
    provider:      LLMProvider.OPENAI_CODEX,
    adapter:       'openai',
    apiKeyEnv:     null,   // OAuth — no billing key
    baseURL:       'https://api.openai.com/v1',
  },
  anthropic: {
    provider:      LLMProvider.ANTHROPIC,
    adapter:       'anthropic',
    apiKeyEnv:     'ANTHROPIC_API_KEY',
  },
  google: {
    provider:      LLMProvider.GOOGLE,
    adapter:       'openai',
    apiKeyEnv:     'GEMINI_API_KEY',
    apiKeyEnvAlt:  ['GOOGLE_API_KEY'],
    baseURL:       'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  xai: {
    provider:      LLMProvider.XAI,
    adapter:       'openai',
    apiKeyEnv:     'XAI_API_KEY',
    baseURL:       'https://api.x.ai/v1',
  },
  deepseek: {
    provider:      LLMProvider.DEEPSEEK,
    adapter:       'openai',
    apiKeyEnv:     'DEEPSEEK_API_KEY',
    baseURL:       'https://api.deepseek.com/v1',
  },
  qwen: {
    provider:      LLMProvider.QWEN,
    adapter:       'openai',
    apiKeyEnv:     'QWEN_API_KEY',
    apiKeyEnvAlt:  ['DASHSCOPE_API_KEY'],
    baseURL:       'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  mistral: {
    provider:      LLMProvider.MISTRAL,
    adapter:       'openai',
    apiKeyEnv:     'MISTRAL_API_KEY',
    baseURL:       'https://api.mistral.ai/v1',
  },
  perplexity: {
    provider:      LLMProvider.PERPLEXITY,
    adapter:       'openai',
    apiKeyEnv:     'PERPLEXITY_API_KEY',
    baseURL:       'https://api.perplexity.ai',
  },
  groq: {
    provider:      LLMProvider.GROQ,
    adapter:       'openai',
    apiKeyEnv:     'GROQ_API_KEY',
    baseURL:       'https://api.groq.com/openai/v1',
  },
  together: {
    provider:      LLMProvider.TOGETHER,
    adapter:       'openai',
    apiKeyEnv:     'TOGETHER_API_KEY',
    baseURL:       'https://api.together.xyz/v1',
  },
  fireworks: {
    provider:      LLMProvider.FIREWORKS,
    adapter:       'openai',
    apiKeyEnv:     'FIREWORKS_API_KEY',
    baseURL:       'https://api.fireworks.ai/inference/v1',
  },
  nvidia: {
    provider:      LLMProvider.NVIDIA,
    adapter:       'openai',
    apiKeyEnv:     'NVIDIA_API_KEY',
    baseURL:       'https://integrate.api.nvidia.com/v1',
  },
  deepinfra: {
    provider:      LLMProvider.DEEPINFRA,
    adapter:       'openai',
    apiKeyEnv:     'DEEPINFRA_API_KEY',
    baseURL:       'https://api.deepinfra.com/v1/openai',
  },
  cerebras: {
    provider:      LLMProvider.CEREBRAS,
    adapter:       'openai',
    apiKeyEnv:     'CEREBRAS_API_KEY',
    baseURL:       'https://api.cerebras.ai/v1',
  },
  huggingface: {
    provider:      LLMProvider.HUGGINGFACE,
    adapter:       'openai',
    apiKeyEnv:     'HUGGINGFACE_HUB_TOKEN',
    baseURL:       'https://api-inference.huggingface.co/v1',
  },
  kilocode: {
    provider:      LLMProvider.KILOCODE,
    adapter:       'openai',
    apiKeyEnv:     'KILOCODE_API_KEY',
    baseURL:       'https://api.kilocode.ai/v1',
  },
  venice: {
    provider:      LLMProvider.VENICE,
    adapter:       'openai',
    apiKeyEnv:     'VENICE_API_KEY',
    baseURL:       'https://api.venice.ai/api/v1',
  },
  arcee: {
    provider:      LLMProvider.ARCEE,
    adapter:       'openai',
    apiKeyEnv:     'ARCEE_API_KEY',
    baseURL:       'https://conductor.arcee.ai/v1',
  },
  chutes: {
    provider:      LLMProvider.CHUTES,
    adapter:       'openai',
    apiKeyEnv:     'CHUTES_API_KEY',
    baseURL:       'https://llm.chutes.ai/v1',
  },
  tencent: {
    provider:      LLMProvider.TENCENT,
    adapter:       'openai',
    apiKeyEnv:     'TENCENT_API_KEY',
    baseURL:       'https://api.lkeap.cloud.tencent.com/v1',
  },
  volcengine: {
    provider:      LLMProvider.VOLCENGINE,
    adapter:       'openai',
    apiKeyEnv:     'VOLCANO_ENGINE_API_KEY',
    baseURL:       'https://ark.cn-beijing.volces.com/api/v3',
  },
  kimi: {
    provider:      LLMProvider.KIMI,
    adapter:       'anthropic',
    apiKeyEnv:     'KIMI_API_KEY',
    baseURL:       'https://api.moonshot.cn/v1',
  },
  openrouter: {
    provider:      LLMProvider.OPENROUTER,
    adapter:       'openai',
    apiKeyEnv:     'OPENROUTER_API_KEY',
    baseURL:       'https://openrouter.ai/api/v1',
  },
  ollama: {
    provider:      LLMProvider.OLLAMA,
    adapter:       'local',
    apiKeyEnv:     null,
    baseURL:       process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434/v1',
  },
  lmstudio: {
    provider:      LLMProvider.LM_STUDIO,
    adapter:       'local',
    apiKeyEnv:     null,
    baseURL:       process.env['LMSTUDIO_BASE_URL'] ?? 'http://localhost:1234/v1',
  },
  vllm: {
    provider:      LLMProvider.VLLM,
    adapter:       'local',
    apiKeyEnv:     null,
    baseURL:       process.env['VLLM_BASE_URL'] ?? 'http://localhost:8000/v1',
  },
  sglang: {
    provider:      LLMProvider.SGLANG,
    adapter:       'local',
    apiKeyEnv:     null,
    baseURL:       process.env['SGLANG_BASE_URL'] ?? 'http://localhost:30000/v1',
  },
  litellm: {
    provider:      LLMProvider.LITELLM,
    adapter:       'openai',
    apiKeyEnv:     'LITELLM_API_KEY',
    baseURL:       process.env['LITELLM_BASE_URL'] ?? 'http://localhost:4000',
  },
  compat: {
    provider:      LLMProvider.COMPAT,
    adapter:       'openai',
    apiKeyEnv:     'OPENAI_COMPAT_API_KEY',
    apiKeyEnvAlt:  ['OPENAI_API_KEY'],
    baseURL:       process.env['OPENAI_COMPAT_BASE_URL'] ?? 'http://localhost:11434/v1',
  },
}

// ─── resolveProviderConfig ────────────────────────────────────────────────────

export function resolveProviderConfig(modelId: string): ProviderConfig {
  const prefix = modelId.split('/')[0]
  const config = PROVIDER_CONFIG_MAP[prefix]
  if (!config) {
    // Fall through to OpenRouter / compat for unknown prefixes
    return PROVIDER_CONFIG_MAP['openrouter']
  }
  return config
}

/** Backward-compat alias — returns just the LLMProvider enum value. */
export function resolveProvider(modelId: string): LLMProvider {
  return resolveProviderConfig(modelId).provider
}

// ─── resolveApiKey ────────────────────────────────────────────────────────────

/**
 * Resolves the API key for a given ProviderConfig.
 *
 * Priority:
 *   1. configOverride[envVar]  — values from SystemConfig (Settings UI)
 *   2. process.env[envVar]     — local dev / CI fallback
 *   3. Universal fallbacks     — OPENROUTER_API_KEY, OPENAI_COMPAT_API_KEY
 *   4. Throws MissingApiKeyError if nothing found (except local providers)
 *
 * @param config         ProviderConfig from PROVIDER_CONFIG_MAP
 * @param configOverride Optional flat object from SystemConfigService.getAll()
 */
function resolveApiKey(
  config: ProviderConfig,
  configOverride?: Record<string, string>,
): string {
  // Local providers (Ollama, LM Studio, vLLM, SGLang) never need a key
  if (config.adapter === 'local') {
    if (!config.apiKeyEnv) return ''
    return (
      configOverride?.[config.apiKeyEnv] ??
      process.env[config.apiKeyEnv]      ??
      ''
    )
  }

  // OAuth providers (openai-codex) have no key requirement
  if (config.apiKeyEnv === null) return ''

  // Build the ordered list of env var names to check
  const envVars: string[] = [
    config.apiKeyEnv,
    ...(config.apiKeyEnvAlt ?? []),
  ].filter((v): v is string => Boolean(v))

  // 1. configOverride first, then process.env
  for (const envVar of envVars) {
    const key = configOverride?.[envVar] ?? process.env[envVar]
    if (key) return key
  }

  // 2. Universal fallbacks
  const universalFallback =
    configOverride?.['OPENROUTER_API_KEY']    ??
    process.env['OPENROUTER_API_KEY']         ??
    configOverride?.['OPENAI_COMPAT_API_KEY'] ??
    process.env['OPENAI_COMPAT_API_KEY']

  if (universalFallback) return universalFallback

  throw new MissingApiKeyError(config.provider, envVars)
}

// ─── Adapter implementations ─────────────────────────────────────────────────

class OpenAIAdapter implements ProviderAdapter {
  constructor(
    private readonly apiKey:  string,
    private readonly baseURL: string,
  ) {}

  async chat(
    messages: ChatMessage[],
    tools:    ToolDefinition[],
    opts:     ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const body: Record<string, unknown> = {
      model:       opts.model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens:  opts.maxTokens  ?? 4096,
    }
    if (tools.length > 0) {
      body['tools']       = tools
      body['tool_choice'] = opts.toolChoice ?? 'auto'
    }

    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`OpenAI API error ${res.status}: ${text}`)
    }

    const data = await res.json() as {
      choices: Array<{
        message: {
          content:    string | null
          tool_calls?: ToolCall[]
        }
      }>
      usage?: {
        prompt_tokens:     number
        completion_tokens: number
        total_tokens:      number
      }
      model: string
    }

    const choice = data.choices[0]
    return {
      content:   choice.message.content,
      toolCalls: choice.message.tool_calls,
      usage:     data.usage
        ? {
            promptTokens:     data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens:      data.usage.total_tokens,
          }
        : undefined,
      model: data.model ?? opts.model,
    }
  }
}

class AnthropicAdapter implements ProviderAdapter {
  constructor(
    private readonly apiKey:  string,
    private readonly baseURL: string,
  ) {}

  async chat(
    messages: ChatMessage[],
    tools:    ToolDefinition[],
    opts:     ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const systemMessages = messages.filter(m => m.role === 'system')
    const userMessages   = messages.filter(m => m.role !== 'system')
    const system         = systemMessages.map(m => m.content).join('\n') || undefined

    const body: Record<string, unknown> = {
      model:      opts.model,
      messages:   userMessages,
      max_tokens: opts.maxTokens ?? 4096,
      system,
    }
    if (tools.length > 0) {
      body['tools'] = tools.map(t => ({
        name:         t.function.name,
        description:  t.function.description,
        input_schema: t.function.parameters,
      }))
    }

    const url = this.baseURL
      ? `${this.baseURL}/messages`
      : 'https://api.anthropic.com/v1/messages'

    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Anthropic API error ${res.status}: ${text}`)
    }

    const data = await res.json() as {
      content: Array<{
        type:  string
        text?: string
        id?:   string
        name?: string
        input?: Record<string, unknown>
      }>
      usage?: { input_tokens: number; output_tokens: number }
      model:  string
    }

    const textBlock  = data.content.find(b => b.type === 'text')
    const toolBlocks = data.content.filter(b => b.type === 'tool_use')

    const toolCalls: ToolCall[] = toolBlocks.map(b => ({
      id:       b.id ?? '',
      type:     'function' as const,
      function: {
        name:      b.name ?? '',
        arguments: JSON.stringify(b.input ?? {}),
      },
    }))

    return {
      content:   textBlock?.text ?? null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage:     data.usage
        ? {
            promptTokens:     data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens:      data.usage.input_tokens + data.usage.output_tokens,
          }
        : undefined,
      model: data.model ?? opts.model,
    }
  }
}

// ─── buildLLMClient ───────────────────────────────────────────────────────────

/**
 * Factory that returns the correct ProviderAdapter for a given model ID.
 *
 * @param modelId  Canonical model ID, e.g. 'openai/gpt-4.1'
 * @param opts     Optional. Pass `{ configOverride: await systemConfigService.getAll() }`
 *                 in production to read keys from SystemConfig (Settings UI).
 *                 Omit entirely in tests / CLI — falls back to process.env.
 */
export function buildLLMClient(
  modelId: string,
  opts?:   LLMClientOptions,
): ProviderAdapter {
  const config = resolveProviderConfig(modelId)
  const apiKey = resolveApiKey(config, opts?.configOverride)
  const baseURL = config.baseURL ?? ''

  switch (config.adapter) {
    case 'anthropic':
      return new AnthropicAdapter(apiKey, baseURL)

    case 'openai':
    case 'local':
    default:
      return new OpenAIAdapter(
        apiKey || 'ollama',  // local adapters pass a dummy key
        baseURL || 'https://api.openai.com/v1',
      )
  }
}
