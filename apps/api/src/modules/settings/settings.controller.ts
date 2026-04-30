import { Router } from 'express'
import { SettingsService, NotFoundError, BadRequestError } from './settings.service'

export function registerSettingsRoutes(router: Router) {
  const service = new SettingsService()

  // ── GET /settings/providers ──────────────────────────────────────────────
  // Lista todos los providers. hasKey = true/false, NUNCA devuelve el valor.
  router.get('/settings/providers', async (_req, res) => {
    try {
      res.json(await service.listProviders())
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message })
    }
  })

  // ── PATCH /settings/providers/:providerId/key ────────────────────────────
  // Guarda la API key en SystemConfig (BD). NO modifica .env.
  router.patch('/settings/providers/:providerId/key', async (req, res) => {
    const { apiKey } = req.body as { apiKey?: string }
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      return res.status(400).json({ ok: false, error: 'apiKey is required' })
    }
    try {
      await service.setProviderKey(req.params.providerId, apiKey.trim())
      return res.json({ ok: true })
    } catch (err) {
      if (err instanceof NotFoundError)   return res.status(404).json({ ok: false, error: err.message })
      if (err instanceof BadRequestError) return res.status(400).json({ ok: false, error: err.message })
      return res.status(500).json({ ok: false, error: (err as Error).message })
    }
  })

  // ── DELETE /settings/providers/:providerId/key ───────────────────────────
  // Elimina la key de BD — el sistema vuelve a leer process.env como fallback.
  router.delete('/settings/providers/:providerId/key', async (req, res) => {
    try {
      await service.deleteProviderKey(req.params.providerId)
      return res.json({ ok: true })
    } catch (err) {
      if (err instanceof NotFoundError)   return res.status(404).json({ ok: false, error: err.message })
      if (err instanceof BadRequestError) return res.status(400).json({ ok: false, error: err.message })
      return res.status(500).json({ ok: false, error: (err as Error).message })
    }
  })

  // ── POST /settings/providers/:providerId/test ────────────────────────────
  // Llama al LLM con 1 token para validar que la key funciona.
  router.post('/settings/providers/:providerId/test', async (req, res) => {
    const { modelId } = req.body as { modelId?: string }
    if (!modelId || typeof modelId !== 'string') {
      return res.status(400).json({ ok: false, error: 'modelId is required' })
    }
    try {
      res.json(await service.testProvider(req.params.providerId, modelId))
    } catch (err) {
      if (err instanceof NotFoundError) return res.status(404).json({ ok: false, error: err.message })
      return res.status(500).json({ ok: false, error: (err as Error).message })
    }
  })

  // ── GET /settings/n8n ───────────────────────────────────────────────────
  router.get('/settings/n8n', async (_req, res) => {
    try {
      res.json(await service.getN8n())
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message })
    }
  })

  // ── PATCH /settings/n8n ─────────────────────────────────────────────────
  // Guarda N8N_BASE_URL y N8N_API_KEY en SystemConfig.
  router.patch('/settings/n8n', async (req, res) => {
    const { baseUrl, apiKey } = req.body as { baseUrl?: string; apiKey?: string }
    if (!baseUrl || typeof baseUrl !== 'string') {
      return res.status(400).json({ ok: false, error: 'baseUrl is required' })
    }
    try {
      await service.setN8n(baseUrl.trim(), (apiKey ?? '').trim())
      return res.json({ ok: true })
    } catch (err) {
      return res.status(500).json({ ok: false, error: (err as Error).message })
    }
  })

  // ── POST /settings/n8n/test ─────────────────────────────────────────────
  // Llama GET /api/v1/workflows en la instancia n8n configurada.
  router.post('/settings/n8n/test', async (_req, res) => {
    try {
      res.json(await service.testN8n())
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message })
    }
  })
}
