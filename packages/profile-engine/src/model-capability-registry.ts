/**
 * ModelCapabilityRegistry
 *
 * Catálogo estático de modelos conocidos con sus familias y capacidades.
 * Permite resolver cadenas de fallback por similitud cuando un modelo falla,
 * priorizando modelos del mismo proveedor o con capacidades equivalentes.
 *
 * Diseño:
 *   - Cada modelo tiene un array de `families` (ej: ['reasoning', 'fast'])
 *   - Las familias permiten encontrar sustitutos similares entre proveedores
 *   - El catálogo cubre los providers configurables del sistema:
 *     openai/*, anthropic/*, qwen/*, deepseek/*, google/*, mistral/*, meta-llama/*
 *
 * Uso:
 *   const chain = resolveModelFallbackChain('openai/gpt-4o', availableModels)
 *   // → ['anthropic/claude-3-5-sonnet', 'qwen/qwen-2.5-72b', ...]
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
 * Catálogo de capacidades por modelo.
 * Clave = modelId canónico (mismo formato que ModelPolicy.primaryModel).
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

// ── Resolución de fallback por similitud ─────────────────────────────────────

/**
 * Dado el `failedModelId` y una lista de `availableModels` configurados
 * en el scope, devuelve una cadena de candidatos ordenados por similitud
 * de capacidades (mayor intersección de families primero).
 *
 * El modelo fallido nunca aparece en el resultado.
 * Modelos desconocidos en el catálogo reciben score 0 pero se incluyen al final.
 *
 * @param failedModelId  - El modelo que falló ('provider/model-name')
 * @param availableModels - Modelos configurados en el scope (de ModelPolicy + Agent.model)
 * @returns Array de modelIds ordenados por similitud descendente
 */
export function resolveModelFallbackChain(
  failedModelId:   string,
  availableModels: string[],
): string[] {
  const candidates = availableModels.filter(m => m !== failedModelId)
  if (candidates.length === 0) return []

  const failedCap = CAPABILITY_REGISTRY[failedModelId]
  if (!failedCap) {
    // Modelo fallido desconocido → devolver candidatos sin ordenar
    return candidates
  }

  const failedFamilies = new Set(failedCap.families)

  // Score = intersección de families + bonus si mismo proveedor
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

/**
 * Clase wrapper para uso inyectable en servicios.
 * Permite sobreescribir el catálogo en tests o para agregar modelos
 * custom sin modificar el registro global.
 */
export class ModelCapabilityRegistry {
  private readonly registry: Record<string, ModelCapability>

  constructor(overrides: Record<string, ModelCapability> = {}) {
    this.registry = { ...CAPABILITY_REGISTRY, ...overrides }
  }

  /** Registra o sobreescribe un modelo en runtime (ej: modelos fine-tuned del tenant) */
  register(capability: ModelCapability): void {
    this.registry[capability.id] = capability
  }

  /** Resuelve la cadena de fallback por similitud */
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

  /** Devuelve las capacidades de un modelo (undefined si no está en catálogo) */
  get(modelId: string): ModelCapability | undefined {
    return this.registry[modelId]
  }

  /** Lista todos los modelos registrados */
  list(): ModelCapability[] {
    return Object.values(this.registry)
  }
}
