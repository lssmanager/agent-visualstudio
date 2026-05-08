/**
 * whatsapp.adapter.ts — WhatsApp Cloud API Adapter
 *
 * Recibe webhooks de Meta y envía mensajes vía WhatsApp Cloud API.
 * Requiere: PHONE_NUMBER_ID y accessToken en credentials (JsonValue).
 *
 * FIX [#396]: secretsEncrypted eliminado del schema Prisma.
 * Las credenciales se leen desde config.credentials (campo actual).
 */

import type { IncomingMessage, OutgoingMessage } from './channel-adapter.interface'
import { BaseChannelAdapter } from './channel-adapter.interface'

// ── Tipos WhatsApp ────────────────────────────────────────────────────

interface WaWebhookEntry {
  changes?: Array<{
    value?: {
      messages?: Array<{
        from?:      string
        id?:        string
        type?:      string
        text?:      { body?: string }
        timestamp?: string
      }>
    }
  }>
}

interface WaWebhookBody {
  object?: string
  entry?:  WaWebhookEntry[]
}

interface WaErrorBody {
  error?: { code?: number; message?: string; fbtrace_id?: string }
}

// ── Adapter ───────────────────────────────────────────────────────────

export class WhatsAppAdapter extends BaseChannelAdapter {
  readonly channel = 'whatsapp'

  private phoneNumberId = ''
  private accessToken   = ''
  private replied       = false

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId

    // FIX [#396]: leer desde credentials (JsonValue), no secretsEncrypted.
    const config  = await this.loadConfig(channelConfigId)
    const secrets = (config.credentials as Record<string, unknown>) ?? {}

    const cfg = (config.config as Record<string, unknown>) ?? {}
    this.phoneNumberId = (cfg.phoneNumberId    as string) ?? ''
    this.accessToken   = (secrets.accessToken  as string) ?? ''
  }

  async dispose(): Promise<void> {
    this.accessToken = ''
    this.replied     = false
  }

  /**
   * Procesa el payload del webhook de Meta.
   * Llamado desde whatsapp.controller.ts.
   */
  async handleWebhook(body: WaWebhookBody): Promise<void> {
    if (body.object !== 'whatsapp_business_account') return

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messages ?? []) {
          // AUDIT-21: validar 'from' (número E.164) antes de construir IncomingMessage
          const externalId = msg.from
          if (!externalId) {
            console.warn('[whatsapp] message without from — dropped', { msg })
            continue
          }

          const incoming: IncomingMessage = {
            channelConfigId: this.channelConfigId,
            channelType:     'whatsapp',
            externalId,
            senderId:        externalId,
            text:            msg.text?.body ?? '',
            type:            'text',
            receivedAt:      this.makeTimestamp(),
          }

          await this.emit(incoming)
        }
      }
    }
  }

  /**
   * AUDIT-13: replied=true SOLO después de verificar res.ok.
   * WhatsApp Cloud API devuelve errores con { error: { code, message } }.
   * El mensaje de error se incluye en el throw.
   */
  async send(message: OutgoingMessage): Promise<void> {
    if (!this.phoneNumberId || !this.accessToken) {
      throw new Error('[whatsapp] send() called before initialize() or credentials missing')
    }

    const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`

    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:                message.externalId,
        type:              'text',
        text:              { body: message.text },
      }),
    })

    // AUDIT-13: verificar res.ok ANTES de marcar replied=true
    // WhatsApp Cloud API devuelve { error: { code, message } } en caso de fallo
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({} as WaErrorBody)) as WaErrorBody
      const detail  = errBody.error?.message ?? 'unknown error'
      throw new Error(
        `[whatsapp] send() failed: HTTP ${res.status} — ${detail}`,
      )
    }

    this.replied = true  // ← AUDIT-13: solo aquí, tras confirmar entrega
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async loadConfig(channelConfigId: string) {
    const { PrismaService } = await import('../prisma/prisma.service')
    const db = new PrismaService()
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } })
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`)
    return config
  }
}
