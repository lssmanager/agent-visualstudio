/**
 * catalog.controller.ts
 * Endpoints REST del catálogo de modelos (ModelCatalogEntry + ProviderCredential).
 *
 * Patrón: registerCatalogRoutes(router) — igual que el resto de módulos del repo.
 * workspaceId se lee del header X-Workspace-Id (mismo patrón global).
 *
 * Rutas registradas:
 *
 *   GET  /catalog/models                 — búsqueda/listado de modelos
 *                                            QS: families, minContextK, search,
 *                                                providerId, includeInactive
 *   GET  /catalog/models/:modelId(*)     — detalle de modelo (modelId puede tener /)
 *   GET  /catalog/providers              — catálogo agrupado por proveedor
 *   GET  /catalog/families               — families activas (chips de filtro en UI)
 *   GET  /catalog/stats                  — estadísticas del catálogo
 *   POST /catalog/sync                   — sync de todos los proveedores activos
 *   POST /catalog/sync/:providerId       — sync de un proveedor específico
 *
 * Todos los endpoints llaman ModelCatalogService (consultas) y
 * ProviderCatalogService (sync). Ambos servicios aceptan prisma como
 * dependencia — se resuelve vía getPrisma() (singleton global).
 */

import type { Router, Request, Response } from 'express'
import { getPrisma } from '../../lib/prisma'
import { ModelCatalogService, ProviderCatalogService } from '@agent-vs/profile-engine'
import type { ModelFamilyType } from '@agent-vs/core-types'

// ── Helpers (mismo patrón que llm-providers.controller) ─────────────────────────

function getWorkspaceId(req: Request): string {
  const id = req.headers['x-workspace-id'] as string | undefined
  if (!id) throw new Error('Missing X-Workspace-Id header')
  return id
}

function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ ok: true, data })
}

function err(res: Response, message: string, status = 400) {
  res.status(status).json({ ok: false, error: message })
}

// ── Factory de servicios ─────────────────────────────────────────────────────

function services() {
  const prisma = getPrisma()
  return {
    catalog:  new ModelCatalogService(prisma),
    provider: new ProviderCatalogService(prisma),
  }
}

// ── Registro de rutas ──────────────────────────────────────────────────────────

export function registerCatalogRoutes(router: Router): void {

  // ── GET /catalog/models ────────────────────────────────────────────────────
  // Búsqueda de modelos con filtros combinables.
  // QS: families (csv), minContextK (number), search (string),
  //     providerId (uuid), includeInactive (boolean)
  router.get('/catalog/models', async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { catalog } = services()

      const families = req.query['families']
        ? String(req.query['families']).split(',').map(f => f.trim() as ModelFamilyType)
        : undefined

      const result = await catalog.searchModels(workspaceId, {
        families,
        minContextK:     req.query['minContextK']     ? Number(req.query['minContextK'])     : undefined,
        search:          req.query['search']          ? String(req.query['search'])          : undefined,
        providerId:      req.query['providerId']      ? String(req.query['providerId'])      : undefined,
        includeInactive: req.query['includeInactive'] === 'true',
      })

      ok(res, result)
    } catch (e) {
      err(res, String(e), String(e).includes('Missing') ? 400 : 500)
    }
  })

  // ── GET /catalog/models/:modelId(*) ──────────────────────────────────────────
  // El wildcard (*) captura modelIds con slash: 'openai/gpt-4o', 'qwen/qwen3-32b'
  router.get('/catalog/models/:modelId(*)', async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const modelId     = req.params['modelId']
      const { catalog } = services()

      const entry = await catalog.getEntryByModelId(modelId, workspaceId)
      if (!entry) {
        return err(res,
          `Model "${modelId}" not found. Run POST /catalog/sync to refresh the catalog.`,
          404,
        )
      }

      ok(res, {
        id:           entry.id,
        modelId:      entry.modelId,
        displayName:  entry.displayName,
        families:     entry.families,
        contextK:     entry.contextK,
        isActive:     entry.isActive,
        providerId:   entry.providerId,
        providerName: entry.provider.name,
        providerType: entry.provider.type,
        syncedAt:     entry.provider.syncedAt?.toISOString() ?? null,
        updatedAt:    entry.updatedAt.toISOString(),
      })
    } catch (e) {
      err(res, String(e), String(e).includes('Missing') ? 400 : 500)
    }
  })

  // ── GET /catalog/providers ────────────────────────────────────────────────────
  // Catálogo agrupado por proveedor — usado por el picker jerárquico de la UI.
  router.get('/catalog/providers', async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { catalog } = services()
      ok(res, await catalog.getProvidersWithModels(workspaceId))
    } catch (e) {
      err(res, String(e), String(e).includes('Missing') ? 400 : 500)
    }
  })

  // ── GET /catalog/families ────────────────────────────────────────────────────
  // Lista de families distintas presentes en el catálogo activo del workspace.
  // Usada para renderizar los chips de filtro en la UI de selección de modelo.
  router.get('/catalog/families', async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { catalog } = services()
      ok(res, { families: await catalog.getActiveFamilies(workspaceId) })
    } catch (e) {
      err(res, String(e), String(e).includes('Missing') ? 400 : 500)
    }
  })

  // ── GET /catalog/stats ──────────────────────────────────────────────────────
  // Estadísticas del catálogo: totales, por proveedor, por family.
  router.get('/catalog/stats', async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { catalog } = services()
      ok(res, await catalog.getModelStats(workspaceId))
    } catch (e) {
      err(res, String(e), String(e).includes('Missing') ? 400 : 500)
    }
  })

  // ── POST /catalog/sync ──────────────────────────────────────────────────────
  // Sincroniza todos los proveedores activos del workspace desde sus APIs.
  // Post-sync: enriquece entries sin families desde el CAPABILITY_REGISTRY seed.
  router.post('/catalog/sync', async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { catalog, provider } = services()

      const results  = await provider.syncAll(workspaceId)
      const enriched = await catalog.enrichAllFromSeed(workspaceId)

      ok(res, {
        synced:   results,
        enriched,
        summary: {
          providers:   results.length,
          success:     results.filter((r: any) => r.result !== null).length,
          errors:      results.filter((r: any) => r.error).length,
          upserted:    results.reduce((acc: number, r: any) => acc + (r.result?.upserted    ?? 0), 0),
          deactivated: results.reduce((acc: number, r: any) => acc + (r.result?.deactivated ?? 0), 0),
        },
      })
    } catch (e) {
      err(res, String(e), String(e).includes('Missing') ? 400 : 500)
    }
  })

  // ── POST /catalog/sync/:providerId ─────────────────────────────────────────
  // Sincroniza un proveedor específico. Valida que pertenezca al workspace.
  router.post('/catalog/sync/:providerId', async (req: Request, res: Response) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const providerId  = req.params['providerId']
      const prisma      = getPrisma()
      const { catalog, provider } = services()

      // Validar que el proveedor pertenece al workspace
      const cred = await prisma.providerCredential.findFirst({
        where: { id: providerId, agencyId: workspaceId },
      })
      if (!cred) return err(res, `Provider "${providerId}" not found`, 404)

      const result   = await provider.syncProvider(providerId)
      const enriched = await catalog.enrichAllFromSeed(workspaceId)

      ok(res, { ...result, enriched })
    } catch (e) {
      err(res, String(e), String(e).includes('Missing') ? 400 : 500)
    }
  })
}
