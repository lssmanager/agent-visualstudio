/**
 * settings.routes.ts
 *
 * Express routes for Settings API.
 * Registered in apps/api/src/routes.ts as registerSettingsRoutes(router).
 *
 * Endpoints:
 *
 *   GET    /settings/providers
 *   PATCH  /settings/providers/:providerId/key    body: { apiKey }
 *   DELETE /settings/providers/:providerId/key
 *   POST   /settings/providers/:providerId/test   body: { modelId }
 *
 *   GET    /settings/n8n
 *   PATCH  /settings/n8n                          body: { baseUrl, apiKey }
 *   POST   /settings/n8n/test
 *
 * Security note: API key values are NEVER returned in any response.
 * hasKey is a boolean — the actual key lives only in SystemConfig.
 */

import { Router } from 'express'
import { getPrisma } from '../../lib/prisma'
import { SettingsService } from './settings.service'

function makeService(): SettingsService {
  return new SettingsService(getPrisma())
}

export function registerSettingsRoutes(router: Router): void {

  // ── GET /settings/providers ───────────────────────────────────────────────
  router.get('/settings/providers', async (_req, res) => {
    try {
      const providers = await makeService().listProviders()
      res.json(providers)
    } catch (err) {
      console.error('[settings] listProviders error', err)
      res.status(500).json({ error: 'Failed to list providers' })
    }
  })

  // ── PATCH /settings/providers/:providerId/key ─────────────────────────────
  router.patch('/settings/providers/:providerId/key', async (req, res) => {
    const { providerId } = req.params as { providerId: string }
    const { apiKey }     = req.body as { apiKey?: string }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      res.status(400).json({ error: 'apiKey must be a non-empty string' })
      return
    }

    try {
      await makeService().setProviderKey(providerId, apiKey.trim())
      res.json({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const status = msg.includes('not found') ? 404 : 400
      res.status(status).json({ error: msg })
    }
  })

  // ── DELETE /settings/providers/:providerId/key ────────────────────────────
  router.delete('/settings/providers/:providerId/key', async (req, res) => {
    const { providerId } = req.params as { providerId: string }
    try {
      await makeService().deleteProviderKey(providerId)
      res.json({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const status = msg.includes('not found') ? 404 : 400
      res.status(status).json({ error: msg })
    }
  })

  // ── POST /settings/providers/:providerId/test ─────────────────────────────
  router.post('/settings/providers/:providerId/test', async (req, res) => {
    const { providerId } = req.params as { providerId: string }
    const { modelId }    = req.body as { modelId?: string }

    if (!modelId || typeof modelId !== 'string') {
      res.status(400).json({ error: 'modelId is required' })
      return
    }

    try {
      const result = await makeService().testProvider(providerId, modelId)
      res.json(result)
    } catch (err) {
      console.error('[settings] testProvider error', err)
      res.status(500).json({ ok: false, model: modelId, latencyMs: 0, error: String(err) })
    }
  })

  // ── GET /settings/n8n ─────────────────────────────────────────────────────
  router.get('/settings/n8n', async (_req, res) => {
    try {
      const cfg = await makeService().getN8n()
      res.json(cfg)
    } catch (err) {
      console.error('[settings] getN8n error', err)
      res.status(500).json({ error: 'Failed to get n8n config' })
    }
  })

  // ── PATCH /settings/n8n ───────────────────────────────────────────────────
  router.patch('/settings/n8n', async (req, res) => {
    const { baseUrl, apiKey } = req.body as { baseUrl?: string; apiKey?: string }

    if (!baseUrl || typeof baseUrl !== 'string' || baseUrl.trim() === '') {
      res.status(400).json({ error: 'baseUrl is required' })
      return
    }
    if (!apiKey || typeof apiKey !== 'string') {
      res.status(400).json({ error: 'apiKey is required' })
      return
    }

    try {
      await makeService().setN8n(baseUrl.trim(), apiKey)
      res.json({ ok: true })
    } catch (err) {
      console.error('[settings] setN8n error', err)
      res.status(500).json({ error: 'Failed to save n8n config' })
    }
  })

  // ── POST /settings/n8n/test ───────────────────────────────────────────────
  router.post('/settings/n8n/test', async (_req, res) => {
    try {
      const result = await makeService().testN8n()
      res.json(result)
    } catch (err) {
      console.error('[settings] testN8n error', err)
      res.status(500).json({ ok: false, workflowCount: 0, error: String(err) })
    }
  })
}
