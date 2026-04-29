/**
 * ModelCapabilityRegistry
 *
 * Catálogo SEED de capacidades por modelo.
 * Este registro ya NO es la fuente de verdad en runtime — ese rol lo tiene
 * ModelCatalogEntry (DB). Su función ahora es actuar como fuente SECUNDARIA
 * de enrichment cuando el proveedor no devuelve metadata de families.
 *
 * ProviderCatalogService.inferFamilies() consulta CAPABILITY_REGISTRY[modelId]
 * como fallback cuando la respuesta del proveedor no tiene architecture.modality
 * ni context_length suficiente.
 *
 * La función seedFamiliesForModel() es el punto de entrada público usado
 * por ProviderCatalogService:
 *
 *   const families = seedFamiliesForModel('openai/gpt-4o')
 *   // → ['reasoning', 'vision', 'coding', 'instruction', 'multilingual']
 */

export type ModelFamily =
  | 'reasoning'      // razonamiento complejo, multi-step, CoT
  | 'fast'           // respuesta rápida, low-latency, alta throughput
  | 'vision'         // procesamiento de imágenes
  | 'coding'         // generación y análisis de código
  | 'multilingual'   // soporte multilingüe fuerte
  | 'long-context'   // ventana de contexto extendida (>64k tokens)
  | 'instruction'    // seguimiento de instrucciones / RLHF fuerte
  | 'mini'           // modelos pequeños / edge

export interface ModelCapability {
  /** ID canónico del modelo: 'provider/model-name' */
  id:       string
  /** Familias que aplican a este modelo */
  families: ModelFamily[]
  /** Contexto máximo en tokens (aproximado) */
  contextK: number
}

/**
 * Catálogo seed de capacidades por modelo.
 * Clave = modelId canónico (mismo formato que ModelPolicy.primaryModel).
 * Usado como fuente secundaria de families en ProviderCatalogService.
 */
