/**
 * slack.adapter.ts — Slack Events API Adapter
 * [F5-03]
 *
 * Nota Slack-específica (AUDIT-13):
 *   Slack SIEMPRE devuelve HTTP 200, incluso cuando falla.
 *   El error real viene en el body: { ok: false, error: 'channel_not_found' }
 *   Por eso se verifica TANTO res.ok (red) COMO data.ok (protocolo Slack).
 *
 * F5-03: Gaps corregidos
 *   - receive(): url_verification challenge + verificación de firma HMAC
 *   - verifySlackSignature(): HMAC-SHA256, timingSafeEqual, anti-replay 5 min
 *   - verifySignature(): método estático para routes/slack.ts (sin instancia)
 *   - loadConfig(): PrismaService por DI (no más new PrismaService())
 *   - decryptSecrets(): TODO F3b-05 documentado, no más return '{}' silencioso
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, OutgoingMessage } from './channel-adapter.interface'
import { BaseChannelAdapter }                    from './channel-adapter.interface'

// ── PrismaService type (importado como tipo para evitar import circular) ──

type PrismaServiceLike = {
  channelConfig: {
    findUnique: (args: { where: { id: string } }) => Promise<{
      id: string
      secretsEncrypted: string | null
    } | null>
  }
}

// ── Tipos Slack ─────────────────────────────────────────────────────────────────

export interface SlackEvent {
  type:     string
  text?:    string
  user?:    string
  channel?: string
  ts?:      string
  subtype?: string
}

export interface SlackWebhookPayload {
  type:      string
  event?:    SlackEvent
  challenge?: string
  token?:    string
  team_id?:  string
  api_app_id?: string
}

interface SlackApiResponse {
  ok:     boolean
  error?: string
  ts?:    string
}

export interface SlackVerifyOptions {
  rawBody:   string   // body como string sin parsear
  timestamp: string   // header X-Slack-Request-Timestamp
  signature: string   // header X-Slack-Signature (v0=<hash>)
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class SlackAdapter extends BaseChannelAdapter {
  readonly channel = 'slack'

  private botToken:     string = ''
  private signingSecret: string = ''
  private replied:      boolean = false

  /**
   * PrismaService inyectado por constructor (DI).
   * Reemplaza el anti-patrón new PrismaService() en loadConfig().
   */
  constructor(private readonly prisma: PrismaServiceLike) {
    super()
  }

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId

    const config = await this.loadConfig(channelConfigId)
    const secrets = config.secretsEncrypted
      ? JSON.parse(this.decryptSecrets(config.secretsEncrypted)) as Record<string, unknown>
      : {}

    this.botToken     = (secrets['botToken']     as string) ?? ''
    this.signingSecret = (secrets['signingSecret'] as string) ?? ''

    // Validate that both secrets are non-empty (fail closed)
    if (!this.botToken) {
      throw new Error(
        `[slack:${channelConfigId}] Missing required secret 'botToken' — adapter cannot start without valid credentials`,
      )
    }
    if (!this.signingSecret) {
      throw new Error(
        `[slack:${channelConfigId}] Missing required secret 'signingSecret' — adapter cannot start without valid credentials`,
      )
    }
  }

  async dispose(): Promise<void> {
    this.botToken      = ''
    this.signingSecret = ''
    this.replied       = false
  }

  // ── receive() — punto de entrada del webhook ──────────────────────────

  /**
   * Procesa el payload crudo de Slack Events API.
   *
   * secrets debe contener:
   *   - rawBody:   string  (body antes de JSON.parse para verificar HMAC)
   *   - timestamp: string  (header X-Slack-Request-Timestamp)
   *   - signature: string  (header X-Slack-Signature)
   *
   * Retorna:
   *   - { challenge: string }  para url_verification (el controller responde directo)
   *   - IncomingMessage        para mensajes reales
   *   - null                   para eventos ignorados
   */
  async receive(
    rawPayload: Record<string, unknown>,
    secrets: Record<string, unknown>,
  ): Promise<IncomingMessage | { challenge: string } | null> {
    const rawBody   = (secrets['rawBody']   as string | undefined) ?? ''
    const timestamp = (secrets['timestamp'] as string | undefined) ?? ''
    const signature = (secrets['signature'] as string | undefined) ?? ''

    if (this.signingSecret) {
      const valid = this.verifySlackSignature(
        this.signingSecret,
        rawBody,
        timestamp,
        signature,
      )
      if (!valid) {
        console.warn(
          `[slack:${this.channelConfigId}] Invalid HMAC signature — request dropped`,
        )
        return null
      }
    }

    const payload = rawPayload as SlackWebhookPayload

    // ── url_verification challenge (F5-03 Gap A) ────────────────────────
    if (payload.type === 'url_verification') {
      return { challenge: payload.challenge ?? '' }
    }

    if (payload.type !== 'event_callback' || !payload.event) return null

    return this.parseEvent(payload.event)
  }

  // ── handleEvent() (compatibilidad con llamadas directas) ─────────────────

  async handleEvent(payload: SlackWebhookPayload): Promise<void> {
    if (!payload.event) return
    const msg = this.parseEvent(payload.event)
    if (msg) await this.emit(msg)
  }

  // ── send() ───────────────────────────────────────────────────────────────────

  /**
   * AUDIT-13: replied=true SOLO después de verificar res.ok && data.ok.
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

    const data = await res.json() as SlackApiResponse
    if (!res.ok || data.ok === false) {
      throw new Error(
        `[slack] send() failed: HTTP ${res.status} error=${data.error ?? 'unknown'}`,
      )
    }

    this.replied = true
    console.info(
      `[slack:${this.channelConfigId}] Message sent to ${message.externalId} ts=${data.ts ?? 'unknown'}`,
    )
  }

  // ── verifySlackSignature (instancia) ──────────────────────────────────────

  /**
   * Verifica la firma HMAC-SHA256 de Slack (método de instancia).
   * Usado internamente desde receive() con el signingSecret ya cargado.
   */
  verifySlackSignature(
    signingSecret: string,
    rawBody:       string,
    timestamp:     string,
    signature:     string,
  ): boolean {
    return SlackAdapter.verifySignature(signingSecret, timestamp, signature, rawBody)
  }

  // ── verifySignature (estático) ─────────────────────────────────────────────

  /**
   * Verifica la firma HMAC-SHA256 de Slack (método estático).
   * Usado desde routes/slack.ts sin necesidad de una instancia del adapter.
   *
   * @param signingSecret - Slack App Signing Secret
   * @param timestamp     - valor del header X-Slack-Request-Timestamp
   * @param signature     - valor del header X-Slack-Signature (v0=<hex>)
   * @param rawBody       - body como string exacto (antes de JSON.parse)
   *
   * @see https://api.slack.com/authentication/verifying-requests-from-slack
   */
  static verifySignature(
    signingSecret: string,
    timestamp:     string,
    signature:     string,
    rawBody:       string,
  ): boolean {
    if (!signingSecret || !rawBody || !timestamp || !signature) return false

    // Anti-replay: rechazar timestamps de más de 5 minutos
    const tsNum = parseInt(timestamp, 10)
    if (isNaN(tsNum)) return false
    if (Math.abs(Date.now() / 1000 - tsNum) > 300) return false

    // HMAC-SHA256 sobre 'v0:{timestamp}:{rawBody}'
    const baseString = `v0:${timestamp}:${rawBody}`
    const hmac = createHmac('sha256', signingSecret)
      .update(baseString)
      .digest('hex')
    const expected = Buffer.from(`v0=${hmac}`)
    const received = Buffer.from(signature)

    // timingSafeEqual previene timing attacks
    if (expected.length !== received.length) return false
    return timingSafeEqual(expected, received)
  }

  // ── parseEvent (helper privado) ──────────────────────────────────────

  private parseEvent(event: SlackEvent): IncomingMessage | null {
    if (event.type !== 'message') return null

    if (!event.channel) {
      console.warn('[slack] dropped event — missing channel', {
        type: event.type,
        channel: event.channel,
        user: event.user,
        ts: event.ts,
      })
      return null
    }

    if (!event.user) {
      console.warn('[slack] dropped event — missing user (possible bot message)', {
        type: event.type,
        channel: event.channel,
        user: event.user,
        ts: event.ts,
      })
      return null
    }

    if (event.subtype) {
      console.debug('[slack] event with subtype ignored', { subtype: event.subtype })
      return null
    }

    return {
      channelConfigId: this.channelConfigId,
      channelType:     'slack',
      externalId:      event.channel,
      senderId:        event.user,
      text:            event.text ?? '',
      type:            'text',
      receivedAt:      this.makeTimestamp(),
    }
  }

  // ── Helpers privados ────────────────────────────────────────────────────────

  /**
   * Desencripta los secrets del ChannelConfig.
   *
   * TODO F3b-05: Reemplazar esta implementación con CryptoService.decrypt()
   * cuando el servicio AES-256-GCM esté disponible en el contenedor DI.
   * Ver: apps/api/src/modules/secrets/ (fase F3b)
   *
   * Por ahora los secrets se leen como JSON plaintext (desarrollo local).
   * En producción DEBEN estar cifrados con AES-256-GCM antes de guardarse.
   */
  private decryptSecrets(enc: string): string {
    // TODO F3b-05: this.cryptoService.decrypt(enc)
    return enc
  }

  /**
   * Carga la configuración del canal desde Prisma.
   * F5-03: usa PrismaService por DI (no más new PrismaService()).
   */
  private async loadConfig(channelConfigId: string) {
    const config = await this.prisma.channelConfig.findUnique({
      where: { id: channelConfigId },
    })
    if (!config) throw new Error(`[slack] ChannelConfig not found: ${channelConfigId}`)
    return config
  }
}
