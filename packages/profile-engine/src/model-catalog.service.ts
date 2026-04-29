/**
 * ModelCatalogService
 *
 * Capa de consulta y escritura sobre ModelCatalogEntry en DB.
 * Separa responsabilidades de ProviderCatalogService (sync/crypto)
 * de las consultas que el resto del sistema necesita en runtime:
 *
 *   - Búsqueda de modelos por familia, texto, proveedor, contextK
 *   - Catálogo agrupado por proveedor para la UI de selección
 *   - Estadísticas del catálogo (conteos, families activas)
 *   - Enriquecimiento de families desde el seed cuando el proveedor
 *     no devuelve metadata suficiente
 *   - Upsert/deactivate directo para seed scripts y tests
 *
 * Flujo típico en runtime:
 *   1. UI llama GET /catalog/models?families=reasoning&minContextK=64
 *   2. catalog.routes.ts llama ModelCatalogService.searchModels()
 *   3. ModelCatalogService consulta ModelCatalogEntry en DB y devuelve DTOs
 *   4. UI renderiza el picker de modelo con los resultados
 *   5. Usuario selecciona modelo → se guarda en ModelPolicy.primaryModel
 *      o ModelPolicy.fallbackChain[n]
 *
 * Flujo en callLLM():
 *   1. run-engine resuelve ModelPolicy del scope (agent→workspace→dept→agency)
 *   2. Itera primaryModel → fallbackChain hasta que un modelo responde
 *   3. Para cada modelId llama ProviderCatalogService.resolveModel()
 *      que devuelve { apiKey, baseUrl, provider.type } para el request HTTP
 */

import { PrismaClient, ModelCatalogEntry, ProviderCredential } from '@prisma/client'
import {
  CAPABILITY_REGISTRY,
  seedFamiliesForModel,
  seedContextKForModel,
  ModelFamily,
} from './model-capability-registry'
import type {
  ModelCatalogEntryDto,
  CatalogGroupedByProvider,
  CatalogStats,
  ModelSearchQuery,
  ModelSearchResult,
} from '../../../packages/core-types/src/model-catalog.types'

// ── Tipos internos ────────────────────────────────────────────────────────────

