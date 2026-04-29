/**
 * ProviderCatalogService
 *
 * Gestiona proveedores LLM configurados por la agencia (tenant):
 *   - CRUD de ProviderCredential con API key cifrada AES-256-GCM
 *   - Sync de catálogo de modelos desde las APIs de cada proveedor
 *   - Enriquecimiento de families con CAPABILITY_REGISTRY como seed
 *   - Resolución de modelo → proveedor para callLLM()
 *
 * Proveedores soportados:
 *   'openai'        → https://api.openai.com/v1/models
 *   'anthropic'     → https://api.anthropic.com/v1/models
 *   'openrouter'    → https://openrouter.ai/api/v1/models  (50+ sub-providers)
 *   'openai_compat' → {baseUrl}/v1/models
 *
 * Cifrado:
 *   AES-256-GCM. Clave maestra = PROVIDER_SECRET (env var, 32 bytes hex).
 *   Formato almacenado: "iv:authTag:ciphertext" (todo hex).
 *
 * Uso:
 *   const svc = new ProviderCatalogService(prisma)
 *   const cred = await svc.createProvider(agencyId, { name, type, apiKey, baseUrl })
 *   await svc.syncProvider(cred.id)
 *   const models = await svc.listModels(agencyId, { families: ['reasoning'] })
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { PrismaClient, ProviderCredential, ModelCatalogEntry } from '@prisma/client'
import { CAPABILITY_REGISTRY, ModelFamily } from './model-capability-registry'

// ── Constantes ────────────────────────────────────────────────────────────────

const PROVIDER_SECRET = process.env.PROVIDER_SECRET ?? ''
const ALGORITHM       = 'aes-256-gcm'

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai:     'https://api.openai.com/v1',
  anthropic:  'https://api.anthropic.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
}

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface CreateProviderInput {
  name:         string
  type:         'openai' | 'anthropic' | 'openrouter' | 'openai_compat'
  apiKey:       string          // en texto plano — se cifra antes de guardar
  baseUrl?:     string          // requerido para openai_compat
  extraHeaders?: Record<string, string>
}

export interface UpdateProviderInput {
  name?:         string
  apiKey?:       string          // si se provee, se re-cifra
  baseUrl?:      string
  extraHeaders?: Record<string, string>
  isActive?:     boolean
}

export interface ModelFilter {
  families?:       ModelFamily[]  // modelo debe tener AL MENOS una de estas families
  minContextK?:    number         // contexto mínimo en K tokens
  search?:         string         // substring match en modelId o displayName
  includeInactive?: boolean       // incluir modelos con isActive=false
}

export interface ResolvedModel {
  entry:    ModelCatalogEntry
  provider: ProviderCredential
  /** API key descifrada — lista para usar en el request */
  apiKey:   string
  /** Base URL efectiva del proveedor */
  baseUrl:  string
}

