/**
 * routes/whatsapp-baileys.ts — Router Express para WhatsApp Baileys
 * [F3a-22]
 *
 * Rutas:
 *   GET  /gateway/whatsapp/:configId/qr         — SSE stream del QR
 *   GET  /gateway/whatsapp/:configId/status      — estado del adapter
 *   POST /gateway/whatsapp/:configId/connect     — conectar (lazy-connect)
 *   POST /gateway/whatsapp/:configId/disconnect  — desconectar y limpiar
 *
 * Autenticación:
 *   Las rutas están bajo /gateway/whatsapp que el security middleware
 *   protege con JWT (X-Gateway-Token). Ver security.middleware.ts.
 *   En desarrollo con REQUIRE_AUTH=false, las rutas son accesibles sin token.
 *
 * SSE (Server-Sent Events):
 *   El endpoint /qr usa el protocolo SSE estándar:
 *     Content-Type: text/event-stream
 *     Cache-Control: no-cache
 *     Connection: keep-alive
 *
 *   Formato de los eventos:
 *     event: qr
 *     data: <qr-string>\n\n
 *
 *     event: state
 *     data: <connecting|qr|open|closed|reconnecting>\n\n
 *
 *     event: heartbeat
 *     data: ok\n\n
 *
 *   El cliente puede parsear el QR string con la librería 'qrcode' para
 *   renderizarlo como imagen en el browser.
 *
 * Ciclo de vida típico:
 *   1. Admin abre GET /qr → conexión SSE establecida
 *   2. POST /connect → adapter inicia Baileys, emite QR via SSE
 *   3. Admin escanea QR con WhatsApp → estado cambia a 'open'
 *   4. SSE recibe event: state / data: open
 *   5. Admin cierra el stream SSE (ya no necesita el QR)
 */

import { Router, type Request, type Response } from 'express'
import { whatsappSessionStore }               from '../whatsapp-session.store.js'
import { type SseEvent }                      from '../whatsapp-session.store.js'

// Heartbeat interval en ms — mantiene la conexión SSE viva detrás de proxies
const SSE_HEARTBEAT_INTERVAL_MS = 20_000

// ── Helper SSE ────────────────────────────────────────────────────────────────

/**
 * Serializa un SseEvent al formato SSE estándar:
 *   event: <type>\ndata: <data>\n\n
 */
function formatSseEvent(event: SseEvent): string {
  const data = typeof event.data === 'string' ? event.data : JSON.stringify(event.data)
  return `event: ${event.type}\ndata: ${data}\n\n`
}

// ── Router factory ────────────────────────────────────────────────────────────

/**
 * Crea el router de WhatsApp Baileys.
 * Recibe el store como dependencia para facilitar el testing.
 */
export function whatsappBaileysRouter(
  store = whatsappSessionStore,
): Router {
  const router = Router()

  // ──────────────────────────────────────────────────────────────────────────
  // GET /gateway/whatsapp/:configId/qr
  // SSE stream — emite QR codes y cambios de estado
  // ──────────────────────────────────────────────────────────────────────────

  router.get('/:configId/qr', async (req: Request, res: Response) => {
    const { configId } = req.params as { configId: string }

    // Headers SSE
    res.setHeader('Content-Type',  'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection',    'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')  // Nginx: deshabilitar buffering
    res.flushHeaders()

    // Asegurar que el adapter existe (sin conectar — lazy)
    // Los secrets/config se cargan vacíos aquí; GatewayService ya habrá
    // llamado getOrCreate() con los secrets reales al activar el canal.
    if (!store.has(configId)) {
      await store.getOrCreate(configId, {}, {})
    }

    // Función que escribe en la Response
    const subscriber = (event: SseEvent): void => {
      if (res.writableEnded) return
      res.write(formatSseEvent(event))
    }

    // Suscribir al store (también envía QR buffered + estado actual)
    const unsubscribe = store.subscribe(configId, subscriber)

    // Heartbeat periódico
    const heartbeatTimer = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(heartbeatTimer)
        return
      }
      try {
        res.write(formatSseEvent({ type: 'heartbeat', data: 'ok' }))
      } catch {
        clearInterval(heartbeatTimer)
      }
    }, SSE_HEARTBEAT_INTERVAL_MS)

    // Limpiar al desconectarse el cliente
    req.on('close', () => {
      clearInterval(heartbeatTimer)
      unsubscribe()
      console.info(`[whatsapp-router] SSE client disconnected: configId=${configId}`)
    })

    console.info(`[whatsapp-router] SSE client connected: configId=${configId}`)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // GET /gateway/whatsapp/:configId/status
  // Retorna el estado actual del adapter para un configId
  // ──────────────────────────────────────────────────────────────────────────

  router.get('/:configId/status', (req: Request, res: Response) => {
    const { configId } = req.params as { configId: string }

    const statuses = store.getStatus(configId)

    if (statuses.length === 0) {
      res.status(404).json({
        ok:    false,
        error: `No session found for configId=${configId}`,
      })
      return
    }

    res.json({ ok: true, session: statuses[0] })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // GET /gateway/whatsapp/sessions
  // Lista todas las sesiones activas (para el dashboard admin)
  // ──────────────────────────────────────────────────────────────────────────

  router.get('/sessions', (_req: Request, res: Response) => {
    res.json({ ok: true, sessions: store.getStatus() })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // POST /gateway/whatsapp/:configId/connect
  // Inicia la conexión Baileys (lazy-connect, idempotente)
  // ──────────────────────────────────────────────────────────────────────────

  router.post('/:configId/connect', async (req: Request, res: Response) => {
    const { configId } = req.params as { configId: string }

    // Extraer config/secrets opcionales del body
    // En producción, GatewayService ya llamó getOrCreate() con los secrets reales.
    // Aquí solo se usa si el adapter aún no existe (llamada manual desde admin UI).
    const { config = {}, secrets = {} } = req.body as {
      config?:  Record<string, unknown>
      secrets?: Record<string, unknown>
    }

    try {
      const adapter = await store.getOrCreate(configId, config, secrets)

      // Iniciar conexión Baileys si no está ya conectado
      const state = adapter.getState()
      if (state === 'open') {
        res.json({ ok: true, message: 'Already connected', state })
        return
      }

      // No await — connect() puede tardar hasta 2 min esperando QR
      // El cliente recibe el QR via SSE stream
      adapter.connect().catch((err: unknown) => {
        console.error(`[whatsapp-router] connect() error configId=${configId}:`, err)
      })

      res.json({
        ok:      true,
        message: 'Connection initiated — subscribe to SSE /qr for QR code',
        state:   adapter.getState(),
        sseUrl:  `/gateway/whatsapp/${configId}/qr`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      res.status(500).json({ ok: false, error: msg })
    }
  })

  // ──────────────────────────────────────────────────────────────────────────
  // POST /gateway/whatsapp/:configId/disconnect
  // Desconecta el adapter y elimina la sesión del store
  // ──────────────────────────────────────────────────────────────────────────

  router.post('/:configId/disconnect', async (req: Request, res: Response) => {
    const { configId } = req.params as { configId: string }

    if (!store.has(configId)) {
      res.status(404).json({
        ok:    false,
        error: `No active session for configId=${configId}`,
      })
      return
    }

    try {
      await store.remove(configId)
      res.json({ ok: true, message: `Session ${configId} disconnected and removed` })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      res.status(500).json({ ok: false, error: msg })
    }
  })

  return router
}