export type ModelCatalogEntryWithProvider = ModelCatalogEntry & {
  provider: ProviderCredential
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convierte un ModelCatalogEntry+provider a DTO público (sin apiKey) */
function toDto(e: ModelCatalogEntryWithProvider): ModelCatalogEntryDto {
  return {
    id:          e.id,
    modelId:     e.modelId,
    displayName: e.displayName,
    families:    e.families as ModelFamily[],
    contextK:    e.contextK,
    isActive:    e.isActive,
    providerId:  e.providerId,
    providerName: e.provider.name,
    providerType: e.provider.type as any,
    syncedAt:    e.provider.syncedAt?.toISOString() ?? null,
    updatedAt:   e.updatedAt.toISOString(),
  }
}

// ── Servicio ──────────────────────────────────────────────────────────────────

export class ModelCatalogService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Lectura ────────────────────────────────────────────────────────────────

  /**
   * Busca modelos en el catálogo activo de la agencia con filtros combinables.
   * Todos los filtros son opcionales — sin filtros devuelve todo el catálogo activo.
   */
  async searchModels(
    agencyId: string,
    query:    ModelSearchQuery = {},
  ): Promise<ModelSearchResult> {
    const where: Record<string, unknown> = {
      provider: {
        agencyId,
        isActive: true,
      },
    }

    // Sólo activos por defecto
    if (!query.includeInactive) {
      where['isActive'] = true
    }

    // Filtro por proveedor específico
    if (query.providerId) {
      ;(where['provider'] as Record<string, unknown>)['id'] = query.providerId
    }

    // Filtro por families (modelo debe tener AL MENOS una)
    if (query.families?.length) {
      where['families'] = { hasSome: query.families }
    }

    // Filtro por contextK mínimo
    if (query.minContextK !== undefined && query.minContextK > 0) {
      where['contextK'] = { gte: query.minContextK }
    }

    const entries = await this.prisma.modelCatalogEntry.findMany({
      where:   where as any,
      include: { provider: true },
      orderBy: [{ providerId: 'asc' }, { modelId: 'asc' }],
    })

    // Filtro de texto en memoria (substring en modelId o displayName)
    let filtered = entries as ModelCatalogEntryWithProvider[]
    if (query.search) {
      const q = query.search.toLowerCase()
      filtered = filtered.filter(
        e =>
          e.modelId.toLowerCase().includes(q) ||
          e.displayName.toLowerCase().includes(q),
      )
    }

    return {
      total:   filtered.length,
      models:  filtered.map(toDto),
    }
  }

  /**
   * Shortcut: devuelve modelos que tienen una family específica.
   * Útil para el selector de modelo cuando el usuario filtra por tipo de tarea.
   */
  async getModelsByFamily(
    agencyId: string,
    family:   ModelFamily,
  ): Promise<ModelCatalogEntryDto[]> {
    const { models } = await this.searchModels(agencyId, { families: [family] })
    return models
  }

  /**
   * Devuelve el catálogo completo agrupado por proveedor.
   * Usado por la UI para el picker jerárquico proveedor → modelo.
   */
  async getProvidersWithModels(agencyId: string): Promise<CatalogGroupedByProvider[]> {
    const providers = await this.prisma.providerCredential.findMany({
      where:   { agencyId, isActive: true },
      include: {
        catalogEntries: {
          where:   { isActive: true },
          orderBy: { modelId: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    })

    return providers.map(p => ({
      providerId:   p.id,
      providerName: p.name,
      providerType: p.type as any,
      syncedAt:     p.syncedAt?.toISOString() ?? null,
      modelCount:   p.catalogEntries.length,
      models:       p.catalogEntries.map(e => toDto({ ...e, provider: p })),
    }))
  }

  /**
   * Devuelve la lista de families distintas presentes en el catálogo activo.
   * Usado para renderizar los chips de filtro en la UI.
   */
  async getActiveFamilies(agencyId: string): Promise<ModelFamily[]> {
    // Prisma no tiene UNNEST directo → raw query
    const rows = await this.prisma.$queryRaw<{ family: string }[]>`
      SELECT DISTINCT unnest(e.families) AS family
      FROM "ModelCatalogEntry" e
      JOIN "ProviderCredential" p ON p.id = e."providerId"
      WHERE p."agencyId" = ${agencyId}
        AND p."isActive"  = TRUE
        AND e."isActive"  = TRUE
      ORDER BY family
    `
    return rows.map(r => r.family as ModelFamily)
  }

  /**
   * Estadísticas del catálogo: total de modelos, por proveedor, por family.
   * Usado por el dashboard de configuración de proveedores.
   */
  async getModelStats(agencyId: string): Promise<CatalogStats> {
    // Total de modelos activos
    const total = await this.prisma.modelCatalogEntry.count({
      where: {
        isActive: true,
        provider: { agencyId, isActive: true },
      },
    })

    // Por proveedor
    const byProviderRaw = await this.prisma.modelCatalogEntry.groupBy({
      by:    ['providerId'],
      where: {
        isActive: true,
        provider: { agencyId, isActive: true },
      },
      _count: { id: true },
    })

    // Nombres de proveedores
    const providerIds = byProviderRaw.map(r => r.providerId)
    const providers   = await this.prisma.providerCredential.findMany({
      where:  { id: { in: providerIds } },
      select: { id: true, name: true, type: true },
    })
    const providerMap = Object.fromEntries(providers.map(p => [p.id, p]))

    const byProvider = byProviderRaw.map(r => ({
      providerId:   r.providerId,
      providerName: providerMap[r.providerId]?.name ?? r.providerId,
      providerType: providerMap[r.providerId]?.type ?? 'unknown',
      count:        r._count.id,
    }))

    // Por family — raw query para UNNEST
    const byFamilyRaw = await this.prisma.$queryRaw<{ family: string; count: bigint }[]>`
      SELECT unnest(e.families) AS family, COUNT(*) AS count
      FROM "ModelCatalogEntry" e
      JOIN "ProviderCredential" p ON p.id = e."providerId"
      WHERE p."agencyId" = ${agencyId}
        AND p."isActive"  = TRUE
        AND e."isActive"  = TRUE
      GROUP BY family
      ORDER BY count DESC
    `
    const byFamily = byFamilyRaw.map(r => ({
      family: r.family as ModelFamily,
      count:  Number(r.count),
    }))

    return { total, byProvider, byFamily }
  }

  /**
   * Obtiene un entry individual por (providerId, modelId).
   * Devuelve null si no existe.
   */
  async getEntry(
    providerId: string,
    modelId:    string,
  ): Promise<ModelCatalogEntryWithProvider | null> {
    const entry = await this.prisma.modelCatalogEntry.findUnique({
      where:   { providerId_modelId: { providerId, modelId } },
      include: { provider: true },
    })
    return entry as ModelCatalogEntryWithProvider | null
  }

  /**
   * Obtiene un entry por modelId en cualquier proveedor activo de la agencia.
   * Si el mismo modelId existe en varios proveedores, devuelve el más recientemente
   * sincronizado. Devuelve null si no está activo en ningún proveedor.
   */
  async getEntryByModelId(
    modelId:  string,
    agencyId: string,
  ): Promise<ModelCatalogEntryWithProvider | null> {
    const entry = await this.prisma.modelCatalogEntry.findFirst({
      where: {
        modelId,
        isActive: true,
        provider: { agencyId, isActive: true },
      },
      include: { provider: true },
      orderBy: { updatedAt: 'desc' },
    })
    return entry as ModelCatalogEntryWithProvider | null
  }

  // ── Escritura ──────────────────────────────────────────────────────────────

  /**
   * Upserta un ModelCatalogEntry directamente.
   * Usado por seed scripts, tests, y sync manual desde la UI.
   */
  async upsertEntry(data: {
    providerId:  string
    modelId:     string
    displayName: string
    families:    ModelFamily[]
    contextK:    number
    isActive?:   boolean
    raw?:        Record<string, unknown>
  }): Promise<ModelCatalogEntry> {
    return this.prisma.modelCatalogEntry.upsert({
      where:  { providerId_modelId: { providerId: data.providerId, modelId: data.modelId } },
      create: {
        providerId:  data.providerId,
        modelId:     data.modelId,
        displayName: data.displayName,
        families:    data.families,
        contextK:    data.contextK,
        isActive:    data.isActive ?? true,
        raw:         data.raw ?? null,
      },
      update: {
        displayName: data.displayName,
        families:    data.families,
        contextK:    data.contextK,
        isActive:    data.isActive ?? true,
        raw:         data.raw ?? null,
        updatedAt:   new Date(),
      },
    })
  }

  /**
   * Marca un entry como inactivo (modelo retirado del proveedor).
   * No elimina el registro — mantiene historial.
   */
  async deactivateEntry(providerId: string, modelId: string): Promise<void> {
    await this.prisma.modelCatalogEntry.updateMany({
      where: { providerId, modelId },
      data:  { isActive: false, updatedAt: new Date() },
    })
  }

  // ── Enriquecimiento ────────────────────────────────────────────────────────

  /**
   * Enriquece un ModelCatalogEntry con families del CAPABILITY_REGISTRY seed
   * cuando el entry tiene families vacías (el proveedor no devolvió metadata).
   *
   * Escribe en DB si hubo enriquecimiento.
   * Devuelve true si se actualizó, false si ya tenía families.
   */
  async enrichFromSeed(entry: ModelCatalogEntry): Promise<boolean> {
    if (entry.families.length > 0) return false

    const seedFamilies = seedFamiliesForModel(entry.modelId)
    const seedContextK = seedContextKForModel(entry.modelId)

    if (seedFamilies.length === 0) return false

    await this.prisma.modelCatalogEntry.update({
      where: { id: entry.id },
      data:  {
        families:  seedFamilies,
        contextK:  entry.contextK > 0 ? entry.contextK : seedContextK,
        updatedAt: new Date(),
      },
    })
    return true
  }

  /**
   * Enriquece todos los entries sin families de la agencia.
   * Útil post-sync cuando el proveedor devolvió modelos sin metadata.
   * Retorna el número de entries enriquecidos.
   */
  async enrichAllFromSeed(agencyId: string): Promise<number> {
    const entries = await this.prisma.modelCatalogEntry.findMany({
      where: {
        families: { isEmpty: true },
        provider: { agencyId, isActive: true },
      },
    })

    let enriched = 0
    for (const entry of entries) {
      const updated = await this.enrichFromSeed(entry)
      if (updated) enriched++
    }
    return enriched
  }
}
