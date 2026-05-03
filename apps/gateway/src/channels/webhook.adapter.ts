/**
 * webhook.adapter.ts — Generic Webhook Adapter (con soporte n8n)
 *
 * Recibe mensajes via HTTP POST y reenvía respuestas al callbackUrl
 * configurado en ChannelConfig.config.
 *
 * ## Modos de operación
 *
 * ### Modo genérico (por defecto, config.n8nMode !== true)
 * Payload esperado: { text?, message?, externalId?, senderId?, metadata? }
 * Respuesta: POST al callbackUrl con { externalId, text, richContent, metadata, ts }
 *
 * ### Modo n8n (config.n8nMode === true)
 * Acepta dos shapes de payload n8n:
 *   1. Nodo "Webhook" de n8n: { body: { task?, data?, workflowId?, executionId?, ... }, headers, ... }
 *   2. Nodo "HTTP Request": payload plano con los mismos campos en la raíz
 *
 * La respuesta se envía al callbackUrl (igual que el modo genérico).
 * Si no hay callbackUrl, la respuesta se descarta con un warning.
 *
 * ## Configuración en ChannelConfig.config
 * ```json
 * {
 *   "callbackUrl": "https://n8n.example.com/webhook/respuesta",
 *   "n8nMode": true,
 *   "n8nSignatureSecret": "hmac-sha256-secret-opcional",
 *   "n8nCallbackField": "text"
 * }
 * ```
 *
 * @module webhook.adapter
 */

import { createHmac } from 'node:crypto'

import type { IncomingMessage, OutgoingMessage } from './channel-adapter.interface.js'
import { BaseChannelAdapter }                    from './channel-adapter.interface.js'
import {
  extractN8nBody,
  isN8nWebhookNodePayload,
  n8nBodyToExternalId,
  n8nBodyToTaskText,
  type N8nWebhookNodePayload,
  type WebhookInboundPayload,
} from './webhook.n8n-payload.js'

// ── Configuración interna ─────────────────────────────────────────────────────

interface WebhookAdapterConfig {
  /** URL de destino para las respuestas del agente */
  callbackUrl:         string
  /** Activa el parsing de payloads n8n */
  n8nMode:             boolean
  /**
   * Secreto HMAC para verificar la firma `x-n8n-signature` de n8n.
   * Si está vacío/ausente, la verificación de firma se omite.
   */
  n8nSignatureSecret:  string
  /**
   * Nombre del campo en el body de respuesta donde se pone el texto del agente.
   * @default 'text'
   */
  n8nCallbackField:    string
}

// ── N8n response body ─────────────────────────────────────────────────────────

/** Shape de la respuesta que el WebhookAdapter envía de vuelta a n8n */
interface N8nResponseBody {
  /** Texto de respuesta del agente */
  [key: string]:   unknown
  /** Siempre presente — coincide con el externalId de la sesión */
  externalId:      string
  /** Metadatos de la ejecución para correlación en n8n */
  metadata:        Record<string, unknown>
  /** Timestamp ISO del momento de la respuesta */
  ts:              string
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * WebhookAdapter — adaptador HTTP para webhooks genéricos y triggers n8n.
 *
 * Extiende {@link BaseChannelAdapter} heredando la gestión del handler
 * de mensajes y el método {@link emit}.
 *
 * @remarks
 * No mantiene conexión activa — solo procesa requests entrantes sincrónicos
 * y envía respuestas via fetch hacia el callbackUrl.
 */
export class WebhookAdapter extends BaseChannelAdapter {
  readonly channel = 'webhook' as const

  private cfg: WebhookAdapterConfig = {
    callbackUrl:        '',
    n8nMode:            false,
    n8nSignatureSecret: '',
    n8nCallbackField:   'text',
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId

    const config = await this.loadConfig(channelConfigId)
    const raw    = config.config as Record<string, unknown>

    this.cfg = {
      callbackUrl:        String(raw.callbackUrl        ?? ''),
      n8nMode:            raw.n8nMode             === true,
      n8nSignatureSecret: String(raw.n8nSignatureSecret ?? ''),
      n8nCallbackField:   String(raw.n8nCallbackField   ?? 'text'),
    }

    if (this.cfg.n8nMode) {
      console.log(
        `[webhook/${channelConfigId}] n8nMode enabled` +
        (this.cfg.callbackUrl ? ` → callbackUrl: ${this.cfg.callbackUrl}` : ' (no callbackUrl — fire-and-forget)'),
      )
    }
  }

  async dispose(): Promise<void> {
    this.cfg = {
      callbackUrl:        '',
      n8nMode:            false,
      n8nSignatureSecret: '',
      n8nCallbackField:   'text',
    }
  }

  // ── Inbound ────────────────────────────────────────────────────────────────

  /**
   * Procesa un payload entrante desde el endpoint HTTP del webhook.
   * Llamado desde `webhook.controller.ts` o `ChannelRouter`.
   *
   * Detecta automáticamente si el payload es de n8n (cuando n8nMode=true)
   * y normaliza el mensaje antes de emitirlo al dispatcher.
   *
   * @param rawPayload  — body del POST tal como llega de Express (`req.body`)
   * @param rawHeaders  — headers del POST (para verificación de firma n8n)
   */
  async handleInbound(
    rawPayload: unknown,
    rawHeaders?: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    // ── Verificación de firma n8n (opcional) ──────────────────────────────
    if (this.cfg.n8nMode && this.cfg.n8nSignatureSecret) {
      const sig = rawHeaders?.['x-n8n-signature']
      if (!this.verifyN8nSignature(rawPayload, sig)) {
        console.warn(
          `[webhook/${this.channelConfigId}] n8n signature verification failed — message dropped`,
        )
        return
      }
    }

    const msg = this.cfg.n8nMode
      ? this.normalizeN8nPayload(rawPayload)
      : this.normalizeGenericPayload(rawPayload as WebhookInboundPayload)

    if (msg) await this.emit(msg)
  }

