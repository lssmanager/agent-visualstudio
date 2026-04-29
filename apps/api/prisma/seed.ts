/**
 * seed.ts — ProviderCatalog seed
 *
 * Pobla el catálogo estático de providers LLM.
 * Ejecutar con: npx prisma db seed
 *
 * Agrega en package.json de la API:
 *   "prisma": { "seed": "ts-node --transpile-only prisma/seed.ts" }
 */

import { PrismaClient, ProviderAuthType } from '@prisma/client'

const prisma = new PrismaClient()

// ── Helpers de capabilities ───────────────────────────────────────────────

const cap = (overrides: Partial<{
  chat: boolean
  streaming: boolean
  functionCalling: boolean
  vision: boolean
  imageGeneration: boolean
  videoGeneration: boolean
  audioTts: boolean
  audioStt: boolean
  realtimeVoice: boolean
  embeddings: boolean
  batchApi: boolean
  codeExecution: boolean
  webSearch: boolean
}>) => ({
  chat: false,
  streaming: false,
  functionCalling: false,
  vision: false,
  imageGeneration: false,
  videoGeneration: false,
  audioTts: false,
  audioStt: false,
  realtimeVoice: false,
  embeddings: false,
  batchApi: false,
  codeExecution: false,
  webSearch: false,
  ...overrides,
})

const models = (overrides: Partial<{
  primary: string
  fast: string
  smart: string
  embedding: string
  image: string
  video: string
  tts: string
  stt: string
}>) => ({ ...overrides })

