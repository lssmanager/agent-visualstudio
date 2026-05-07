/**
 * n8n-webhook.adapter.ts — [F4a-03]
 *
 * WebhookAdapter específico para triggers n8n → agentes.
 *
 * Diferencias con el WebhookAdapter genérico:
 *   - Entiende el schema de payload que n8n envía (body.data o body directo)
 *   - Implementa IHttpChannelAdapter con getRouter() para auto-registro de rutas
 *   - Soporta respuesta síncrona (callbackUrl === 'sync') y asíncrona (POST a callbackUrl)
 *   - HMAC-SHA256 signature verification con header X-N8N-Signature (opcional)
 *   - Reintentos con backoff exponencial en entrega asíncrona
 *
 * Flujo:
 *   n8n POST /gateway/n8n-webhook/:channelConfigId
 *     └── N8nWebhookAdapter.handleTrigger()
 *           ├── verificar HMAC (si webhookSecret configurado)
 *           ├── normalizar payload → IncomingMessage
 *           ├── emit() → SessionManager → AgentResolver → LLM
 *           └── responder:
 *                 ├── callbackUrl === 'sync' → esperar respuesta y devolver JSON
 *                 ├── callbackUrl presente   → ACK inmediato + POST async a callbackUrl
 *                 └── sin callbackUrl        → ACK inmediato { received: true, runId }
 *
 * @module n8n-webhook.adapter
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Router, Request, Response } from 'express'
import { Router as createRouter } from 'express'
import type {
  IncomingMessage,
  OutgoingMessage,
} from './channel-adapter.interface'
import type { IHttpChannelAdapter } from './channel-adapter.interface'
import { BaseChannelAdapter }        from './channel-adapter.interface'

// ── Tipos n8n ─────────────────────────────────────────────────────────────────

/**
 * Payload que n8n envía al trigger webhook.
 *
 * n8n puede enviar el mensaje en `body.data` (cuando usa el nodo Webhook con
 * "Response Mode: On Received") o directamente en `body` (modo passthrough).
 *
 * @see https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/
 */
interface N8nTriggerPayload {
  /** Datos principales del trigger — campo preferido */
  data?: {
    text?:       string
    message?:    string
    senderId?:   string
    externalId?: string
    sessionId?:  string
    metadata?:   Record<string, unknown>
    [key: string]: unknown
  }
  /** Texto directo cuando n8n envía body plano */
  text?:       string
  message?:    string
  senderId?:   string
  externalId?: string
  sessionId?:  string
  metadata?:   Record<string, unknown>
  [key: string]: unknown
}

/**
 * Payload que N8nWebhookAdapter entrega al callbackUrl de n8n
 * después de procesar la respuesta del agente.
 */
export interface N8nCallbackPayload {
  /** ID del canal que procesó el mensaje */
  channelConfigId: string
  /** ID externo de la conversación (para que n8n correlacione la respuesta) */
  externalId:      string
  /** Texto de la respuesta del agente */
  text:            string
  /** Contenido enriquecido del agente (si lo hay) */
  richContent?:    OutgoingMessage['richContent']
  /** Metadatos adicionales */
  metadata?:       Record<string, unknown>
  /** Timestamp ISO 8601 de la respuesta */
  respondedAt:     string
}

/**
 * Respuesta ACK inmediata que el adapter devuelve a n8n
 * cuando opera en modo asíncrono.
 */
interface N8nAckResponse {
  received:        boolean
  runId:           string
  channelConfigId: string
  queuedAt:        string
}

// ── Errores tipados ───────────────────────────────────────────────────────────

export type N8nWebhookErrorCode =
  | 'INVALID_SIGNATURE'
  | 'MISSING_TEXT'
  | 'CALLBACK_DELIVERY_FAILED'
  | 'CONFIG_NOT_FOUND'
  | 'INTERNAL_ERROR'

export class N8nWebhookError extends Error {
  constructor(
    public readonly code: N8nWebhookErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'N8nWebhookError'
  }
}

// ── Constantes ────────────────────────────────────────────────────────────────

