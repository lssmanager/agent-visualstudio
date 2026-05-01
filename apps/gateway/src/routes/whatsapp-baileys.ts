/**
 * routes/whatsapp-baileys.ts — [F3a-22]
 *
 * Router Express para gestionar sesiones WhatsApp Baileys:
 *
 *   GET  /gateway/whatsapp/:configId/qr          — SSE: emite eventos 'qr' y 'status'
 *   GET  /gateway/whatsapp/:configId/status       — JSON: {status, hasQr, configId}
 *   POST /gateway/whatsapp/:configId/connect      — Inicia adaptador y lo registra en el store
 *   POST /gateway/whatsapp/:configId/disconnect   — Detiene adaptador y lo elimina del store
 *
 * El QR se transmite como SSE (text/event-stream) en lugar de WebSocket:
 *   - El QR se escanea una sola vez por sesión.
 *   - HTTP unidireccional — no requiere upgrade, funciona detrás de cualquier proxy.
 *   - Mismo patrón que ya usa webchat para el stream de mensajes.
 *
 * Formato de eventos SSE:
 *   event: qr\ndata: <string QR raw o data-url PNG>\n\n
 *   event: status\ndata: connecting|qr_ready|connected|disconnected|error\n\n
 *
 * Seguridad:
 *   - Los endpoints POST requieren JWT (aplicado en server.ts via applySecurityMiddleware).
 *   - El endpoint GET /qr es público para permitir embeber el visor de QR en la UI.
 *     Si se necesita autenticar, añadir el middleware JWT antes de whatsappBaileysRouter.
 */

import { Router, type Request, type Response } from 'express'
import { whatsappSessionStore }               from '../whatsapp-session.store.js'

// ── Tipos mínimos del adapter (evita importación circular) ───────────────────

/**
 * Interfaz de construcción del adapter Baileys.
 * El adapter real (WhatsAppBaileysAdapter) se importa dinámicamente
 * para no forzar la dependencia @whiskeysockets/baileys en todos los tests.
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

// ── Factory ───────────────────────────────────────────────────────────────────

export function whatsappBaileysRouter(): Router {
  const router = Router({ mergeParams: true })

  // ── GET /:configId/qr — SSE stream ──────────────────────────────────────
  /**
   * Abre un stream SSE para recibir eventos de QR y estado.
   *
   * El cliente debe abrir:
   *   const es = new EventSource('/gateway/whatsapp/<configId>/qr')
   *   es.addEventListener('qr', e => renderQr(e.data))
   *   es.addEventListener('status', e => updateStatus(e.data))
   *
   * La conexión permanece abierta hasta que el cliente la cierra
   * o el adapter se desconecta (evento 'status': 'connected' | 'disconnected').
   */
  router.get('/:configId/qr', (req: Request, res: Response): void => {
    const { configId } = req.params

    res.setHeader('Content-Type',  'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection',    'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // desactivar buffering Nginx
    res.flushHeaders()

    // Comentario inicial para mantener la conexión viva en algunos proxies
    res.write(': connected\n\n')

    // Registrar este cliente en el store
    // (si ya hay QR o estado, se envía inmediatamente dentro de addSseClient)
    whatsappSessionStore.addSseClient(configId, res)

    // Heartbeat cada 25s para evitar timeouts de proxy
    const heartbeat = setInterval(() => {
      try { res.write(': heartbeat\n\n') } catch { clearInterval(heartbeat) }
    }, 25_000)

    res.on('close', () => {
      clearInterval(heartbeat)
    })
  })

  // ── GET /:configId/status — JSON snapshot ───────────────────────────────
  /**
   * Retorna el estado actual de la sesión sin abrir un stream.
   * Útil para polling inicial o health check de la UI.
   *
   * Response:
   *   200 { ok: true,  configId, status, hasQr }
   *   404 { ok: false, error: 'session not found' }
   */
  router.get('/:configId/status', (req: Request, res: Response): void => {
    const { configId } = req.params
    const entry = whatsappSessionStore.get(configId)

    if (!entry) {
      res.status(404).json({ ok: false, error: 'session not found', configId })
      return
    }

    res.json({
      ok:       true,
      configId,
      status:   entry.status,
      hasQr:    !!entry.qrBuffer,
    })
  })

  // ── POST /:configId/connect — Iniciar sesión ─────────────────────────────
  /**
   * Crea e inicializa un WhatsAppBaileysAdapter para este configId.
   * Si ya existe una sesión activa para el mismo configId, retorna 409.
   *
   * Body (opcional):
   *   { config?: Record<string,unknown>, secrets?: Record<string,unknown> }
   *
   * Response:
   *   200 { ok: true, configId, status: 'connecting' }
   *   409 { ok: false, error: 'session already active' }
   *   500 { ok: false, error: string }
   */
  router.post('/:configId/connect', async (req: Request, res: Response): Promise<void> => {
    const { configId } = req.params
    const existing = whatsappSessionStore.get(configId)

    if (existing && existing.status !== 'disconnected' && existing.status !== 'error') {
      res.status(409).json({
        ok:    false,
        error: 'session already active',
        configId,
        status: existing.status,
      })
      return
    }

    try {
      // Importación dinámica — el adapter real puede no estar disponible en tests
      let AdapterClass: BaileysAdapterConstructable
      try {
        const mod = await import('../channels/whatsapp.adapter.js')
        AdapterClass = (mod.WhatsAppBaileysAdapter ?? mod.default) as BaileysAdapterConstructable
      } catch {
        // Fallback para entornos sin @whiskeysockets/baileys (tests, CI sin deps)
        res.status(503).json({
          ok:    false,
          error: 'WhatsAppBaileysAdapter not available — install @whiskeysockets/baileys',
        })
        return
      }

      const adapter = new AdapterClass(configId)

      // Registrar callbacks ANTES de setup() para no perder el primer QR
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

      // Registrar en el store ANTES de setup() para que los callbacks
      // ya tengan un entry donde escribir el QR
      whatsappSessionStore.setAdapter(configId, adapter)
      whatsappSessionStore.setStatus(configId, 'connecting')

      const { config = {}, secrets = {} } = (req.body ?? {}) as {
        config?:  Record<string, unknown>
        secrets?: Record<string, unknown>
      }

      // setup() es async — no esperamos el QR aquí, llega vía callback
      adapter.setup(config, secrets).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[whatsapp-store] setup() error for configId=${configId}:`, msg)
        whatsappSessionStore.setStatus(configId, 'error')
      })

      res.json({ ok: true, configId, status: 'connecting' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      res.status(500).json({ ok: false, error: msg })
    }
  })

  // ── POST /:configId/disconnect — Detener sesión ──────────────────────────
  /**
   * Llama dispose() en el adapter y elimina la sesión del store.
   * Cierra todos los streams SSE abiertos para este configId.
   *
   * Response:
   *   200 { ok: true, configId }
   *   404 { ok: false, error: 'session not found' }
   *   500 { ok: false, error: string }
   */
  router.post('/:configId/disconnect', async (req: Request, res: Response): Promise<void> => {
    const { configId } = req.params
    const entry = whatsappSessionStore.get(configId)

    if (!entry) {
      res.status(404).json({ ok: false, error: 'session not found', configId })
      return
    }

    try {
      await entry.adapter.dispose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[whatsapp-store] dispose() error for configId=${configId}:`, msg)
      // No relanzamos — queremos limpiar el store igualmente
    }

    whatsappSessionStore.remove(configId)
    res.json({ ok: true, configId })
  })

  return router
}