export interface SyncResult {
  upserted:    number
  deactivated: number
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

/**
 * Cifra una API key con AES-256-GCM.
 * Retorna string en formato "iv:authTag:ciphertext" (hex).
 */
export function encryptApiKey(plaintext: string): string {
  if (!PROVIDER_SECRET) {
    throw new Error('PROVIDER_SECRET env var is not set')
  }
  const key      = Buffer.from(PROVIDER_SECRET, 'hex')
  const iv       = randomBytes(12)          // 96-bit IV para GCM
  const cipher   = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag  = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Descifra una API key cifrada con encryptApiKey().
 */
export function decryptApiKey(stored: string): string {
  if (!PROVIDER_SECRET) {
    throw new Error('PROVIDER_SECRET env var is not set')
  }
  const [ivHex, tagHex, ctHex] = stored.split(':')
  if (!ivHex || !tagHex || !ctHex) {
    throw new Error('Invalid encrypted API key format')
  }
  const key      = Buffer.from(PROVIDER_SECRET, 'hex')
  const iv       = Buffer.from(ivHex, 'hex')
  const authTag  = Buffer.from(tagHex, 'hex')
  const ct       = Buffer.from(ctHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Devuelve la base URL efectiva para un proveedor */
function resolveBaseUrl(type: string, baseUrl?: string | null): string {
  if (baseUrl) return baseUrl.replace(/\/$/, '')
  const def = DEFAULT_BASE_URLS[type]
  if (!def) throw new Error(`No baseUrl for provider type '${type}'`)
  return def
}

/** Construye los headers HTTP para una llamada al proveedor */
function buildHeaders(
  type:        string,
  apiKey:      string,
  extraHeaders?: Record<string, string> | null,
): Record<string, string> {
  const base: Record<string, string> = { 'Content-Type': 'application/json' }
  if (type === 'anthropic') {
    base['x-api-key']         = apiKey
    base['anthropic-version'] = '2023-06-01'
  } else {
    base['Authorization'] = `Bearer ${apiKey}`
  }
  return { ...base, ...(extraHeaders ?? {}) }
}

/**
 * Inferencia de families a partir de la respuesta raw del proveedor.
 * Fuente primaria: metadata de OpenRouter (architecture.modality, context_length).
 * Fuente secundaria: CAPABILITY_REGISTRY seed.
 */
function inferFamilies(
  modelId:    string,
  raw:        Record<string, unknown>,
  contextK:   number,
): ModelFamily[] {
  // 1. Seed del registry estático
  const seed = CAPABILITY_REGISTRY[modelId]?.families ?? []
  const set  = new Set<ModelFamily>(seed)

  // 2. OpenRouter: architecture.modality
  const arch     = raw['architecture'] as Record<string, unknown> | undefined
  const modality = arch?.['modality'] as string | undefined
  if (modality) {
    if (modality.includes('image')) set.add('vision')
    if (modality.includes('text'))  set.add('instruction')
  }

  // 3. Heurísticas por modelId
  const lower = modelId.toLowerCase()
  if (/(-vision|-vl|vision-)/.test(lower))   set.add('vision')
  if (/(coder|code|codestral)/.test(lower))  set.add('coding')
  if (/(reason|r1|qwq|o\d)/.test(lower))    set.add('reasoning')
  if (/(turbo|flash|haiku|mini|nano|fast)/.test(lower)) set.add('fast')
  if (/(8b|7b|3b|1b|-tiny|-small)/.test(lower)) set.add('mini')
  if (contextK >= 64) set.add('long-context')

  return Array.from(set)
}

// ── Parsers por proveedor ─────────────────────────────────────────────────────

interface ParsedModel {
  modelId:     string
  displayName: string
  families:    ModelFamily[]
  contextK:    number
  /** USD por 1000 tokens de prompt. null = proveedor no lo devuelve */
  pricingPrompt:     number | null
  /** USD por 1000 tokens de completion. null = proveedor no lo devuelve */
  pricingCompletion: number | null
  raw:         Record<string, unknown>
}

/**
 * Convierte el string de pricing de OpenRouter (USD/token) a USD/1000 tokens.
 * OpenRouter devuelve strings como "0.000002" (USD por 1 token).
 * Retorna null si el valor no es parseable o es 0.
 */
function parseOpenRouterPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === '0') return null
  const n = typeof value === 'string' ? parseFloat(value) : Number(value)
  if (!isFinite(n) || n <= 0) return null
  // Convertir de USD/token → USD/1000 tokens
  return Math.round(n * 1000 * 1e8) / 1e8
}

/** Parser para OpenAI GET /v1/models */
function parseOpenAIModels(data: unknown[]): ParsedModel[] {
  return data
    .filter((m: any) => typeof m.id === 'string')
    .map((m: any) => {
      const modelId  = `openai/${m.id}` as string
      const contextK = 0  // OpenAI no devuelve context_length en /models
      return {
        modelId,
        displayName:       m.id,
        families:          inferFamilies(modelId, m, contextK),
        contextK,
        pricingPrompt:     null,  // OpenAI no devuelve pricing en /models
        pricingCompletion: null,
        raw:               m as Record<string, unknown>,
      }
    })
}

/** Parser para Anthropic GET /v1/models */
function parseAnthropicModels(data: unknown[]): ParsedModel[] {
  return data
    .filter((m: any) => typeof m.id === 'string')
    .map((m: any) => {
      const modelId  = `anthropic/${m.id}`
      const contextK = 0
      return {
        modelId,
        displayName:       (m.display_name ?? m.id) as string,
        families:          inferFamilies(modelId, m as Record<string, unknown>, contextK),
        contextK,
        pricingPrompt:     null,  // Anthropic no devuelve pricing en /models
        pricingCompletion: null,
        raw:               m as Record<string, unknown>,
      }
    })
}

/**
 * Parser para OpenRouter GET /v1/models.
 *
 * OpenRouter devuelve metadata rica:
 *   - context_length: número (tokens)
 *   - architecture.modality: string ('text+image->text', 'text->text', etc.)
 *   - pricing.prompt: string (USD por 1 token, e.g. "0.000002")
 *   - pricing.completion: string (USD por 1 token, e.g. "0.000006")
 *
 * El modelId ya incluye el sub-provider ('meta-llama/llama-3.3-70b').
 * Esto cubre automáticamente 50+ proveedores sin parsers adicionales.
 */
function parseOpenRouterModels(data: unknown[]): ParsedModel[] {
  return data
    .filter((m: any) => typeof m.id === 'string')
    .map((m: any) => {
      const modelId  = m.id as string   // ya viene en formato 'provider/model'
      const contextK = typeof m.context_length === 'number'
        ? Math.round(m.context_length / 1000)
        : 0

      // Pricing — pricing.prompt y pricing.completion son strings USD/token
      const pricing          = m.pricing as Record<string, unknown> | undefined
      const pricingPrompt    = parseOpenRouterPrice(pricing?.['prompt'])
      const pricingCompletion = parseOpenRouterPrice(pricing?.['completion'])

      return {
        modelId,
        displayName:       (m.name ?? m.id) as string,
        families:          inferFamilies(modelId, m as Record<string, unknown>, contextK),
        contextK,
        pricingPrompt,
        pricingCompletion,
        raw:               m as Record<string, unknown>,
      }
    })
}

/** Parser genérico para openai_compat GET /v1/models */
function parseCompatModels(data: unknown[], providerName: string): ParsedModel[] {
  const prefix = providerName.toLowerCase().replace(/\s+/g, '-')
  return data
    .filter((m: any) => typeof m.id === 'string')
    .map((m: any) => {
      const modelId  = (m.id as string).includes('/') ? m.id : `${prefix}/${m.id}`
      const contextK = 0
      return {
        modelId,
        displayName:       (m.name ?? m.id) as string,
        families:          inferFamilies(modelId, m as Record<string, unknown>, contextK),
        contextK,
        pricingPrompt:     null,
        pricingCompletion: null,
        raw:               m as Record<string, unknown>,
      }
    })
}

// ── Servicio principal ────────────────────────────────────────────────────────

export class ProviderCatalogService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── CRUD de credenciales ────────────────────────────────────────────────

  /** Crea un nuevo ProviderCredential cifrado para la agencia */
  async createProvider(
    agencyId: string,
    input:    CreateProviderInput,
  ): Promise<ProviderCredential> {
    if (input.type === 'openai_compat' && !input.baseUrl) {
      throw new Error(`baseUrl is required for type 'openai_compat'`)
    }
    return this.prisma.providerCredential.create({
      data: {
        agencyId,
        name:            input.name,
        type:            input.type,
        baseUrl:         input.baseUrl ?? null,
        apiKeyEncrypted: encryptApiKey(input.apiKey),
        extraHeaders:    input.extraHeaders ?? null,
        isActive:        true,
      },
    })
  }

  /** Actualiza un proveedor existente */
  async updateProvider(
    id:    string,
    input: UpdateProviderInput,
  ): Promise<ProviderCredential> {
    const data: Record<string, unknown> = {}
    if (input.name         !== undefined) data['name']         = input.name
    if (input.baseUrl      !== undefined) data['baseUrl']      = input.baseUrl
    if (input.extraHeaders !== undefined) data['extraHeaders'] = input.extraHeaders
    if (input.isActive     !== undefined) data['isActive']     = input.isActive
    if (input.apiKey       !== undefined) data['apiKeyEncrypted'] = encryptApiKey(input.apiKey)
    return this.prisma.providerCredential.update({ where: { id }, data })
  }

  /** Elimina un proveedor y su catálogo en cascada */
  async deleteProvider(id: string): Promise<void> {
    await this.prisma.providerCredential.delete({ where: { id } })
  }

  /** Lista todos los proveedores de la agencia */
  async listProviders(agencyId: string): Promise<ProviderCredential[]> {
    return this.prisma.providerCredential.findMany({
      where:   { agencyId },
      orderBy: { name: 'asc' },
    })
  }

  // ── Sync de catálogo ────────────────────────────────────────────────────

  /**
   * Sincroniza el catálogo de modelos de un proveedor específico.
   * Upserta ModelCatalogEntry con families enriquecidas y pricing (si aplica).
   * Marca como isActive=false los modelos que el proveedor ya no devuelve.
   */
  async syncProvider(providerId: string): Promise<SyncResult> {
    const provider = await this.prisma.providerCredential.findUniqueOrThrow({
      where: { id: providerId },
    })
    if (!provider.isActive) {
      throw new Error(`Provider '${provider.name}' is not active`)
    }

    const apiKey  = decryptApiKey(provider.apiKeyEncrypted)
    const baseUrl = resolveBaseUrl(provider.type, provider.baseUrl)
    const headers = buildHeaders(
      provider.type,
      apiKey,
      provider.extraHeaders as Record<string, string> | null,
    )

    // Fetch del endpoint /v1/models
    const res = await fetch(`${baseUrl}/models`, { headers })
    if (!res.ok) {
      throw new Error(
        `Failed to fetch models from '${provider.name}': ${res.status} ${res.statusText}`,
      )
    }
    const json   = await res.json() as { data?: unknown[]; models?: unknown[] } | unknown[]
    const rawArr = Array.isArray(json)
      ? json
      : ((json as any).data ?? (json as any).models ?? [])

    // Parseo según tipo de proveedor
    let parsed: ParsedModel[]
    switch (provider.type) {
      case 'openai':     parsed = parseOpenAIModels(rawArr);                      break
      case 'anthropic':  parsed = parseAnthropicModels(rawArr);                   break
      case 'openrouter': parsed = parseOpenRouterModels(rawArr);                  break
      default:           parsed = parseCompatModels(rawArr, provider.name);       break
    }

    // Upsert en batch — incluye pricing cuando está disponible
    let upserted = 0
    for (const model of parsed) {
      await this.prisma.modelCatalogEntry.upsert({
        where:  { providerId_modelId: { providerId, modelId: model.modelId } },
        create: {
          providerId,
          modelId:                model.modelId,
          displayName:            model.displayName,
          families:               model.families,
          contextK:               model.contextK,
          promptCostPer1kUsd:     model.pricingPrompt     ?? null,
          completionCostPer1kUsd: model.pricingCompletion ?? null,
          isActive:               true,
          raw:                    model.raw,
        },
        update: {
          displayName:            model.displayName,
          families:               model.families,
          contextK:               model.contextK,
          // Solo sobreescribir pricing si el proveedor devuelve un valor nuevo.
          // Preservar el valor anterior si el nuevo es null (evitar borrar pricing
          // de un sync anterior de OpenRouter con data completa).
          ...(model.pricingPrompt     !== null && { promptCostPer1kUsd:     model.pricingPrompt }),
          ...(model.pricingCompletion !== null && { completionCostPer1kUsd: model.pricingCompletion }),
          isActive:               true,
          raw:                    model.raw,
          updatedAt:              new Date(),
        },
      })
      upserted++
    }

    // Desactivar modelos que ya no vienen del proveedor
    const activeIds = parsed.map(m => m.modelId)
    const { count: deactivated } = await this.prisma.modelCatalogEntry.updateMany({
      where: {
        providerId,
        isActive: true,
        modelId:  { notIn: activeIds },
      },
      data: { isActive: false, updatedAt: new Date() },
    })

    // Actualizar syncedAt del proveedor
    await this.prisma.providerCredential.update({
      where: { id: providerId },
      data:  { syncedAt: new Date() },
    })

    return { upserted, deactivated }
  }

  /**
   * Sincroniza todos los proveedores activos de la agencia.
   * Los errores por proveedor se capturan sin interrumpir los demás.
   */
  async syncAll(agencyId: string): Promise<Array<{
    providerId: string
    name:       string
    result:     SyncResult | null
    error?:     string
  }>> {
    const providers = await this.prisma.providerCredential.findMany({
      where: { agencyId, isActive: true },
    })
    return Promise.all(
      providers.map(async (p) => {
        try {
          const result = await this.syncProvider(p.id)
          return { providerId: p.id, name: p.name, result }
        } catch (err) {
          return {
            providerId: p.id,
            name:       p.name,
            result:     null,
            error:      err instanceof Error ? err.message : String(err),
          }
        }
      }),
    )
  }

  // ── Consulta de catálogo ────────────────────────────────────────────────

  /**
   * Devuelve el catálogo de modelos activos de la agencia, filtrable.
   */
  async listModels(
    agencyId: string,
    filters:  ModelFilter = {},
  ): Promise<(ModelCatalogEntry & { provider: ProviderCredential })[]> {
    const where: Record<string, unknown> = {
      provider: { agencyId },
    }
    if (!filters.includeInactive) {
      where['isActive'] = true
      ;(where['provider'] as Record<string, unknown>)['isActive'] = true
    }
    if (filters.minContextK !== undefined) {
      where['contextK'] = { gte: filters.minContextK }
    }
    if (filters.families?.length) {
      where['families'] = { hasSome: filters.families }
    }

    const entries = await this.prisma.modelCatalogEntry.findMany({
      where:   where as any,
      include: { provider: true },
      orderBy: [{ providerId: 'asc' }, { modelId: 'asc' }],
    })

    if (filters.search) {
      const q = filters.search.toLowerCase()
      return entries.filter(
        e =>
          e.modelId.toLowerCase().includes(q) ||
          e.displayName.toLowerCase().includes(q),
      )
    }
    return entries
  }

  /**
   * Resuelve un modelId a su ProviderCredential + ModelCatalogEntry + apiKey descifrada.
   * Devuelve null si el modelo no está activo en ningún proveedor de la agencia.
   * Usado por callLLM() para determinar endpoint y credencial.
   */
  async resolveModel(
    modelId:  string,
    agencyId: string,
  ): Promise<ResolvedModel | null> {
    const entry = await this.prisma.modelCatalogEntry.findFirst({
      where: {
        modelId,
        isActive: true,
        provider: { agencyId, isActive: true },
      },
      include: { provider: true },
      orderBy: { updatedAt: 'desc' },
    })
    if (!entry) return null

    const apiKey  = decryptApiKey(entry.provider.apiKeyEncrypted)
    const baseUrl = resolveBaseUrl(entry.provider.type, entry.provider.baseUrl)
    return { entry, provider: entry.provider, apiKey, baseUrl }
  }

  /**
   * Filtra una fallbackChain a solo los modelos activos en el catálogo.
   * Preserva el orden original.
   */
  async filterActiveFallbackChain(
    chain:    string[],
    agencyId: string,
  ): Promise<string[]> {
    if (chain.length === 0) return []
    const entries = await this.prisma.modelCatalogEntry.findMany({
      where: {
        modelId:  { in: chain },
        isActive: true,
        provider: { agencyId, isActive: true },
      },
      select: { modelId: true },
    })
    const activeSet = new Set(entries.map(e => e.modelId))
    return chain.filter(m => activeSet.has(m))
  }
}
