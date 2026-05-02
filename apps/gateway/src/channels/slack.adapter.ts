/**
 * slack.adapter.ts — Slack Events API Adapter
 *
 * Nota Slack-específica (AUDIT-13):
 *   Slack SIEMPRE devuelve HTTP 200, incluso cuando falla.
 *   El error real viene en el body: { ok: false, error: 'channel_not_found' }
 *   Por eso se verifica TANTO res.ok (red) COMO data.ok (protocolo Slack).
 */

import type { IncomingMessage, OutgoingMessage } from './channel-adapter.interface.js'
import { BaseChannelAdapter } from './channel-adapter.interface.js'

// ── Tipos Slack ─────────────────────────────────────────────────────────

interface SlackEvent {
  type:     string
  text?:    string
  user?:    string
  channel?: string
  ts?:      string
}

interface SlackWebhookPayload {
  type:  string
  event: SlackEvent
}

interface SlackApiResponse {
  ok:     boolean
  error?: string
  ts?:    string
}

// ── Adapter ─────────────────────────────────────────────────────────────

export class SlackAdapter extends BaseChannelAdapter {
  readonly channel = 'slack'

  private botToken  = ''
  private replied   = false

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId

    // AUDIT-24: leer secretsEncrypted, NO credentials/tokenEnc
    const config = await this.loadConfig(channelConfigId)
    const secrets = config.secretsEncrypted
      ? JSON.parse(this.decryptSecrets(config.secretsEncrypted))
      : {}

    this.botToken = (secrets.botToken as string) ?? ''
  }

  async dispose(): Promise<void> {
    this.botToken = ''
    this.replied  = false
  }

  /**
   * Procesa un evento de Slack (Events API).
   * Llamado desde slack.controller.ts tras verificar la firma HMAC.
   */
  async handleEvent(payload: SlackWebhookPayload): Promise<void> {
    const event = payload.event
    if (event.type !== 'message') return

    // AUDIT-21: validar channel antes de construir IncomingMessage
    const externalId = event.channel
    if (!externalId) {
      console.warn('[slack] event without channel — dropped', { event })
      return
    }

    // Ignorar mensajes del propio bot
    if (!event.user) {
      console.warn('[slack] event without user (posible bot message) — dropped', { event })
      return
    }

    const msg: IncomingMessage = {
      channelConfigId: this.channelConfigId,
      channelType:     'slack',
      externalId,
      senderId:        event.user,
      text:            event.text ?? '',
      type:            'text',
      receivedAt:      this.makeTimestamp(),
    }

    await this.emit(msg)
  }

  /**
   * AUDIT-13: replied=true SOLO después de verificar res.ok && data.ok.
   *
   * Slack usa HTTP 200 para todo — el error real es data.ok === false.
   * Ambas condiciones deben pasar antes de marcar la entrega como exitosa.
   */
  async send(message: OutgoingMessage): Promise<void> {
    if (!this.botToken) {
      throw new Error('[slack] send() called before initialize() or botToken missing')
    }

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json; charset=utf-8',
        'Authorization': `Bearer ${this.botToken}`,
      },
      body: JSON.stringify({
        channel: message.externalId,
        text:    message.text,
      }),
    })

    // AUDIT-13: doble verificación (HTTP layer + Slack protocol layer)
    const data = await res.json() as SlackApiResponse
    if (!res.ok || data.ok === false) {
      throw new Error(
        `[slack] send() failed: HTTP ${res.status} error=${data.error ?? 'unknown'}`,
      )
    }

    this.replied = true  // ← AUDIT-13: solo aquí, tras confirmar entrega exitosa
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private decryptSecrets(_enc: string): string {
    // F3b-05: decrypt AES-256-GCM — placeholder hasta implementación completa
    return '{}'
  }

  private async loadConfig(channelConfigId: string) {
    const { PrismaService } = await import('../prisma/prisma.service.js')
    const db = new PrismaService()
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } })
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`)
    return config
  }
}
