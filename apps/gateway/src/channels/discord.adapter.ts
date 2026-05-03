/**
 * discord.adapter.ts — Discord Interactions Adapter
 *
 * Maneja slash commands e interacciones de Discord.
 * Flujo: Discord → POST /gateway/discord → handleInteraction() → emit()
 *        Router → agent → send() → PATCH followup endpoint
 *
 * Fixes F5-04:
 *   - PING handshake (type=1) → responde { type: 1 } para registro de webhook
 *   - type=3 (components) manejado sin crash
 *   - Audit hooks conectados desde discord.adapter.audit.ts
 *   - loadConfig() usa PrismaService por DI (no más new PrismaService())
 *   - decryptSecrets() dev mode hasta F3b-05
 */

import type { IncomingMessage, OutgoingMessage } from './channel-adapter.interface.js'
import { BaseChannelAdapter } from './channel-adapter.interface.js'
import {
  auditDiscordProvisioned,
  auditDiscordMessageInbound,
  auditDiscordMessageOutbound,
  auditDiscordError,
} from './discord.adapter.audit.js'

// ── Tipos Discord ───────────────────────────────────────────────────────

interface DiscordInteraction {
  id:          string
  type:        number   // 1=PING, 2=APPLICATION_COMMAND, 3=MESSAGE_COMPONENT
  token:       string
  channel_id?: string
  data?: {
    name:    string
    options?: Array<{ name: string; value: string }>
  }
  member?: { user?: { id?: string; username?: string } }
  user?:   { id?: string; username?: string }
}

/**
 * Resultado devuelto por handleInteraction().
 * null  → mensaje procesado normalmente (emit al dispatcher)
 * { type: 1 } → PONG — el controller debe responder res.json({ type: 1 })
 */
export type DiscordInteractionResult = { type: 1 } | null

// ── Adapter ─────────────────────────────────────────────────────────────

export class DiscordAdapter extends BaseChannelAdapter {
  readonly channel = 'discord'

  private applicationId     = ''
  private publicKey         = ''
  private interactionToken  = ''
  private interactionId     = ''
  private replied           = false

  /**
   * @param prisma  PrismaService inyectado por DI (NestJS o manual)
   */
  constructor(private readonly prisma: {
    channelConfig: {
      findUnique(args: { where: { id: string } }): Promise<{
        id: string
        secretsEncrypted?: string | null
        config: unknown
      } | null>
    }
  }) {
    super()
  }

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId

    const config = await this.loadConfig(channelConfigId)
    const secrets = config.secretsEncrypted
      ? JSON.parse(this.decryptSecrets(config.secretsEncrypted))
      : {}

    const cfg = config.config as Record<string, unknown>
    this.applicationId = (cfg.applicationId as string) ?? ''
    this.publicKey     = (secrets.publicKey  as string) ?? ''

    // Audit: canal provisionado exitosamente
    auditDiscordProvisioned({
      channelId:   this.channelConfigId,
      channelName: 'discord',
      agentId:     String((cfg.agentId     as string | undefined) ?? ''),
      workspaceId: String((cfg.workspaceId as string | undefined) ?? ''),
      guildId:     String((cfg.guildId     as string | undefined) ?? ''),
    })
  }

  async dispose(): Promise<void> {
    this.replied = false
  }

  /**
   * Procesa una interacción de Discord recibida vía webhook HTTP.
   * Llamado desde discord.controller.ts tras verificar la firma Ed25519.
   *
   * @returns { type: 1 } si es PING — el controller DEBE hacer res.json({ type: 1 })
   * @returns null        para cualquier interacción procesada normalmente
   */
  async handleInteraction(
    interaction: DiscordInteraction,
  ): Promise<DiscordInteractionResult> {
    // ── PASO 1: PING handshake (type=1) ─────────────────────────────────
    // Discord envía un PING al registrar el webhook URL.
    // Sin esta respuesta, Discord rechaza el endpoint.
    if (interaction.type === 1) {
      return { type: 1 }  // PONG
    }

    // ── PASO 2: MESSAGE_COMPONENT (type=3) ──────────────────────────────
    // Botones, select menus, etc. No los procesamos aún — solo log.
    if (interaction.type === 3) {
      console.info(
        `[discord] MESSAGE_COMPONENT interaction received — not handled yet`,
        { interactionId: interaction.id },
      )
      return null
    }

    // ── PASO 3: APPLICATION_COMMAND (type=2) ────────────────────────────
    // Reset state por interacción
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
      return null
    }

    const user     = interaction.member?.user ?? interaction.user
    const senderId = user?.id ?? externalId
    const text     = interaction.data?.options?.find((o) => o.name === 'message')?.value
      ?? interaction.data?.name
      ?? ''

    const msg: IncomingMessage = {
      channelConfigId: this.channelConfigId,
      channelType:     'discord',
      externalId,
      senderId,
      text,
      type:       'text',
      receivedAt: this.makeTimestamp(),
    }

    // Audit inbound ANTES de emitir al dispatcher
    auditDiscordMessageInbound({
      channelId: this.channelConfigId,
      messageId: interaction.id,
    })

    try {
      await this.emit(msg)
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err))
      auditDiscordError({
        channelId:    this.channelConfigId,
        errorCode:    String((e as NodeJS.ErrnoException).code ?? 'UNKNOWN'),
        errorMessage: e.message,
        recoverable:  false,
        stack:        e.stack,
      })
      throw e
    }

    return null
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

    try {
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

      // Audit outbound
      auditDiscordMessageOutbound({
        channelId: this.channelConfigId,
        messageId: this.interactionId,
      })
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err))
      auditDiscordError({
        channelId:    this.channelConfigId,
        errorCode:    String((e as NodeJS.ErrnoException).code ?? 'UNKNOWN'),
        errorMessage: e.message,
        recoverable:  false,
        stack:        e.stack,
      })
      throw e
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /**
   * TODO F3b-05: reemplazar con CryptoService.decrypt(AES-256-GCM).
   * Dev mode: secretsEncrypted contiene JSON en plaintext hasta que
   * F3b-05 implemente el cifrado real.
   */
  private decryptSecrets(enc: string): string {
    return enc
  }

  /**
   * Carga la configuración del canal desde Prisma (DI — no new PrismaService()).
   */
  private async loadConfig(channelConfigId: string) {
    const config = await this.prisma.channelConfig.findUnique({
      where: { id: channelConfigId },
    })
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`)
    return config
  }
}
