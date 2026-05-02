/**
 * webhook.adapter.ts — Generic Webhook Adapter
 *
 * Recibe mensajes via HTTP POST y reenvía respuestas al callbackUrl
 * configurado en ChannelConfig.config.
 */

import type { IncomingMessage, OutgoingMessage } from './channel-adapter.interface.js'
import { BaseChannelAdapter } from './channel-adapter.interface.js'

// ── Tipos ────────────────────────────────────────────────────────────────

interface WebhookInboundPayload {
  externalId?: string
  senderId?:   string
  text?:       string
  message?:    string
  metadata?:   Record<string, unknown>
}

// ── Adapter ──────────────────────────────────────────────────────────────

export class WebhookAdapter extends BaseChannelAdapter {
  readonly channel = 'webhook'

  private callbackUrl = ''
  private replied     = false

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId

    // AUDIT-24: leer secretsEncrypted, NO credentials/tokenEnc
    const config = await this.loadConfig(channelConfigId)
    const cfg    = config.config as Record<string, unknown>
    this.callbackUrl = (cfg.callbackUrl as string) ?? ''
  }

  async dispose(): Promise<void> {
    this.callbackUrl = ''
    this.replied     = false
  }

  /**
   * Procesa un payload entrante desde el webhook HTTP.
   * Llamado desde webhook.controller.ts.
   *
   * AUDIT-21: si no hay externalId en el payload, usa channelConfigId
   * como clave de sesión única (webhook es un canal punto a punto).
   */
  async handleInbound(payload: WebhookInboundPayload): Promise<void> {
    // AUDIT-21: externalId desde payload o fallback a channelConfigId (punto a punto)
    const externalId = payload.externalId ?? this.channelConfigId

    const msg: IncomingMessage = {
      channelConfigId: this.channelConfigId,
      channelType:     'webhook',
      externalId,
      senderId:        payload.senderId ?? externalId,
      text:            payload.text ?? payload.message ?? '',
      type:            'text',
      metadata:        payload.metadata,
      receivedAt:      this.makeTimestamp(),
    }

    await this.emit(msg)
  }

  /**
   * AUDIT-13: replied=true SOLO después de verificar res.ok.
   * Error incluye HTTP status + fragmento del body.
   */
  async send(message: OutgoingMessage): Promise<void> {
    if (!this.callbackUrl) {
      // Sin callbackUrl configurado — descarte silencioso (canal fire-and-forget)
      console.warn(`[webhook] No callbackUrl configured for ${this.channelConfigId} — message dropped`)
      return
    }

    const res = await fetch(this.callbackUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        externalId:  message.externalId,
        text:        message.text,
        richContent: message.richContent ?? null,
        metadata:    message.metadata    ?? {},
        ts:          new Date().toISOString(),
      }),
    })

    // AUDIT-13: verificar res.ok ANTES de marcar replied=true
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(
        `[webhook] send() failed: HTTP ${res.status} — ${body.slice(0, 200)}`,
      )
    }

    this.replied = true  // ← AUDIT-13: solo aquí, tras confirmar entrega
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async loadConfig(channelConfigId: string) {
    const { PrismaService } = await import('../prisma/prisma.service.js')
    const db = new PrismaService()
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } })
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`)
    return config
  }
}
