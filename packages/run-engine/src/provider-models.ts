/**
 * Mapa estático de providers LLM → modelos disponibles.
 * Consumido por GET /api/settings/providers para poblar el selector UI.
 * El usuario también puede escribir un model ID libre si freeInput = true.
 */
export interface ProviderModelConfig {
  label:       string
  requiresKey: boolean
  keyEnv:      string | null   // coincide con variable de entorno del provider
  models:      string[]
  freeInput?:  boolean         // true = el usuario puede escribir cualquier model ID
}

export const PROVIDER_MODELS: Record<string, ProviderModelConfig> = {

  // ── OpenAI ────────────────────────────────────────────────────────────────
  openai: {
    label: 'OpenAI',
    requiresKey: true,
    keyEnv: 'OPENAI_API_KEY',
    models: [
      'openai/gpt-5.5',
      'openai/gpt-5.5-pro',
      'openai/gpt-5.4',
      'openai/gpt-5.4-pro',
      'openai/gpt-5.4-mini',
      'openai/gpt-5.4-nano',
      'openai/gpt-5-mini',
      'openai/gpt-5-nano',
      'openai/gpt-5',
      'openai/o3',
      'openai/o3-pro',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
    ],
  },

  // ── OpenAI Codex (OAuth / suscripción ChatGPT) ────────────────────────────
  'openai-codex': {
    label: 'OpenAI Codex (ChatGPT subscription)',
    requiresKey: false,
    keyEnv: 'OPENAI_API_KEY',   // fallback local
    models: [
      'openai-codex/gpt-5.3-codex',
      'openai-codex/gpt-5.5',
      'openai-codex/gpt-5.4',
      'openai-codex/gpt-5.4-mini',
    ],
  },

  // ── Anthropic ─────────────────────────────────────────────────────────────
  anthropic: {
    label: 'Anthropic',
    requiresKey: true,
    keyEnv: 'ANTHROPIC_API_KEY',
    models: [
      'anthropic/claude-opus-4.7',
      'anthropic/claude-opus-4-6',
      'anthropic/claude-sonnet-4-6',
      'anthropic/claude-haiku-3-5',
    ],
  },

  // ── Google Gemini ─────────────────────────────────────────────────────────
  google: {
    label: 'Google Gemini',
    requiresKey: true,
    keyEnv: 'GEMINI_API_KEY',
    models: [
      'google/gemini-3.1-pro',
      'google/gemini-3.1-flash',
      'google/gemini-3.1-flash-lite',
      'google/gemini-2.5-pro',
      'google/gemini-2.5-flash',
    ],
  },

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  deepseek: {
    label: 'DeepSeek',
    requiresKey: true,
    keyEnv: 'DEEPSEEK_API_KEY',
    models: [
      'deepseek/deepseek-v4-pro',
      'deepseek/deepseek-v4-flash',
      'deepseek/deepseek-v3-2',
      'deepseek/deepseek-r1',
    ],
  },

  // ── xAI (Grok) ────────────────────────────────────────────────────────────
  xai: {
    label: 'xAI (Grok)',
    requiresKey: true,
    keyEnv: 'XAI_API_KEY',
    models: [
      'xai/grok-4-20',
      'xai/grok-3',
    ],
  },

  // ── Mistral ───────────────────────────────────────────────────────────────
  mistral: {
    label: 'Mistral',
    requiresKey: true,
    keyEnv: 'MISTRAL_API_KEY',
    models: [
      'mistral/mistral-small-4',
      'mistral/mistral-large-3',
      'mistral/codestral-2501',
    ],
  },

  // ── Groq (LPU) ───────────────────────────────────────────────────────────
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

  // ── Qwen (Alibaba) ────────────────────────────────────────────────────────
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

  // ── OpenRouter (gateway 300+ modelos) ────────────────────────────────────
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

  // ── Ollama (local — sin API key) ──────────────────────────────────────────
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
    models: ['lmstudio/local-model'],
  },

  // ── Providers adicionales — input libre, sin lista fija ──────────────────
  cerebras:    { label: 'Cerebras',           requiresKey: true,  keyEnv: 'CEREBRAS_API_KEY',          models: [], freeInput: true },
  together:    { label: 'Together AI',         requiresKey: true,  keyEnv: 'TOGETHER_API_KEY',           models: [], freeInput: true },
  fireworks:   { label: 'Fireworks AI',        requiresKey: true,  keyEnv: 'FIREWORKS_API_KEY',          models: [], freeInput: true },
  nvidia:      { label: 'NVIDIA',              requiresKey: true,  keyEnv: 'NVIDIA_API_KEY',             models: [], freeInput: true },
  huggingface: { label: 'Hugging Face',        requiresKey: true,  keyEnv: 'HUGGINGFACE_HUB_TOKEN',      models: [], freeInput: true },
  deepinfra:   { label: 'DeepInfra',           requiresKey: true,  keyEnv: 'DEEPINFRA_API_KEY',          models: [], freeInput: true },
  litellm:     { label: 'LiteLLM (gateway)',   requiresKey: false, keyEnv: 'LITELLM_API_KEY',            models: [], freeInput: true },
  kilocode:    { label: 'Kilocode',            requiresKey: true,  keyEnv: 'KILOCODE_API_KEY',           models: [], freeInput: true },
  venice:      { label: 'Venice AI (privacy)', requiresKey: true,  keyEnv: 'VENICE_API_KEY',             models: [], freeInput: true },
  arcee:       { label: 'Arcee AI',            requiresKey: true,  keyEnv: 'ARCEE_API_KEY',              models: [], freeInput: true },
  chutes:      { label: 'Chutes',              requiresKey: true,  keyEnv: 'CHUTES_API_KEY',             models: [], freeInput: true },
  tencent:     { label: 'Tencent (TokenHub)',  requiresKey: true,  keyEnv: 'TENCENT_API_KEY',            models: [], freeInput: true },
  volcengine:  { label: 'Volcengine (Doubao)', requiresKey: true,  keyEnv: 'VOLCANO_ENGINE_API_KEY',     models: [], freeInput: true },
  vllm:        { label: 'vLLM (local)',        requiresKey: false, keyEnv: null,                         models: [], freeInput: true },
  sglang:      { label: 'SGLang (local)',      requiresKey: false, keyEnv: null,                         models: [], freeInput: true },
}
