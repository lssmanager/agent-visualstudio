/**
 * routes/whatsapp-baileys.ts — [F3a-22]
 *
 * Router Express para gestión de sesiones WhatsApp Baileys.
 *
 * Endpoints:
 *   GET  /:configId/qr         → SSE stream (eventos: qr, status, heartbeat)
 *   GET  /:configId/status     → JSON snapshot {status, hasQr}
 *   POST /:configId/connect    → crea adapter, inicia setup() → connect()
 *   POST /:configId/disconnect → dispose() + elimina del store
 *
 * SECURITY: Estas rutas son públicas (sin X-Gateway-Token).
 * El flujo QR/connect requiere que el cliente pueda alcanzarlas sin
 * cabeceras de autenticación. Proteger a nivel de red/firewall si es necesario.
 */

import { Router, type Request, type Response } from 'express'
import { whatsappSessionStore }                from '../whatsapp-session.store.js'

type BaileysAdapterConstructable = new () => {
  readonly channel: string
  initialize(configId: string): void
  onQr(handler: (qr: string) => void): void
  onConnected(handler: () => void): void
  onDisconnected(handler: () => void): void
  setup(config: Record<string, unknown>, secrets: Record<string, unknown>): Promise<void>
  dispose(): Promise<void>
}

export const whatsappBaileysRouter = Router({ mergeParams: true })

// ── GET /:configId/qr — SSE ───────────────────────────────────────────────────
//
// Requiere que POST /:configId/connect haya sido llamado primero.
// Si no existe sesión, devuelve 404 en lugar de crear una entrada vacía
// con adapter=null que nunca producirá eventos QR reales.

whatsappBaileysRouter.get('/:configId/qr', (req: Request, res: Response): void => {
  const { configId } = req.params as { configId: string }

  if (!whatsappSessionStore.has(configId)) {
    res.status(404).json({
      error: `No active session for configId="${configId}". Call POST /:configId/connect first.`,
    })
    return
  }

  res.setHeader('Content-Type',      'text/event-stream')
  res.setHeader('Cache-Control',     'no-cache')
  res.setHeader('Connection',        'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  res.write(': connected\n\n')
  whatsappSessionStore.addSseClient(configId, res)

  const heartbeat = setInterval(() => {
    try { res.write(':heartbeat\n\n') } catch { clearInterval(heartbeat) }
  }, 25_000)

  req.on('close', () => {
    clearInterval(heartbeat)
  })
})

// ── GET /:configId/status ─────────────────────────────────────────────────────

whatsappBaileysRouter.get('/:configId/status', (req: Request, res: Response): void => {
  const { configId } = req.params as { configId: string }

  const entry = whatsappSessionStore.get(configId)
  if (!entry) {
    res.json({ status: 'not_connected', hasQr: false, configId })
    return
  }
  res.json({
    ok:     true,
    configId,
    status: entry.status ?? 'unknown',
    hasQr:  Boolean(entry.qrBuffer),
  })
})

// ── POST /:configId/connect ───────────────────────────────────────────────────

whatsappBaileysRouter.post('/:configId/connect', async (req: Request, res: Response): Promise<void> => {
  const { configId } = req.params as { configId: string }

  // Idempotency guard — evita race conditions y doble-connect
  const existing = whatsappSessionStore.get(configId)
  if (existing && existing.status !== 'disconnected' && existing.status !== 'error') {
    res.status(409).json({
      ok:     false,
      error:  'session already active',
      configId,
      status: existing.status,
    })
    return
  }

  try {
    // Reservar slot antes del primer await para bloquear llamadas concurrentes
    whatsappSessionStore.setStatus(configId, 'connecting')

    let AdapterClass: BaileysAdapterConstructable
    try {
      const mod = await import('../channels/whatsapp-baileys.adapter.js') as any
      AdapterClass = (mod.WhatsAppBaileysAdapter ?? mod.default) as BaileysAdapterConstructable
    } catch {
      whatsappSessionStore.setStatus(configId, 'error')
      res.status(503).json({
        ok:    false,
        error: 'WhatsAppBaileysAdapter not available — install @whiskeysockets/baileys',
      })
      return
    }

    const adapter = new AdapterClass()
    adapter.initialize(configId)

    adapter.onQr((qr: string) => {
      console.info(`[wa-route] QR received for configId=${configId}`)
      whatsappSessionStore.setQr(configId, qr)
    })

    adapter.onConnected(() => {
      console.info(`[wa-route] Connected configId=${configId}`)
      whatsappSessionStore.setStatus(configId, 'connected')
    })

    adapter.onDisconnected(() => {
      console.info(`[wa-route] Disconnected configId=${configId}`)
      whatsappSessionStore.setStatus(configId, 'disconnected')
    })

    whatsappSessionStore.setAdapter(configId, adapter)

    const { config = {}, secrets = {} } = (req.body ?? {}) as {
      config?:  Record<string, unknown>
      secrets?: Record<string, unknown>
    }

    // Fire-and-forget: setup() → connect() internamente
    adapter.setup(config, secrets).catch((err: Error) => {
      console.error(`[wa-route] setup() error — configId=${configId}:`, err.message)
      whatsappSessionStore.setStatus(configId, 'error')
    })

    res.status(202).json({ ok: true, status: 'connecting', configId })
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    whatsappSessionStore.setStatus(configId, 'error')
    console.error(`[wa-route] connect error — configId=${configId}:`, msg)
    res.status(500).json({ ok: false, error: msg })
  }
})

// ── POST /:configId/disconnect ────────────────────────────────────────────────

whatsappBaileysRouter.post('/:configId/disconnect', async (req: Request, res: Response): Promise<void> => {
  const { configId } = req.params as { configId: string }

  const entry = whatsappSessionStore.get(configId)
  if (!entry || !entry.adapter) {
    res.status(404).json({ ok: false, error: 'session not found', configId })
    return
  }

  try {
    await entry.adapter.dispose()
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[wa-route] dispose() error — configId=${configId}:`, msg)
  }

  whatsappSessionStore.remove(configId)
  res.json({ ok: true, configId })
})
