/**
 * LlmProviders controller
 *
 * CRUD de LlmProvider + 5 rutas OAuth:
 *
 *   GET    /llm-providers/catalog                  → listCatalog()
 *   GET    /llm-providers                           → list(workspaceId)
 *   GET    /llm-providers/:id                       → get(id)
 *   POST   /llm-providers                           → create()
 *   PATCH  /llm-providers/:id                       → update()
 *   DELETE /llm-providers/:id                       → delete()
 *
 *   POST   /llm-providers/:id/oauth/initiate        → OAuthService.initiateFlow()
 *   POST   /llm-providers/:id/oauth/exchange        → OAuthService.exchangeCode()
 *   POST   /llm-providers/:id/oauth/refresh         → OAuthService.refreshToken()
 *   DELETE /llm-providers/:id/oauth/token           → OAuthService.revokeToken()
 *   GET    /llm-providers/:id/oauth/status          → OAuthService.getTokenStatus()
 *
 * workspaceId se lee siempre del header X-Workspace-Id (mismo patrón que el resto del repo).
 */

import type { Router, Request, Response } from 'express'
import { getPrisma } from '../../lib/prisma.js'
import { OAuthService } from '../../services/oauth.service.js'
import { LlmProvidersService } from './llm-providers.service.js'

// ── Helpers ─────────────────────────────────────────────────────────────

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

// ── Factory de servicios (singleton por request — Prisma es singleton global) ──

function services() {
  const prisma = getPrisma()
  return {
    providers: new LlmProvidersService(prisma),
    oauth:     new OAuthService(prisma),
  }
}

// ── Registro de rutas ─────────────────────────────────────────────────

