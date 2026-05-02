/**
 * discord.adapter.ts — Discord Interactions Adapter
 *
 * Maneja slash commands e interacciones de Discord.
 * Flujo: Discord → POST /gateway/discord → handleInteraction() → emit()
 *        Router → agent → send() → PATCH followup endpoint
 */

import type { IncomingMessage, OutgoingMessage } from './channel-adapter.interface.js'
import { BaseChannelAdapter } from './channel-adapter.interface.js'

// ── Tipos Discord ───────────────────────────────────────────────────────

interface DiscordInteraction {
  id:         string
  type:       number
  token:      string
  channel_id?: string
  data?: {
    name:    string
    options?: Array<{ name: string; value: string }>
  }
  member?: { user?: { id?: string; username?: string } }
  user?:   { id?: string; username?: string }
}

interface DiscordWebhookBody {
  application_id: string
  interaction_id:    string
  interaction_token: string
}

// ── Adapter ─────────────────────────────────────────────────────────────

export class DiscordAdapter extends BaseChannelAdapter {
  readonly channel = 'discord'

  private applicationId     = ''
  private publicKey         = ''
  private interactionToken  = ''
  private interactionId     = ''
  private replied           = false

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId

    // AUDIT-24: leer secretsEncrypted, NO credentials
    const config = await this.loadConfig(channelConfigId)
    const secrets = config.secretsEncrypted
      ? JSON.parse(this.decryptSecrets(config.secretsEncrypted))
      : {}

    const cfg = config.config as Record<string, unknown>
    this.applicationId = (cfg.applicationId as string) ?? ''
    this.publicKey     = (secrets.publicKey  as string) ?? ''
  }

  async dispose(): Promise<void> {
    this.replied = false
  }

  /**
   * Procesa una interacción de Discord recibida vía webhook HTTP.
   * Llamado desde discord.controller.ts tras verificar la firma Ed25519.
   */
  async handleInteraction(interaction: DiscordInteraction): Promise<void> {
    // Reset state per interaction
    this.replied           = false
    this.interactionToken  = interaction.token
    this.interactionId     = interaction.id

    // AUDIT-21: validar channel_id antes de construir IncomingMessage
    const externalId = interaction.channel_id
    if (!externalId) {
      console.warn(
        `[discord] interaction without channel_id — dropped`,
        { interactionId: interaction.id },
      )
      return
    }

    const user      = interaction.member?.user ?? interaction.user
    const senderId  = user?.id ?? externalId
    const text      = interaction.data?.options?.find((o) => o.name === 'message')?.value
      ?? interaction.data?.name
      ?? ''

    const msg: IncomingMessage = {
      channelConfigId: this.channelConfigId,
      channelType:     'discord',
      externalId,
      senderId,
      text,
      type:        'text',
      receivedAt:  this.makeTimestamp(),
    }

    await this.emit(msg)
  }

  /**
   * AUDIT-13: replied=true SOLO después de verificar res.ok.
   * Error incluye HTTP status + body de la API de Discord.
   */
  async send(message: OutgoingMessage): Promise<void> {
    if (!this.applicationId || !this.interactionToken) {
      throw new Error('[discord] send() called before handleInteraction()')
    }

    const url = `https://discord.com/api/v10/webhooks/${this.applicationId}/${this.interactionToken}/messages/@original`

    const res = await fetch(url, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ content: message.text }),
    })

    // AUDIT-13: verificar res.ok ANTES de marcar replied=true
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(
        `[discord] send() failed: HTTP ${res.status} — ${body.slice(0, 200)}`,
      )
    }

    this.replied = true  // ← AUDIT-13: solo aquí, tras confirmar entrega
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