const SIGNATURE_HEADER   = 'x-n8n-signature'
const MAX_SYNC_WAIT_MS   = 30_000   // 30s timeout para respuesta síncrona
const RETRY_DELAYS_MS    = [1_000, 2_000, 4_000]  // backoff exponencial (3 intentos)

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * Adaptador para triggers n8n → agentes del gateway.
 *
 * Registra automáticamente la ruta `POST /:channelConfigId` en Express
 * implementando {@link IHttpChannelAdapter}.
 *
 * @example
 * ```ts
 * // En ChannelRouter (auto-detección via duck-typing):
 * if ('getRouter' in adapter) {
 *   app.use('/gateway/n8n-webhook', adapter.getRouter())
 * }
 *
 * // n8n envía:
 * // POST /gateway/n8n-webhook/uuid-del-channel-config
 * // Body: { "data": { "text": "Analiza estas ventas", "senderId": "workflow-42" } }
 * ```
 */
export class N8nWebhookAdapter
  extends    BaseChannelAdapter
  implements IHttpChannelAdapter
{
  readonly channel = 'webhook' as const

  /** callbackUrl del ChannelConfig — 'sync' para modo síncrono, URL para async */
  private callbackUrl   = ''
  /** Secreto HMAC para verificar firmas de n8n (opcional) */
  private webhookSecret = ''
  /** Map runId → resolver de respuesta (para modo síncrono) */
  private pendingSync   = new Map<string, (msg: OutgoingMessage) => void>()

  // ── IChannelAdapter ──────────────────────────────────────────────────────

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId

    const config = await this.loadConfig(channelConfigId)
    const cfg    = config.config as Record<string, unknown>

    this.callbackUrl   = (cfg.callbackUrl   as string) ?? ''
    this.webhookSecret = (cfg.webhookSecret as string) ?? ''
  }

  async dispose(): Promise<void> {
    // Resolver todos los sync pendientes con error para no dejar conexiones colgadas
    for (const resolver of this.pendingSync.values()) {
      resolver({ externalId: '', text: '[gateway] Adapter disposed before response' })
    }
    this.pendingSync.clear()
    this.callbackUrl   = ''
    this.webhookSecret = ''
  }

  /**
   * Envía la respuesta del agente de vuelta a n8n.
   *
   * - Modo síncrono (`callbackUrl === 'sync'`): resuelve la Promise pendiente
   *   para que `handleTrigger` devuelva la respuesta en la misma conexión HTTP.
   * - Modo asíncrono: hace POST al callbackUrl con reintentos.
   * - Sin callbackUrl: descarta silenciosamente (fire-and-forget).
   */
  async send(message: OutgoingMessage): Promise<void> {
    // Modo síncrono — resolver la conexión HTTP que está esperando
    const syncResolver = this.pendingSync.get(message.externalId)
    if (syncResolver) {
      syncResolver(message)
      this.pendingSync.delete(message.externalId)
      return
    }

    if (!this.callbackUrl || this.callbackUrl === 'sync') {
      // Sin callbackUrl real → fire-and-forget
      if (this.callbackUrl !== 'sync') {
        console.warn(
          `[n8n-webhook] No callbackUrl for ${this.channelConfigId} — response dropped`,
        )
      }
      return
    }

    await this.deliverWithRetry(message)
  }

  // ── IHttpChannelAdapter ──────────────────────────────────────────────────

  /**
   * Devuelve el Router de Express con la ruta del trigger n8n.
   *
   * Registra:
   *   `POST /:channelConfigId` — endpoint que n8n invoca como webhook trigger
   *   `GET  /:channelConfigId` — endpoint de health/verification
   */
  getRouter(): Router {
    const router = createRouter()

    // GET /:channelConfigId — n8n verifica el webhook con GET antes de activarlo
    router.get('/:channelConfigId', (_req: Request, res: Response) => {
      res.json({ ok: true, adapter: 'n8n-webhook', version: 'F4a-03' })
    })

    // POST /:channelConfigId — trigger principal de n8n
    router.post('/:channelConfigId', async (req: Request, res: Response) => {
      const { channelConfigId } = req.params

      try {
        // Inicializar si la instancia es de un channelConfigId diferente
        // (el router puede recibir requests para múltiples configs)
        if (this.channelConfigId !== channelConfigId) {
          await this.initialize(channelConfigId)
        }

        await this.handleTrigger(req, res)
      } catch (err) {
        if (err instanceof N8nWebhookError) {
          const status = err.code === 'INVALID_SIGNATURE' ? 401
                       : err.code === 'MISSING_TEXT'      ? 400
                       : err.code === 'CONFIG_NOT_FOUND'  ? 404
                       : 500
          res.status(status).json({ error: err.code, message: err.message })
        } else {
          console.error('[n8n-webhook] Unhandled error in trigger:', err)
          res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal gateway error' })
        }
      }
    })

    return router
  }

  // ── Lógica principal ─────────────────────────────────────────────────────

  /**
   * Procesa el HTTP request de n8n y coordina la respuesta.
   */
  private async handleTrigger(req: Request, res: Response): Promise<void> {
    const body = req.body as N8nTriggerPayload

    // 1. Verificar firma HMAC (si webhookSecret está configurado)
    if (this.webhookSecret) {
      this.verifySignature(req)
    }

    // 2. Normalizar payload n8n → IncomingMessage
    const msg = this.normalizePayload(body)

    // 3. Modo síncrono: preparar Promise antes de emit() para no perder la respuesta
    const isSyncMode = this.callbackUrl === 'sync'
    let syncPromise: Promise<OutgoingMessage> | null = null

    if (isSyncMode) {
      syncPromise = new Promise<OutgoingMessage>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingSync.delete(msg.externalId)
          reject(new N8nWebhookError(
            'INTERNAL_ERROR',
            `[n8n-webhook] Sync response timeout after ${MAX_SYNC_WAIT_MS}ms for externalId=${msg.externalId}`,
          ))
        }, MAX_SYNC_WAIT_MS)

        this.pendingSync.set(msg.externalId, (outgoing) => {
          clearTimeout(timer)
          resolve(outgoing)
        })
      })
    }

    // 4. Despachar al gateway (SessionManager → AgentResolver → LLM)
    //    emit() es fire-and-forget — no esperamos aquí en modo async
    if (isSyncMode) {
      // En modo síncrono debemos emitir pero ya tenemos syncPromise lista
      void this.emit(msg)
    } else {
      void this.emit(msg)
    }

    // 5. Responder a n8n
    if (isSyncMode && syncPromise) {
      // Esperar la respuesta del agente y devolverla en la misma conexión
      const outgoing = await syncPromise
      const callbackPayload = this.buildCallbackPayload(outgoing)
      res.json(callbackPayload)
    } else {
      // Modo asíncrono — ACK inmediato
      const ack: N8nAckResponse = {
        received:        true,
        runId:           msg.externalId,
        channelConfigId: this.channelConfigId,
        queuedAt:        new Date().toISOString(),
      }
      res.status(202).json(ack)
    }
  }

  // ── Normalización de payload ──────────────────────────────────────────────

  /**
   * Normaliza el payload de n8n al tipo {@link IncomingMessage} canónico.
   *
   * n8n puede enviar:
   *   - `{ data: { text, senderId, ... } }` (modo Webhook node)
   *   - `{ text, senderId, ... }` (modo HTTP request directo)
   */
  private normalizePayload(body: N8nTriggerPayload): IncomingMessage {
    // n8n usa body.data cuando el nodo Webhook tiene "Response Mode: On Received"
    const data = body.data ?? body

    const text = (data.text ?? data.message ?? '') as string
    if (!text.trim()) {
      throw new N8nWebhookError(
        'MISSING_TEXT',
        '[n8n-webhook] Payload has no text or message field. ' +
        'Expected: { data: { text: "..." } } or { text: "..." }',
      )
    }

    // externalId: sessionId preferido (permite que n8n controle la sesión),
    //             luego externalId, luego channelConfigId como fallback punto a punto
    const externalId = (
      (data.sessionId  as string | undefined) ??
      (data.externalId as string | undefined) ??
      this.channelConfigId
    )

    const senderId = (data.senderId as string | undefined) ?? externalId

    // Preservar el payload raw para debugging y reglas custom del agente
    const metadata: Record<string, unknown> = {
      ...(data.metadata as Record<string, unknown> | undefined ?? {}),
      _n8nRaw: body,
    }

    return {
      channelConfigId: this.channelConfigId,
      channelType:     'webhook',
      externalId,
      senderId,
      text,
      type:            'text',
      metadata,
      rawPayload:      body,
      receivedAt:      this.makeTimestamp(),
    }
  }

  // ── HMAC Signature Verification ──────────────────────────────────────────

  /**
   * Verifica la firma HMAC-SHA256 del request de n8n.
   *
   * n8n firma el body con el secreto configurado en el nodo Webhook:
   *   Header: X-N8N-Signature: sha256=<hex>
   *
   * @throws {N8nWebhookError} con code 'INVALID_SIGNATURE' si la firma no coincide.
   */
  private verifySignature(req: Request): void {
    const signatureHeader = req.headers[SIGNATURE_HEADER] as string | undefined

    if (!signatureHeader) {
      throw new N8nWebhookError(
        'INVALID_SIGNATURE',
        `[n8n-webhook] Missing ${SIGNATURE_HEADER} header. ` +
        'Configure webhookSecret in ChannelConfig or disable signature verification.',
      )
    }

    // n8n envía: sha256=<hex digest>
    const [algo, providedHex] = signatureHeader.split('=')
    if (algo !== 'sha256' || !providedHex) {
      throw new N8nWebhookError(
        'INVALID_SIGNATURE',
        `[n8n-webhook] Unexpected signature format: ${signatureHeader}. Expected: sha256=<hex>`,
      )
    }

    // rawBody debe estar disponible (configurar express.raw() antes de json())
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody
    const bodyToSign = rawBody
      ? rawBody
      : Buffer.from(JSON.stringify(req.body), 'utf8')

    const expected = createHmac('sha256', this.webhookSecret)
      .update(bodyToSign)
      .digest('hex')

    // timingSafeEqual previene timing attacks
    const providedBuf = Buffer.from(providedHex, 'hex')
    const expectedBuf = Buffer.from(expected,    'hex')

    if (
      providedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(providedBuf, expectedBuf)
    ) {
      throw new N8nWebhookError(
        'INVALID_SIGNATURE',
        '[n8n-webhook] HMAC signature mismatch — request rejected.',
      )
    }
  }

  // ── Entrega asíncrona con reintentos ─────────────────────────────────────

  /**
   * Entrega el `OutgoingMessage` al callbackUrl de n8n con reintentos.
   *
   * Backoff exponencial: 1s → 2s → 4s (3 intentos totales).
   * Si todos fallan, lanza {@link N8nWebhookError} con code 'CALLBACK_DELIVERY_FAILED'.
   */
  private async deliverWithRetry(message: OutgoingMessage): Promise<void> {
    const payload = this.buildCallbackPayload(message)
    const body    = JSON.stringify(payload)

    let lastError: unknown

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const res = await fetch(this.callbackUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })

        if (!res.ok) {
          const snippet = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}: ${snippet.slice(0, 200)}`)
        }

        return  // entrega exitosa

      } catch (err) {
        lastError = err
        const delay = RETRY_DELAYS_MS[attempt]
        if (delay !== undefined) {
          console.warn(
            `[n8n-webhook] Delivery attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
            (err as Error).message,
          )
          await this.sleep(delay)
        }
      }
    }

    throw new N8nWebhookError(
      'CALLBACK_DELIVERY_FAILED',
      `[n8n-webhook] Failed to deliver response to ${this.callbackUrl} after ${RETRY_DELAYS_MS.length + 1} attempts`,
      lastError,
    )
  }

  // ── Builders ─────────────────────────────────────────────────────────────

  private buildCallbackPayload(message: OutgoingMessage): N8nCallbackPayload {
    return {
      channelConfigId: this.channelConfigId,
      externalId:      message.externalId,
      text:            message.text,
      richContent:     message.richContent,
      metadata:        message.metadata,
      respondedAt:     new Date().toISOString(),
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async loadConfig(channelConfigId: string) {
    const { PrismaService } = await import('../prisma/prisma.service')
    const db = new PrismaService()
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } })
    if (!config) {
      throw new N8nWebhookError(
        'CONFIG_NOT_FOUND',
        `[n8n-webhook] ChannelConfig not found: ${channelConfigId}`,
      )
    }
    return config
  }
}