// ── Catálogo ────────────────────────────────────────────────────────────────────
const PROVIDERS = [

  // ── OpenAI ──────────────────────────────────────────────────────────────
  {
    id: 'openai',
    displayName: 'OpenAI',
    description: 'Direct OpenAI Platform API (API key billing)',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://api.openai.com/v1',
    isOpenAiCompat: true,
    capabilities: cap({
      chat: true, streaming: true, functionCalling: true, vision: true,
      imageGeneration: true, videoGeneration: true,
      audioTts: true, audioStt: true, realtimeVoice: true,
      embeddings: true, batchApi: true, codeExecution: true, webSearch: true,
    }),
    defaultModels: models({
      primary: 'gpt-4o-mini', fast: 'gpt-4o-mini', smart: 'gpt-4o',
      embedding: 'text-embedding-3-small',
      image: 'gpt-image-2', video: 'sora-2',
      tts: 'gpt-4o-mini-tts', stt: 'gpt-4o-transcribe',
    }),
  },

  {
    id: 'openai-codex',
    displayName: 'OpenAI Codex (OAuth)',
    description: 'ChatGPT/Codex subscription route via OpenClaw PI runner',
    authType: ProviderAuthType.oauth,
    defaultBaseUrl: 'https://api.openai.com/v1',
    isOpenAiCompat: true,
    capabilities: cap({
      chat: true, streaming: true, functionCalling: true, vision: true,
      imageGeneration: true, codeExecution: true,
    }),
    defaultModels: models({ primary: 'gpt-5.5', fast: 'gpt-4o-mini', smart: 'gpt-5.5' }),
  },

  // ── Anthropic ───────────────────────────────────────────────────────────
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    description: 'Claude models via Anthropic API',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://api.anthropic.com',
    isOpenAiCompat: false,
    capabilities: cap({
      chat: true, streaming: true, functionCalling: true, vision: true,
      embeddings: false, batchApi: true, codeExecution: false,
    }),
    defaultModels: models({
      primary: 'claude-opus-4-6', fast: 'claude-haiku-4', smart: 'claude-opus-4-6',
    }),
  },

  // ── Google ──────────────────────────────────────────────────────────────
  {
    id: 'gemini',
    displayName: 'Google Gemini',
    description: 'Gemini models via Google AI Studio / Vertex AI',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    isOpenAiCompat: false,
    capabilities: cap({
      chat: true, streaming: true, functionCalling: true, vision: true,
      imageGeneration: true, audioTts: true, audioStt: true,
      embeddings: true, codeExecution: true, webSearch: true,
    }),
    defaultModels: models({
      primary: 'gemini-2.5-flash', fast: 'gemini-2.5-flash', smart: 'gemini-2.5-pro',
      embedding: 'text-embedding-004',
    }),
  },

  // ── DeepSeek ───────────────────────────────────────────────────────────
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    description: 'DeepSeek chat and reasoning models',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://api.deepseek.com',
    isOpenAiCompat: true,
    capabilities: cap({ chat: true, streaming: true, functionCalling: true }),
    defaultModels: models({ primary: 'deepseek-chat', fast: 'deepseek-chat', smart: 'deepseek-reasoner' }),
  },

  // ── Qwen (Alibaba ModelStudio) ──────────────────────────────────────────
  {
    id: 'qwen',
    displayName: 'Qwen (Alibaba ModelStudio)',
    description: 'Qwen models via Alibaba Cloud DashScope',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    isOpenAiCompat: true,
    capabilities: cap({
      chat: true, streaming: true, functionCalling: true, vision: true,
      imageGeneration: true, audioTts: true, audioStt: true, embeddings: true,
    }),
    defaultModels: models({
      primary: 'qwen-plus', fast: 'qwen-turbo', smart: 'qwen-max',
      embedding: 'text-embedding-v3',
    }),
  },

  // ── OpenRouter ──────────────────────────────────────────────────────────
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    description: 'Multi-provider router con fallback y cost routing',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    isOpenAiCompat: true,
    capabilities: cap({
      chat: true, streaming: true, functionCalling: true, vision: true,
      imageGeneration: true,
    }),
    defaultModels: models({
      primary: 'openai/gpt-4o-mini', fast: 'openai/gpt-4o-mini', smart: 'anthropic/claude-opus-4-6',
    }),
  },

  // ── Mistral ──────────────────────────────────────────────────────────────
  {
    id: 'mistral',
    displayName: 'Mistral AI',
    description: 'Mistral models (Mistral, Codestral, Pixtral)',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    isOpenAiCompat: true,
    capabilities: cap({
      chat: true, streaming: true, functionCalling: true, vision: true,
      audioStt: true, embeddings: true, codeExecution: true,
    }),
    defaultModels: models({
      primary: 'mistral-small-latest', fast: 'mistral-small-latest', smart: 'mistral-large-latest',
      embedding: 'mistral-embed',
    }),
  },

  // ── Groq ─────────────────────────────────────────────────────────────────
  {
    id: 'groq',
    displayName: 'Groq',
    description: 'LPU inference — ultra-fast token generation',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    isOpenAiCompat: true,
    capabilities: cap({
      chat: true, streaming: true, functionCalling: true, vision: true,
      audioStt: true,
    }),
    defaultModels: models({
      primary: 'llama-3.3-70b-versatile', fast: 'llama-3.1-8b-instant', smart: 'llama-3.3-70b-versatile',
      stt: 'whisper-large-v3',
    }),
  },

  // ── Perplexity ──────────────────────────────────────────────────────────
  {
    id: 'perplexity',
    displayName: 'Perplexity',
    description: 'Web-search-augmented LLM inference',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://api.perplexity.ai',
    isOpenAiCompat: true,
    capabilities: cap({ chat: true, streaming: true, webSearch: true }),
    defaultModels: models({ primary: 'sonar', fast: 'sonar', smart: 'sonar-pro' }),
  },

  // ── Together AI ─────────────────────────────────────────────────────────
  {
    id: 'together',
    displayName: 'Together AI',
    description: 'Open-source model hosting con GPU clusters',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://api.together.xyz/v1',
    isOpenAiCompat: true,
    capabilities: cap({
      chat: true, streaming: true, functionCalling: true, vision: true,
      imageGeneration: true, embeddings: true,
    }),
    defaultModels: models({
      primary: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      fast: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      smart: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      embedding: 'togethercomputer/m2-bert-80M-8k-retrieval',
    }),
  },

  // ── Fireworks ──────────────────────────────────────────────────────────
  {
    id: 'fireworks',
    displayName: 'Fireworks AI',
    description: 'Fast open-source inference, FireFunction models',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://api.fireworks.ai/inference/v1',
    isOpenAiCompat: true,
    capabilities: cap({
      chat: true, streaming: true, functionCalling: true, vision: true,
      imageGeneration: true, embeddings: true,
    }),
    defaultModels: models({
      primary: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
      smart: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
    }),
  },

  // ── Cerebras ──────────────────────────────────────────────────────────
  {
    id: 'cerebras',
    displayName: 'Cerebras',
    description: 'Wafer-scale AI inference — ultra baja latencia',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://api.cerebras.ai/v1',
    isOpenAiCompat: true,
    capabilities: cap({ chat: true, streaming: true, functionCalling: true }),
    defaultModels: models({ primary: 'llama3.1-8b', fast: 'llama3.1-8b', smart: 'llama3.1-70b' }),
  },

  // ── xAI (Grok) ──────────────────────────────────────────────────────────
  {
    id: 'xai',
    displayName: 'xAI (Grok)',
    description: 'Grok models via xAI API',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://api.x.ai/v1',
    isOpenAiCompat: true,
    capabilities: cap({
      chat: true, streaming: true, functionCalling: true, vision: true,
      webSearch: true,
    }),
    defaultModels: models({
      primary: 'grok-3-mini', fast: 'grok-3-mini', smart: 'grok-3',
    }),
  },

  // ── Amazon Bedrock ──────────────────────────────────────────────────────
  {
    id: 'bedrock',
    displayName: 'Amazon Bedrock',
    description: 'Fully managed multi-model service en AWS (SigV4 auth)',
    authType: ProviderAuthType.aws_credentials,
    defaultBaseUrl: null,  // region-dependent: https://bedrock-runtime.{region}.amazonaws.com
    isOpenAiCompat: false,
    capabilities: cap({
      chat: true, streaming: true, functionCalling: true, vision: true,
      imageGeneration: true, embeddings: true,
    }),
    defaultModels: models({
      primary: 'anthropic.claude-3-5-haiku-20241022-v1:0',
      smart: 'anthropic.claude-opus-4-5-20250514-v1:0',
    }),
  },

  // ── Azure OpenAI ────────────────────────────────────────────────────────
  {
    id: 'azure-openai',
    displayName: 'Azure OpenAI',
    description: 'OpenAI models en Azure (api-key header + deployment URLs)',
    authType: ProviderAuthType.azure_api_key,
    defaultBaseUrl: null,  // override obligatorio: https://{resource}.openai.azure.com
    isOpenAiCompat: false,  // request shape diffírente (deployment path, api-key header)
    capabilities: cap({
      chat: true, streaming: true, functionCalling: true, vision: true,
      imageGeneration: true, audioTts: true, audioStt: true, realtimeVoice: true,
      embeddings: true,
    }),
    defaultModels: models({ primary: 'gpt-4o-mini', smart: 'gpt-4o' }),
  },

  // ── GitHub Copilot ──────────────────────────────────────────────────────
  {
    id: 'copilot',
    displayName: 'GitHub Copilot',
    description: 'Multi-model access via GitHub Copilot subscription OAuth',
    authType: ProviderAuthType.oauth,
    defaultBaseUrl: 'https://api.githubcopilot.com',
    isOpenAiCompat: true,
    capabilities: cap({
      chat: true, streaming: true, functionCalling: true, vision: true,
    }),
    defaultModels: models({ primary: 'gpt-4o', fast: 'gpt-4o-mini', smart: 'claude-opus-4-6' }),
  },

  // ── LiteLLM ──────────────────────────────────────────────────────────────
  {
    id: 'litellm',
    displayName: 'LiteLLM',
    description: 'Gateway unificado OpenAI-compatible para 100+ providers',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: null,  // URL del gateway self-hosted
    isOpenAiCompat: true,
    capabilities: cap({ chat: true, streaming: true, functionCalling: true }),
    defaultModels: models({ primary: 'gpt-4o-mini' }),
  },

  // ── Proveedores Locales ───────────────────────────────────────────────
  {
    id: 'ollama',
    displayName: 'Ollama',
    description: 'Modelos locales via Ollama (cloud + local)',
    authType: ProviderAuthType.none,
    defaultBaseUrl: 'http://localhost:11434/v1',
    isOpenAiCompat: true,
    isLocalOnly: true,
    capabilities: cap({ chat: true, streaming: true, functionCalling: true, vision: true, embeddings: true }),
    defaultModels: models({ primary: 'llama3.2', fast: 'llama3.2', smart: 'llama3.3:70b' }),
  },

  {
    id: 'lmstudio',
    displayName: 'LM Studio',
    description: 'Modelos locales via LM Studio OpenAI-compatible server',
    authType: ProviderAuthType.none,
    defaultBaseUrl: 'http://localhost:1234/v1',
    isOpenAiCompat: true,
    isLocalOnly: true,
    capabilities: cap({ chat: true, streaming: true, functionCalling: true, vision: true }),
    defaultModels: models({ primary: 'local-model' }),
  },

  {
    id: 'vllm',
    displayName: 'vLLM',
    description: 'High-throughput LLM serving engine (local o cloud)',
    authType: ProviderAuthType.none,
    defaultBaseUrl: 'http://localhost:8000/v1',
    isOpenAiCompat: true,
    isLocalOnly: true,
    capabilities: cap({ chat: true, streaming: true, functionCalling: true, vision: true, embeddings: true }),
    defaultModels: models({ primary: 'meta-llama/Llama-3.1-8B-Instruct' }),
  },

  {
    id: 'sglang',
    displayName: 'SGLang',
    description: 'High-performance LLM serving con FlashInfer (local)',
    authType: ProviderAuthType.none,
    defaultBaseUrl: 'http://localhost:30000/v1',
    isOpenAiCompat: true,
    isLocalOnly: true,
    capabilities: cap({ chat: true, streaming: true, functionCalling: true }),
    defaultModels: models({ primary: 'meta-llama/Llama-3.1-8B-Instruct' }),
  },

  // ── Otros providers cloud relevantes ─────────────────────────────────
  {
    id: 'nvidia',
    displayName: 'NVIDIA NIM',
    description: 'NVIDIA Inference Microservices — modelos optimizados en GPU',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    isOpenAiCompat: true,
    capabilities: cap({ chat: true, streaming: true, functionCalling: true, vision: true, embeddings: true }),
    defaultModels: models({
      primary: 'meta/llama-3.1-8b-instruct',
      smart: 'meta/llama-3.1-70b-instruct',
      embedding: 'nvidia/nv-embedqa-e5-v5',
    }),
  },

  {
    id: 'moonshot',
    displayName: 'Moonshot AI (Kimi)',
    description: 'Kimi models con context window extendido',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    isOpenAiCompat: true,
    capabilities: cap({ chat: true, streaming: true, functionCalling: true, vision: true }),
    defaultModels: models({ primary: 'moonshot-v1-8k', smart: 'moonshot-v1-128k' }),
  },

  {
    id: 'venice',
    displayName: 'Venice AI',
    description: 'Privacy-focused LLM inference — sin logging de prompts',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://api.venice.ai/api/v1',
    isOpenAiCompat: true,
    capabilities: cap({ chat: true, streaming: true, functionCalling: true, imageGeneration: true }),
    defaultModels: models({ primary: 'llama-3.3-70b', smart: 'llama-3.1-405b' }),
  },

  {
    id: 'huggingface',
    displayName: 'Hugging Face Inference',
    description: 'Inference API de Hugging Face (serverless + endpoints)',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: 'https://api-inference.huggingface.co/v1',
    isOpenAiCompat: true,
    capabilities: cap({ chat: true, streaming: true, functionCalling: true, vision: true, embeddings: true }),
    defaultModels: models({ primary: 'meta-llama/Llama-3.1-8B-Instruct' }),
  },

  {
    id: 'cloudflare',
    displayName: 'Cloudflare AI Gateway',
    description: 'Proxy unificado con analytics, caching y fallback',
    authType: ProviderAuthType.api_key,
    defaultBaseUrl: null,  // https://gateway.ai.cloudflare.com/v1/{account}/{gateway}
    isOpenAiCompat: true,
    capabilities: cap({ chat: true, streaming: true, functionCalling: true }),
    defaultModels: models({ primary: 'gpt-4o-mini' }),
  },

] as const

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌱 Seeding ProviderCatalog...')

  for (const p of PROVIDERS) {
    const { id, ...data } = p
    await prisma.providerCatalog.upsert({
      where:  { id },
      update: {
        ...data,
        capabilities:  data.capabilities  as object,
        defaultModels: data.defaultModels as object,
      },
      create: {
        id,
        ...data,
        capabilities:  data.capabilities  as object,
        defaultModels: data.defaultModels as object,
        isLocalOnly:   (data as any).isLocalOnly  ?? false,
        isOpenAiCompat:(data as any).isOpenAiCompat ?? false,
      },
    })
    console.log(`  ✓ ${id.padEnd(20)} ${data.displayName}`)
  }

  console.log(`\n✅ ${PROVIDERS.length} providers seeded.\n`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