export const CAPABILITY_REGISTRY: Record<string, ModelCapability> = {
  // ── OpenAI ──────────────────────────────────────────────────────────────
  'openai/gpt-4o': {
    id: 'openai/gpt-4o',
    families: ['reasoning', 'vision', 'coding', 'instruction', 'multilingual'],
    contextK: 128,
  },
  'openai/gpt-4o-mini': {
    id: 'openai/gpt-4o-mini',
    families: ['fast', 'coding', 'instruction', 'multilingual'],
    contextK: 128,
  },
  'openai/gpt-4.1': {
    id: 'openai/gpt-4.1',
    families: ['reasoning', 'vision', 'coding', 'instruction', 'long-context', 'multilingual'],
    contextK: 1000,
  },
  'openai/gpt-4.1-mini': {
    id: 'openai/gpt-4.1-mini',
    families: ['fast', 'coding', 'instruction', 'multilingual'],
    contextK: 1000,
  },
  'openai/gpt-4.1-nano': {
    id: 'openai/gpt-4.1-nano',
    families: ['fast', 'mini', 'instruction'],
    contextK: 1000,
  },
  'openai/o3': {
    id: 'openai/o3',
    families: ['reasoning', 'coding', 'instruction'],
    contextK: 200,
  },
  'openai/o4-mini': {
    id: 'openai/o4-mini',
    families: ['reasoning', 'fast', 'coding', 'instruction'],
    contextK: 200,
  },

  // ── Anthropic ───────────────────────────────────────────────────────────
  'anthropic/claude-3-7-sonnet-20250219': {
    id: 'anthropic/claude-3-7-sonnet-20250219',
    families: ['reasoning', 'vision', 'coding', 'instruction', 'long-context', 'multilingual'],
    contextK: 200,
  },
  'anthropic/claude-3-5-sonnet-20241022': {
    id: 'anthropic/claude-3-5-sonnet-20241022',
    families: ['reasoning', 'vision', 'coding', 'instruction', 'multilingual'],
    contextK: 200,
  },
  'anthropic/claude-3-5-haiku-20241022': {
    id: 'anthropic/claude-3-5-haiku-20241022',
    families: ['fast', 'coding', 'instruction', 'multilingual'],
    contextK: 200,
  },
  'anthropic/claude-3-opus-20240229': {
    id: 'anthropic/claude-3-opus-20240229',
    families: ['reasoning', 'vision', 'instruction', 'multilingual', 'long-context'],
    contextK: 200,
  },

  // ── Qwen (Alibaba / ModelStudio) ────────────────────────────────────────
  'qwen/qwen2.5-72b-instruct': {
    id: 'qwen/qwen2.5-72b-instruct',
    families: ['reasoning', 'coding', 'instruction', 'multilingual', 'long-context'],
    contextK: 128,
  },
  'qwen/qwen2.5-32b-instruct': {
    id: 'qwen/qwen2.5-32b-instruct',
    families: ['reasoning', 'coding', 'instruction', 'multilingual'],
    contextK: 128,
  },
  'qwen/qwen2.5-7b-instruct': {
    id: 'qwen/qwen2.5-7b-instruct',
    families: ['fast', 'instruction', 'multilingual'],
    contextK: 128,
  },
  'qwen/qwen-plus': {
    id: 'qwen/qwen-plus',
    families: ['fast', 'instruction', 'multilingual'],
    contextK: 128,
  },
  'qwen/qwen-turbo': {
    id: 'qwen/qwen-turbo',
    families: ['fast', 'mini', 'instruction', 'multilingual'],
    contextK: 128,
  },
  'qwen/qwen-max': {
    id: 'qwen/qwen-max',
    families: ['reasoning', 'instruction', 'multilingual', 'long-context'],
    contextK: 128,
  },
  'qwen/qwq-32b': {
    id: 'qwen/qwq-32b',
    families: ['reasoning', 'coding', 'instruction'],
    contextK: 32,
  },

  // ── DeepSeek ────────────────────────────────────────────────────────────
  'deepseek/deepseek-chat': {
    id: 'deepseek/deepseek-chat',
    families: ['reasoning', 'coding', 'instruction', 'multilingual'],
    contextK: 64,
  },
  'deepseek/deepseek-reasoner': {
    id: 'deepseek/deepseek-reasoner',
    families: ['reasoning', 'coding', 'instruction'],
    contextK: 64,
  },
  'deepseek/deepseek-coder-v2': {
    id: 'deepseek/deepseek-coder-v2',
    families: ['coding', 'instruction'],
    contextK: 128,
  },

  // ── Google ───────────────────────────────────────────────────────────────
  'google/gemini-2.0-flash': {
    id: 'google/gemini-2.0-flash',
    families: ['fast', 'vision', 'instruction', 'multilingual', 'long-context'],
    contextK: 1000,
  },
  'google/gemini-2.0-flash-lite': {
    id: 'google/gemini-2.0-flash-lite',
    families: ['fast', 'mini', 'instruction', 'multilingual'],
    contextK: 1000,
  },
  'google/gemini-2.5-pro': {
    id: 'google/gemini-2.5-pro',
    families: ['reasoning', 'vision', 'coding', 'instruction', 'multilingual', 'long-context'],
    contextK: 1000,
  },

  // ── Mistral ──────────────────────────────────────────────────────────────
  'mistral/mistral-large-latest': {
    id: 'mistral/mistral-large-latest',
    families: ['reasoning', 'coding', 'instruction', 'multilingual'],
    contextK: 128,
  },
  'mistral/mistral-small-latest': {
    id: 'mistral/mistral-small-latest',
    families: ['fast', 'instruction', 'multilingual'],
    contextK: 32,
  },
  'mistral/codestral-latest': {
    id: 'mistral/codestral-latest',
    families: ['coding', 'instruction'],
    contextK: 256,
  },
  'mistral/pixtral-large-latest': {
    id: 'mistral/pixtral-large-latest',
    families: ['vision', 'reasoning', 'instruction', 'multilingual'],
    contextK: 128,
  },

  // ── Meta Llama (vía OpenRouter / self-hosted) ─────────────────────────
  'meta-llama/llama-3.3-70b-instruct': {
    id: 'meta-llama/llama-3.3-70b-instruct',
    families: ['reasoning', 'instruction', 'multilingual', 'coding'],
    contextK: 128,
  },
  'meta-llama/llama-3.1-8b-instruct': {
    id: 'meta-llama/llama-3.1-8b-instruct',
    families: ['fast', 'mini', 'instruction', 'multilingual'],
    contextK: 128,
  },
  'meta-llama/llama-3.2-11b-vision-instruct': {
    id: 'meta-llama/llama-3.2-11b-vision-instruct',
    families: ['vision', 'fast', 'instruction'],
    contextK: 128,
  },
}

