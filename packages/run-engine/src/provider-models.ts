/**
 * provider-models.ts
 *
 * Static map of provider → model list for Settings UI.
 * Used by GET /api/settings/providers to populate the frontend selector.
 * The user can also type a free model ID (freeInput: true providers).
 *
 * Model IDs follow the canonical format: 'provider/model-name'
 * Sources: OpenClaw docs, provider release notes — April 2026
 *
 * DO NOT modify LLMProvider enum or PROVIDER_CONFIG_MAP in llm-client.ts.
 * This file is purely additive metadata for the Settings UI.
 */

export interface ProviderModelEntry {
  /** Human-readable provider name shown in Settings UI */
  label: string
  /** Whether an API key is required to use this provider */
  requiresKey: boolean
  /** Env var name — matches PROVIDER_CONFIG_MAP in llm-client.ts */
  keyEnv: string | null
  /** Pre-populated model list shown in the model selector */
  models: string[]
  /**
   * If true, show a free-text input so the user can type any model ID.
   * Used for gateways (OpenRouter) and local providers (Ollama, LM Studio).
   */
  freeInput?: boolean
}

export const PROVIDER_MODELS: Record<string, ProviderModelEntry> = {

  // ── OpenAI (API key de pago) ──────────────────────────────────────────────
  openai: {
    label: 'OpenAI',
    requiresKey: true,
    keyEnv: 'OPENAI_API_KEY',
    models: [
      // ── Frontier — recomendados para agentes
      'openai/gpt-5.5',           // flagship actual — abril 2026
      'openai/gpt-5.5-pro',       // más compute, respuestas más precisas
      'openai/gpt-5.4',           // coding + professional work
      'openai/gpt-5.4-pro',       // variante pro de gpt-5.4
      'openai/gpt-5.4-mini',      // coding + computer use + subagents
      'openai/gpt-5.4-nano',      // tareas simples, alto volumen, bajo costo
      'openai/gpt-5-mini',        // near-frontier, bajo costo, baja latencia
      'openai/gpt-5-nano',        // más rápido y económico de la familia GPT-5
      'openai/gpt-5',             // razonamiento configurable
      // ── Razonamiento — activos en API
      'openai/o3',                // reasoning complejo
      'openai/o3-pro',            // o3 con más compute
      // ── Open-weight (Apache 2.0 — deploy propio)
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
    ],
  },

  // ── OpenAI Codex (suscripción ChatGPT — OAuth, sin billing por token) ─────
  'openai-codex': {
    label: 'OpenAI Codex',
    requiresKey: false,           // OAuth — NO API key de pago
    keyEnv: null,
    models: [
      'openai-codex/gpt-5.3-codex', // MÁS CAPAZ — agentic coding actual
      'openai-codex/gpt-5.5',
      'openai-codex/gpt-5.4',
      'openai-codex/gpt-5.4-mini',
    ],
  },

  // ── Anthropic ─────────────────────────────────────────────────────────────
  // Opus 4.7 GA el 22 abril 2026, Sonnet 4.6 sigue como default de velocidad
  anthropic: {
    label: 'Anthropic',
    requiresKey: true,
    keyEnv: 'ANTHROPIC_API_KEY',
    models: [
      'anthropic/claude-opus-4-7',    // flagship abril 2026 — agentes complejos
      'anthropic/claude-opus-4-6',    // default docs OpenClaw — adaptive thinking
      'anthropic/claude-sonnet-4-6',  // velocidad / diario
      'anthropic/claude-haiku-3-5',   // económico / baja latencia
    ],
  },

  // ── Google Gemini ─────────────────────────────────────────────────────────
  // Gemini 3.1 Pro lideró benchmarks de razonamiento en marzo 2026
  google: {
    label: 'Google Gemini',
    requiresKey: true,
    keyEnv: 'GEMINI_API_KEY',
    models: [
      'google/gemini-3.1-pro',         // flagship multimodal marzo 2026
      'google/gemini-3.1-flash',       // velocidad + costo
      'google/gemini-3.1-flash-lite',  // ultra económico
      'google/gemini-2.5-pro',         // stable — aún ampliamente usado
      'google/gemini-2.5-flash',       // stable económico
    ],
  },

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  // V4 preview lanzado 24 abril 2026 con contexto 1M tokens
  deepseek: {
    label: 'DeepSeek',
    requiresKey: true,
    keyEnv: 'DEEPSEEK_API_KEY',
    models: [
      'deepseek/deepseek-v4-pro',   // flagship — 1.6T params MoE
      'deepseek/deepseek-v4-flash', // económico — 284B params MoE
      'deepseek/deepseek-v3-2',     // stable anterior
      'deepseek/deepseek-r1',       // razonamiento — aún activo
    ],
  },

  // ── xAI (Grok) ────────────────────────────────────────────────────────────
  xai: {
    label: 'xAI (Grok)',
    requiresKey: true,
    keyEnv: 'XAI_API_KEY',
    models: [
      'xai/grok-4-20',  // real-time data + multi-agent
      'xai/grok-3',     // stable anterior
    ],
  },

  // ── Mistral ───────────────────────────────────────────────────────────────
  mistral: {
    label: 'Mistral',
    requiresKey: true,
    keyEnv: 'MISTRAL_API_KEY',
    models: [
      'mistral/mistral-small-4',   // lanzado marzo 2026
      'mistral/mistral-large-3',   // flagship anterior
      'mistral/codestral-2501',    // código
    ],
  },

  // ── Groq (LPU — inferencia rápida) ───────────────────────────────────────
  groq: {
    label: 'Groq',
    requiresKey: true,
    keyEnv: 'GROQ_API_KEY',
    models: [
      'groq/llama-3.3-70b-versatile',
      'groq/deepseek-r1-distill-llama-70b',
      'groq/gemma2-9b-it',
    ],
  },

  // ── Qwen (Alibaba Model Studio) ──────────────────────────────────────────
  qwen: {
    label: 'Qwen (Alibaba)',
    requiresKey: true,
    keyEnv: 'QWEN_API_KEY',
    models: [
      'qwen/qwen-max',
      'qwen/qwen-plus',
      'qwen/qwen-turbo',
      'qwen/qwen2.5-coder-32b-instruct',
    ],
  },

  // ── OpenRouter (gateway — acceso a 300+ modelos) ─────────────────────────
  openrouter: {
    label: 'OpenRouter',
    requiresKey: true,
    keyEnv: 'OPENROUTER_API_KEY',
    freeInput: true,
    models: [
      'openrouter/auto',
      'openrouter/anthropic/claude-opus-4-6',
      'openrouter/openai/gpt-5.5',
      'openrouter/deepseek/deepseek-v4-pro',
      'openrouter/google/gemini-3.1-pro',
    ],
  },

  // ── Perplexity (búsqueda web integrada) ──────────────────────────────────
  perplexity: {
    label: 'Perplexity (web search)',
    requiresKey: true,
    keyEnv: 'PERPLEXITY_API_KEY',
    models: [
      'perplexity/sonar-pro',
      'perplexity/sonar',
      'perplexity/sonar-reasoning-pro',
    ],
  },

  // ── Moonshot / Kimi ───────────────────────────────────────────────────────
  kimi: {
    label: 'Moonshot AI (Kimi)',
    requiresKey: true,
    keyEnv: 'KIMI_API_KEY',
    models: [
      'kimi/kimi-k2',
      'kimi/kimi-k1.5',
      'kimi/moonshot-v1-128k',
    ],
  },

  // ── Ollama (local — sin API key) ─────────────────────────────────────────
  ollama: {
    label: 'Ollama (local)',
    requiresKey: false,
    keyEnv: null,
    freeInput: true,
    models: [
      'ollama/llama3.3',
      'ollama/qwen2.5-coder',
      'ollama/deepseek-r1',
      'ollama/gemma3',
      'ollama/phi4',
    ],
  },

  // ── LM Studio (local) ────────────────────────────────────────────────────
  lmstudio: {
    label: 'LM Studio (local)',
    requiresKey: false,
    keyEnv: null,
    freeInput: true,
    models: [
      'lmstudio/local-model',
    ],
  },

  // ── Providers adicionales — input libre sin lista fija ───────────────────
  cerebras:    { label: 'Cerebras',            requiresKey: true,  keyEnv: 'CEREBRAS_API_KEY',         models: [], freeInput: true },
  together:    { label: 'Together AI',          requiresKey: true,  keyEnv: 'TOGETHER_API_KEY',         models: [], freeInput: true },
  fireworks:   { label: 'Fireworks AI',         requiresKey: true,  keyEnv: 'FIREWORKS_API_KEY',        models: [], freeInput: true },
  nvidia:      { label: 'NVIDIA',               requiresKey: true,  keyEnv: 'NVIDIA_API_KEY',           models: [], freeInput: true },
  huggingface: { label: 'Hugging Face',         requiresKey: true,  keyEnv: 'HUGGINGFACE_HUB_TOKEN',    models: [], freeInput: true },
  deepinfra:   { label: 'DeepInfra',            requiresKey: true,  keyEnv: 'DEEPINFRA_API_KEY',        models: [], freeInput: true },
  litellm:     { label: 'LiteLLM (gateway)',    requiresKey: false, keyEnv: 'LITELLM_API_KEY',          models: [], freeInput: true },
  kilocode:    { label: 'Kilocode',             requiresKey: true,  keyEnv: 'KILOCODE_API_KEY',         models: [], freeInput: true },
  venice:      { label: 'Venice AI (privacy)',  requiresKey: true,  keyEnv: 'VENICE_API_KEY',           models: [], freeInput: true },
  arcee:       { label: 'Arcee AI',             requiresKey: true,  keyEnv: 'ARCEE_API_KEY',            models: [], freeInput: true },
  chutes:      { label: 'Chutes',               requiresKey: true,  keyEnv: 'CHUTES_API_KEY',           models: [], freeInput: true },
  tencent:     { label: 'Tencent (TokenHub)',   requiresKey: true,  keyEnv: 'TENCENT_API_KEY',          models: [], freeInput: true },
  volcengine:  { label: 'Volcengine (Doubao)',  requiresKey: true,  keyEnv: 'VOLCANO_ENGINE_API_KEY',   models: [], freeInput: true },
  vllm:        { label: 'vLLM (local)',         requiresKey: false, keyEnv: null,                       models: [], freeInput: true },
  sglang:      { label: 'SGLang (local)',       requiresKey: false, keyEnv: null,                       models: [], freeInput: true },
}