  // ── Outbound ───────────────────────────────────────────────────────────────

  /**
   * Envía la respuesta del agente al callbackUrl configurado.
   *
   * En modo n8n, el body de respuesta usa `n8nCallbackField` como clave
   * del texto en lugar del fijo `text`.
   *
   * @throws {Error} Si el POST al callbackUrl devuelve un status !== 2xx.
   */
  async send(message: OutgoingMessage): Promise<void> {
    if (!this.cfg.callbackUrl) {
      console.warn(
        `[webhook/${this.channelConfigId}] No callbackUrl configured — message dropped`,
      )
      return
    }

    const body: N8nResponseBody = {
      [this.cfg.n8nCallbackField]: message.text,
      externalId:  message.externalId,
      richContent: message.richContent ?? null,
      metadata:    message.metadata    ?? {},
      ts:          new Date().toISOString(),
    }

    const res = await fetch(this.cfg.callbackUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })

    if (!res.ok) {
      const resBody = await res.text().catch(() => '')
      throw new Error(
        `[webhook/${this.channelConfigId}] send() failed: HTTP ${res.status} — ${resBody.slice(0, 200)}`,
      )
    }
  }

  // ── Normalización de payloads ──────────────────────────────────────────────

  /**
   * Normaliza un payload genérico (no n8n) a IncomingMessage.
   */
  private normalizeGenericPayload(
    payload: WebhookInboundPayload,
  ): IncomingMessage {
    const externalId = payload.externalId ?? this.channelConfigId

    return {
      channelConfigId: this.channelConfigId,
      channelType:     'webhook',
      externalId,
      senderId:        payload.senderId ?? externalId,
      text:            payload.text ?? payload.message ?? '',
      type:            'text',
      metadata:        payload.metadata,
      receivedAt:      this.makeTimestamp(),
    }
  }

  /**
   * Normaliza un payload n8n (webhook node o HTTP request node) a IncomingMessage.
   * Retorna null si el payload no puede parsearse como n8n.
   *
   * @param rawPayload — body crudo del POST
   */
  private normalizeN8nPayload(
    rawPayload: unknown,
  ): IncomingMessage | null {
    if (typeof rawPayload !== 'object' || rawPayload === null) {
      console.warn(
        `[webhook/${this.channelConfigId}] n8nMode=true but payload is not an object — dropped`,
      )
      return null
    }

    const isN8nNode = isN8nWebhookNodePayload(rawPayload)

    const body = extractN8nBody(
      rawPayload as N8nWebhookNodePayload,
    )

    const text       = n8nBodyToTaskText(body)
    const externalId = n8nBodyToExternalId(body, this.channelConfigId)

    const metadata: Record<string, unknown> = {
      ...body.metadata,
      ...(body.workflowId   ? { workflowId:   body.workflowId   } : {}),
      ...(body.executionId  ? { executionId:  body.executionId  } : {}),
      ...(body.workflowName ? { workflowName: body.workflowName } : {}),
      ...(body.trigger      ? { trigger:      body.trigger      } : {}),
      n8nPayloadShape: isN8nNode ? 'webhook-node' : 'http-request',
    }

    return {
      channelConfigId: this.channelConfigId,
      channelType:     'webhook',
      externalId,
      senderId:        externalId,
      text,
      type:            'text',
      metadata,
      rawPayload,
      receivedAt:      this.makeTimestamp(),
    }
  }

  // ── Firma n8n ──────────────────────────────────────────────────────────────

  /**
   * Verifica la firma HMAC-SHA256 de n8n en el header `x-n8n-signature`.
   *
   * n8n firma el body serializado con `HMAC-SHA256` usando el secreto
   * configurado en el nodo Webhook. El header tiene el formato `sha256=<hex>`.
   *
   * @param payload   — body crudo (como object — se serializa a JSON para la firma)
   * @param signature — valor del header `x-n8n-signature` (puede ser array si Express lo normaliza)
   * @returns true si la firma es válida o si no hay secreto configurado
   */
  private verifyN8nSignature(
    payload:   unknown,
    signature: string | string[] | undefined,
  ): boolean {
    if (!this.cfg.n8nSignatureSecret) return true
    if (!signature) return false

    const sig = Array.isArray(signature) ? signature[0] : signature
    if (!sig.startsWith('sha256=')) return false

    const provided = sig.slice('sha256='.length)
    const body     = typeof payload === 'string'
      ? payload
      : JSON.stringify(payload)

    const expected = createHmac('sha256', this.cfg.n8nSignatureSecret)
      .update(body)
      .digest('hex')

    // Comparación en tiempo constante para prevenir timing attacks
    if (provided.length !== expected.length) return false

    let diff = 0
    for (let i = 0; i < provided.length; i++) {
      diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
    }
    return diff === 0
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async loadConfig(channelConfigId: string) {
    const { PrismaService } = await import('../prisma/prisma.service.js')
    const db     = new PrismaService()
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } })
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`)
    return config
  }
}
