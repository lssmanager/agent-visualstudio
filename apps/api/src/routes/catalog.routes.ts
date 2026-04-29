/**
 * catalog.routes.ts
 * Endpoints REST del catálogo de modelos y gestión de proveedores.
 *
 * Base path: /catalog  (registrado en apps/api/src/app.ts)
 *
 * Todos los endpoints requieren JWT válido con agency context.
 * agencyId se lee de req.agency.id (middleware de autenticación existente).
 *
 * Rutas:
 *   GET  /catalog/models                  — búsqueda/listado de modelos
 *   GET  /catalog/models/:modelId         — detalle de modelo + proveedor resuelto
 *   GET  /catalog/providers               — proveedores con conteos de modelos
 *   GET  /catalog/families                — families activas en el catálogo
 *   GET  /catalog/stats                   — estadísticas del catálogo
 *   POST /catalog/sync                    — sync de todos los proveedores activos
 *   POST /catalog/sync/:providerId        — sync de un proveedor específico
 *
 * Query string params para GET /catalog/models:
 *   families      — comma-separated: reasoning,fast,vision
 *   minContextK   — number: 64
 *   search        — string: gpt
 *   providerId    — string: uuid
 *   includeInactive — boolean: true
 */

import { Router, Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { ModelCatalogService } from '@agent-vs/profile-engine'
import { ProviderCatalogService } from '@agent-vs/profile-engine'
import type { ModelFamilyType } from '@agent-vs/core-types'

export function createCatalogRouter(prisma: PrismaClient): Router {
  const router  = Router()
  const catalog = new ModelCatalogService(prisma)
  const provider = new ProviderCatalogService(prisma)

  // ── GET /catalog/models ────────────────────────────────────────────────────
  router.get('/models', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agencyId = (req as any).agency?.id
      if (!agencyId) return res.status(401).json({ error: 'Unauthorized' })

      const families = req.query['families']
        ? String(req.query['families']).split(',').map(f => f.trim()) as ModelFamilyType[]
        : undefined

      const result = await catalog.searchModels(agencyId, {
        families,
        minContextK:     req.query['minContextK'] ? Number(req.query['minContextK']) : undefined,
        search:          req.query['search'] ? String(req.query['search']) : undefined,
        providerId:      req.query['providerId'] ? String(req.query['providerId']) : undefined,
        includeInactive: req.query['includeInactive'] === 'true',
      })

      res.json(result)
    } catch (err) {
      next(err)
    }
  })

  // ── GET /catalog/models/:modelId ───────────────────────────────────────────
  // modelId viene URL-encoded: 'openai%2Fgpt-4o' → 'openai/gpt-4o'
  router.get('/models/:modelId(*)', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agencyId = (req as any).agency?.id
      if (!agencyId) return res.status(401).json({ error: 'Unauthorized' })

      const modelId = req.params['modelId']
      const entry   = await catalog.getEntryByModelId(modelId, agencyId)

      if (!entry) {
        return res.status(404).json({
          error:   'Model not found',
          modelId,
          hint:    'Run POST /catalog/sync to refresh the catalog',
        })
      }

      res.json({
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
    } catch (err) {
      next(err)
    }
  })

  // ── GET /catalog/providers ─────────────────────────────────────────────────
  router.get('/providers', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agencyId = (req as any).agency?.id
      if (!agencyId) return res.status(401).json({ error: 'Unauthorized' })

      const grouped = await catalog.getProvidersWithModels(agencyId)
      res.json(grouped)
    } catch (err) {
      next(err)
    }
  })

  // ── GET /catalog/families ──────────────────────────────────────────────────
  router.get('/families', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agencyId = (req as any).agency?.id
      if (!agencyId) return res.status(401).json({ error: 'Unauthorized' })

      const families = await catalog.getActiveFamilies(agencyId)
      res.json({ families })
    } catch (err) {
      next(err)
    }
  })

  // ── GET /catalog/stats ─────────────────────────────────────────────────────
  router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agencyId = (req as any).agency?.id
      if (!agencyId) return res.status(401).json({ error: 'Unauthorized' })

      const stats = await catalog.getModelStats(agencyId)
      res.json(stats)
    } catch (err) {
      next(err)
    }
  })

  // ── POST /catalog/sync ─────────────────────────────────────────────────────
  // Sincroniza todos los proveedores activos de la agencia
  router.post('/sync', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agencyId = (req as any).agency?.id
      if (!agencyId) return res.status(401).json({ error: 'Unauthorized' })

      const results = await provider.syncAll(agencyId)

      // Post-sync: enriquecer entries sin families desde el seed
      const enriched = await catalog.enrichAllFromSeed(agencyId)

      res.json({
        synced:   results,
        enriched,
        summary: {
          providers: results.length,
          success:   results.filter(r => r.result !== null).length,
          errors:    results.filter(r => r.error).length,
          upserted:  results.reduce((acc, r) => acc + (r.result?.upserted ?? 0), 0),
          deactivated: results.reduce((acc, r) => acc + (r.result?.deactivated ?? 0), 0),
        },
      })
    } catch (err) {
      next(err)
    }
  })

  // ── POST /catalog/sync/:providerId ─────────────────────────────────────────
  // Sincroniza un proveedor específico por ID
  router.post('/sync/:providerId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agencyId   = (req as any).agency?.id
      if (!agencyId) return res.status(401).json({ error: 'Unauthorized' })

      const providerId = req.params['providerId']

      // Validar que el proveedor pertenece a la agencia
      const cred = await prisma.providerCredential.findFirst({
        where: { id: providerId, agencyId },
      })
      if (!cred) {
        return res.status(404).json({ error: 'Provider not found' })
      }

      const result   = await provider.syncProvider(providerId)
      const enriched = await catalog.enrichAllFromSeed(agencyId)

      res.json({ ...result, enriched })
    } catch (err) {
      next(err)
    }
  })

  return router
}