/**
 * Devuelve las families del seed para un modelId dado.
 * Retorna array vacío si el modelo no está en el catálogo seed.
 * Usado por ProviderCatalogService como fuente secundaria de enrichment.
 */
export function seedFamiliesForModel(modelId: string): ModelFamily[] {
  return CAPABILITY_REGISTRY[modelId]?.families ?? []
}

/**
 * Devuelve el contextK del seed para un modelId dado.
 * Retorna 0 si el modelo no está en el catálogo seed.
 */
export function seedContextKForModel(modelId: string): number {
  return CAPABILITY_REGISTRY[modelId]?.contextK ?? 0
}

// ── Resolución de fallback por similitud (uso legacy / sin DB) ────────────────
// Mantenida para compatibilidad con OrchestratorModelResolver en tests.
// En producción usar ProviderCatalogService.filterActiveFallbackChain().

export function resolveModelFallbackChain(
  failedModelId:   string,
  availableModels: string[],
): string[] {
  const candidates = availableModels.filter(m => m !== failedModelId)
  if (candidates.length === 0) return []

  const failedCap = CAPABILITY_REGISTRY[failedModelId]
  if (!failedCap) return candidates

  const failedFamilies = new Set(failedCap.families)

  const scored = candidates.map(modelId => {
    const cap           = CAPABILITY_REGISTRY[modelId]
    const sameProvider  = modelId.split('/')[0] === failedModelId.split('/')[0]
    const intersection  = cap
      ? cap.families.filter(f => failedFamilies.has(f)).length
      : 0
    const score = intersection + (sameProvider ? 0.5 : 0)
    return { modelId, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.map(s => s.modelId)
}

export class ModelCapabilityRegistry {
  private readonly registry: Record<string, ModelCapability>

  constructor(overrides: Record<string, ModelCapability> = {}) {
    this.registry = { ...CAPABILITY_REGISTRY, ...overrides }
  }

  register(capability: ModelCapability): void {
    this.registry[capability.id] = capability
  }

  resolveFallbackChain(failedModelId: string, availableModels: string[]): string[] {
    const candidates = availableModels.filter(m => m !== failedModelId)
    if (candidates.length === 0) return []

    const failedCap = this.registry[failedModelId]
    if (!failedCap) return candidates

    const failedFamilies = new Set(failedCap.families)

    const scored = candidates.map(modelId => {
      const cap          = this.registry[modelId]
      const sameProvider = modelId.split('/')[0] === failedModelId.split('/')[0]
      const intersection = cap
        ? cap.families.filter(f => failedFamilies.has(f)).length
        : 0
      const score = intersection + (sameProvider ? 0.5 : 0)
      return { modelId, score }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored.map(s => s.modelId)
  }

  get(modelId: string): ModelCapability | undefined {
    return this.registry[modelId]
  }

  list(): ModelCapability[] {
    return Object.values(this.registry)
  }
}