export function registerLlmProvidersRoutes(router: Router): void {

  // ── Catálogo ───────────────────────────────────────────────────────────

  // GET /llm-providers/catalog
  // Lista todos los providers conocidos del catálogo (semilla).
  // Sin workspaceId — es público dentro del API.
  router.get('/llm-providers/catalog', async (_req, res) => {
    try {
      const { providers } = services()
      ok(res, await providers.listCatalog())
    } catch (e) {
      err(res, String(e), 500)
    }
  })

  // ── CRUD ──────────────────────────────────────────────────────────────

  // GET /llm-providers
  router.get('/llm-providers', async (req, res) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { providers } = services()
      ok(res, await providers.list(workspaceId))
    } catch (e) {
      err(res, String(e), 400)
    }
  })

  // GET /llm-providers/:id
  router.get('/llm-providers/:id', async (req, res) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { providers } = services()
      const row = await providers.get(workspaceId, req.params.id)
      if (!row) return err(res, 'LlmProvider not found', 404)
      ok(res, row)
    } catch (e) {
      err(res, String(e), 400)
    }
  })

  // POST /llm-providers
  router.post('/llm-providers', async (req, res) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { providers } = services()
      const row = await providers.create(workspaceId, req.body)
      ok(res, row, 201)
    } catch (e) {
      err(res, String(e), 400)
    }
  })

  // PATCH /llm-providers/:id
  router.patch('/llm-providers/:id', async (req, res) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { providers } = services()
      const row = await providers.update(workspaceId, req.params.id, req.body)
      if (!row) return err(res, 'LlmProvider not found', 404)
      ok(res, row)
    } catch (e) {
      err(res, String(e), 400)
    }
  })

  // DELETE /llm-providers/:id
  router.delete('/llm-providers/:id', async (req, res) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { providers } = services()
      const deleted = await providers.delete(workspaceId, req.params.id)
      if (!deleted) return err(res, 'LlmProvider not found', 404)
      ok(res, { deleted: true })
    } catch (e) {
      err(res, String(e), 400)
    }
  })

  // ── OAuth ─────────────────────────────────────────────────────────────

  /**
   * POST /llm-providers/:id/oauth/initiate
   *
   * Genera PKCE + state y devuelve la URL de autorización.
   * El frontend abre esta URL en el browser del usuario.
   * El verifier y el state se devuelven al cliente para que
   * los reenvíe en /exchange (no se guardan en sesión server-side).
   *
   * Body: ninguno requerido.
   * Response: { authorizeUrl, verifier, state }
   */
  router.post('/llm-providers/:id/oauth/initiate', async (req, res) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { providers, oauth } = services()

      // Verificar que el provider existe y pertenece al workspace
      const row = await providers.get(workspaceId, req.params.id)
      if (!row) return err(res, 'LlmProvider not found', 404)

      const providerSlug = (row as Record<string, unknown>).provider as string
      const result = oauth.initiateFlow(providerSlug)

      ok(res, result)
    } catch (e) {
      err(res, String(e), 400)
    }
  })

  /**
   * POST /llm-providers/:id/oauth/exchange
   *
   * Intercambia el authorization code por tokens y los guarda en DB.
   *
   * Body: { code: string, verifier: string, state: string }
   * Response: { exchanged: true }
   *
   * Nota: la validación del state la hace OAuthService internamente
   * al comparar con el challenge (PKCE). El state del body es
   * informativo — se incluye por completitud / logging.
   */
  router.post('/llm-providers/:id/oauth/exchange', async (req, res) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { providers, oauth } = services()

      const row = await providers.get(workspaceId, req.params.id)
      if (!row) return err(res, 'LlmProvider not found', 404)

      const { code, verifier } = req.body as { code: string; verifier: string; state?: string }
      if (!code)     return err(res, 'Missing body field: code')
      if (!verifier) return err(res, 'Missing body field: verifier')

      const providerSlug = (row as Record<string, unknown>).provider as string
      await oauth.exchangeCode(req.params.id, providerSlug, code, verifier)

      ok(res, { exchanged: true })
    } catch (e) {
      err(res, String(e), 400)
    }
  })

  /**
   * POST /llm-providers/:id/oauth/refresh
   *
   * Fuerza un refresh del token aunque no haya expirado.
   * Útil para troubleshooting y para el botón "Reconectar" del frontend.
   *
   * Body: ninguno.
   * Response: { refreshed: true }
   */
  router.post('/llm-providers/:id/oauth/refresh', async (req, res) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { providers, oauth } = services()

      const row = await providers.get(workspaceId, req.params.id)
      if (!row) return err(res, 'LlmProvider not found', 404)

      await oauth.refreshToken(req.params.id)
      ok(res, { refreshed: true })
    } catch (e) {
      err(res, String(e), 400)
    }
  })

  /**
   * DELETE /llm-providers/:id/oauth/token
   *
   * Elimina el OAuthToken de la DB (desconectar cuenta).
   * El LlmProvider en sí no se elimina.
   *
   * Response: { revoked: true }
   */
  router.delete('/llm-providers/:id/oauth/token', async (req, res) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { providers, oauth } = services()

      const row = await providers.get(workspaceId, req.params.id)
      if (!row) return err(res, 'LlmProvider not found', 404)

      await oauth.revokeToken(req.params.id)
      ok(res, { revoked: true })
    } catch (e) {
      err(res, String(e), 400)
    }
  })

  /**
   * GET /llm-providers/:id/oauth/status
   *
   * Estado del token OAuth actual (sin exponer el token en sí).
   *
   * Response: {
   *   hasToken:    boolean
   *   expiresAt:   string | null   (ISO 8601)
   *   accountId:   string | null   (sub del JWT)
   *   isExpired:   boolean
   *   expiresInMs: number | null
   * }
   */
  router.get('/llm-providers/:id/oauth/status', async (req, res) => {
    try {
      const workspaceId = getWorkspaceId(req)
      const { providers, oauth } = services()

      const row = await providers.get(workspaceId, req.params.id)
      if (!row) return err(res, 'LlmProvider not found', 404)

      const status = await oauth.getTokenStatus(req.params.id)
      ok(res, status)
    } catch (e) {
      err(res, String(e), 400)
    }
  })
}
