/**
 * routes/whatsapp-baileys.ts - [F3a-22]
 *
 * Express router for WhatsApp Baileys sessions:
 *
 *   GET  /gateway/whatsapp/:configId/qr          - SSE stream for QR/status
 *   GET  /gateway/whatsapp/:configId/status      - JSON snapshot
 *   POST /gateway/whatsapp/:configId/connect     - start adapter and register it
 *   POST /gateway/whatsapp/:configId/disconnect  - stop adapter and remove it
 *
 * The QR stream is SSE so the UI can subscribe without WebSocket upgrades.
 * Connect/disconnect/QR are protected with the existing Logto JWT middleware.
 */

import { Router, type Request, type Response } from 'express'
import { logtoJwtMiddleware } from '../middleware/security.middleware.js'
import { whatsappSessionStore } from '../whatsapp-session.store.js'

/**
 * Minimal constructor contract for the Baileys adapter.
 * The real adapter is imported dynamically to avoid hard coupling in tests.
 */
interface BaileysAdapterConstructable {
  new (configId: string): {
    readonly channel: string
    onQr(handler: (qr: string) => void): void
    onConnected(handler: () => void): void
    onDisconnected(handler: () => void): void
    setup(config: Record<string, unknown>, secrets: Record<string, unknown>): Promise<void>
    dispose(): Promise<void>
  }
}

export function whatsappBaileysRouter(): Router {
  const router = Router({ mergeParams: true })
  const requireJwt = logtoJwtMiddleware()

  router.get('/:configId/qr', requireJwt, (req: Request, res: Response): void => {
    const { configId } = req.params

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    res.write(': connected\n\n')
    whatsappSessionStore.addSseClient(configId, res)

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n')
      } catch {
        clearInterval(heartbeat)
      }
    }, 25_000)

    res.on('close', () => {
      clearInterval(heartbeat)
    })
  })

  router.get('/:configId/status', (req: Request, res: Response): void => {
    const { configId } = req.params
    const entry = whatsappSessionStore.get(configId)

    if (!entry) {
      res.status(404).json({ ok: false, error: 'session not found', configId })
      return
    }

    res.json({
      ok: true,
      configId,
      status: entry.status,
      hasQr: !!entry.qrBuffer,
    })
  })

  router.post('/:configId/connect', requireJwt, async (req: Request, res: Response): Promise<void> => {
    const { configId } = req.params
    const existing = whatsappSessionStore.get(configId)

    if (existing && existing.status !== 'disconnected' && existing.status !== 'error') {
      res.status(409).json({
        ok: false,
        error: 'session already active',
        configId,
        status: existing.status,
      })
      return
    }

    try {
      // Reserve the slot before the first await so concurrent connect calls fail.
      whatsappSessionStore.setStatus(configId, 'connecting')

      let AdapterClass: BaileysAdapterConstructable
      try {
        const mod = await import('../channels/whatsapp.adapter.js')
        AdapterClass = mod.WhatsAppAdapter as unknown as BaileysAdapterConstructable
      } catch {
        whatsappSessionStore.setStatus(configId, 'error')
        res.status(503).json({
          ok: false,
          error: 'WhatsAppBaileysAdapter not available - install @whiskeysockets/baileys',
        })
        return
      }

      const adapter = new AdapterClass(configId)

      adapter.onQr((qr: string) => {
        console.info(`[whatsapp-store] QR received for configId=${configId}`)
        whatsappSessionStore.setQr(configId, qr)
      })

      adapter.onConnected(() => {
        console.info(`[whatsapp-store] Connected configId=${configId}`)
        whatsappSessionStore.setStatus(configId, 'connected')
      })

      adapter.onDisconnected(() => {
        console.info(`[whatsapp-store] Disconnected configId=${configId}`)
        whatsappSessionStore.setStatus(configId, 'disconnected')
      })

      whatsappSessionStore.setAdapter(configId, adapter)

      const { config = {}, secrets = {} } = (req.body ?? {}) as {
        config?: Record<string, unknown>
        secrets?: Record<string, unknown>
      }

      adapter.setup(config, secrets).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[whatsapp-store] setup() error for configId=${configId}:`, msg)
        whatsappSessionStore.setStatus(configId, 'error')
      })

      res.json({ ok: true, configId, status: 'connecting' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      whatsappSessionStore.setStatus(configId, 'error')
      res.status(500).json({ ok: false, error: msg })
    }
  })

  router.post('/:configId/disconnect', requireJwt, async (req: Request, res: Response): Promise<void> => {
    const { configId } = req.params
    const entry = whatsappSessionStore.get(configId)

    if (!entry || !entry.adapter) {
      res.status(404).json({ ok: false, error: 'session not found', configId })
      return
    }

    try {
      await entry.adapter.dispose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[whatsapp-store] dispose() error for configId=${configId}:`, msg)
    }

    whatsappSessionStore.remove(configId)
    res.json({ ok: true, configId })
  })

  return router
}
