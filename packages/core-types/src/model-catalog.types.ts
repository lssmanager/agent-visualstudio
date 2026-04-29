/**
 * model-catalog.types.ts
 * Tipos públicos compartidos del catálogo de modelos.
 *
 * Sin dependencia de Prisma ni de librerías de servidor.
 * Importable desde apps/web, apps/api, packages/*, tests.
 *
 * Refleja exactamente ModelCatalogEntry + ProviderCredential en DB
 * pero sin campos sensibles (apiKeyEncrypted nunca sale del servidor).
 */

// ── Enums / unions ────────────────────────────────────────────────────────────

export type ModelFamilyType =
  | 'reasoning'
  | 'fast'
  | 'vision'
  | 'coding'
  | 'multilingual'
  | 'long-context'
  | 'instruction'
  | 'mini'

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'openai_compat'

// ── DTOs ──────────────────────────────────────────────────────────────────────

/** Representación pública de un ModelCatalogEntry (sin apiKey) */
export interface ModelCatalogEntryDto {
  id:           string
  modelId:      string       // 'provider/model-name'
  displayName:  string
  families:     ModelFamilyType[]
  contextK:     number       // ventana en miles de tokens (0 = desconocido)
  isActive:     boolean
  providerId:   string
  providerName: string
  providerType: ProviderType
  syncedAt:     string | null  // ISO datetime del último sync del proveedor
  updatedAt:    string         // ISO datetime del último upsert del entry
}

/** Representación pública de un ProviderCredential (sin apiKey) */
export interface ProviderCredentialDto {
  id:           string
  agencyId:     string
  name:         string
  type:         ProviderType
  baseUrl:      string | null
  extraHeaders: Record<string, string> | null
  isActive:     boolean
  syncedAt:     string | null
  createdAt:    string
  updatedAt:    string
  modelCount?:  number   // incluido en getProvidersWithModels()
}

/**
 * Lo que callLLM() recibe para saber a qué endpoint llamar.
 * Incluye apiKey descifrada — solo circula server-side, nunca serializada.
 */
export interface ResolvedModelDto {
  modelId:     string
  displayName: string
  families:    ModelFamilyType[]
  contextK:    number
  providerId:  string
  providerName: string
  providerType: ProviderType
  apiKey:      string    // descifrada, solo server-side
  baseUrl:     string    // URL efectiva del proveedor
}

/** Representación pública de ModelPolicy con fallbackChain */
export interface ModelPolicyDto {
  id:            string
  primaryModel:  string
  fallbackChain: string[]
  temperature:   number | null
  maxTokens:     number | null
  // scope: exactamente uno de estos es no-null
  agencyId?:     string | null
  departmentId?: string | null
  workspaceId?:  string | null
  agentId?:      string | null
}

// ── Query / Response ──────────────────────────────────────────────────────────

/** Parámetros de búsqueda de modelos en el catálogo */
export interface ModelSearchQuery {
  /** Filtrar por families (el modelo debe tener AL MENOS una) */
  families?:        ModelFamilyType[]
  /** Filtrar por contexto mínimo en miles de tokens */
  minContextK?:     number
  /** Búsqueda por texto en modelId o displayName */
  search?:          string
  /** Filtrar por proveedor específico */
  providerId?:      string
  /** Incluir modelos con isActive=false (default: false) */
  includeInactive?: boolean
}

/** Resultado de una búsqueda de modelos */
export interface ModelSearchResult {
  total:  number
  models: ModelCatalogEntryDto[]
}

/** Catálogo agrupado por proveedor para el picker jerárquico de la UI */
export interface CatalogGroupedByProvider {
  providerId:   string
  providerName: string
  providerType: ProviderType
  syncedAt:     string | null
  modelCount:   number
  models:       ModelCatalogEntryDto[]
}

/** Estadísticas del catálogo para el dashboard de configuración */
export interface CatalogStats {
  total: number
  byProvider: Array<{
    providerId:   string
    providerName: string
    providerType: string
    count:        number
  }>
  byFamily: Array<{
    family: ModelFamilyType
    count:  number
  }>
}
