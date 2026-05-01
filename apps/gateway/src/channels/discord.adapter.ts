/**
 * discord.adapter.ts — [F3a-26]
 *
 * Adaptador de canal Discord.
 * - mode='gateway': instancia discord.js Client y hace login.
 * - mode='http':    procesa webhooks de interacciones (slash commands, buttons).
 *
 * Características:
 * - Chunking de mensajes > 2000 chars (gateway y REST)
 * - Reconexión exponencial: 5s → 15s → 45s → 120s
 * - Verificación Ed25519 via node:crypto nativo (SPKI DER)
 * - send() con interaction token usa PATCH al followup
 */

import { EventEmitter }                                    from 'node:events'
import { verify as cryptoVerify, createPublicKey }         from 'node:crypto'
import { Router, type Request, type Response }             from 'express'
import {
  Client,
  GatewayIntentBits,
  Partials,
  type Message,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js'

import type { ChannelAdapter, IncomingMessage, OutgoingMessage, AdapterMode } from './channel-adapter.interface.js'
import {
  messageToIncoming,
  buttonInteractionToIncoming,
  selectMenuToIncoming,
} from './discord-message.mapper.js'

// ── Constantes ────────────────────────────────────────────────────────────────

const DISCORD_API        = 'https://discord.com/api/v10'
const MAX_MESSAGE_LENGTH = 2000
const RECONNECT_DELAYS   = [5_000, 15_000, 45_000, 120_000] as const

// ── Tipos internos ────────────────────────────────────────────────────────────

export interface DiscordSecrets {
  botToken?:  string
  publicKey?: string
}

export interface DiscordConfig {
  applicationId?: string
  guildId?:       string
}

// ── Helper: split message en chunks ──────────────────────────────────────────

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > maxLen) {
    let idx = remaining.lastIndexOf(' ', maxLen)
    if (idx <= 0) idx = maxLen
    chunks.push(remaining.slice(0, idx))
    remaining = remaining.slice(idx).trimStart()
  }
  if (remaining.length > 0) chunks.push(remaining)
  return chunks
}

// ── Helper: richContent → Discord embed ──────────────────────────────────────

function richContentToEmbed(rc: OutgoingMessage['richContent']): Record<string, unknown> {
  if (!rc) return {}
  // Handle legacy flat shape
  const flat = rc as Record<string, unknown>
  const embed: Record<string, unknown> = {}
  if (flat['title'])       embed['title']       = flat['title']
  if (flat['description']) embed['description'] = flat['description']
  if (flat['imageUrl'])    embed['image']        = { url: flat['imageUrl'] }
  if (flat['footer'])      embed['footer']       = { text: flat['footer'] }
  const buttons = flat['buttons'] as Array<{ label: string; value: string }> | undefined
  if (buttons?.length) {
    embed['components'] = [{
      type:       1,
      components: buttons.map(b => ({
        type:      2,
        style:     1,
        label:     b.label,
        custom_id: b.value,
      })),
    }]
  }
  return embed
}

// ── Adaptador ─────────────────────────────────────────────────────────────────

export class DiscordAdapter implements ChannelAdapter {

  private channelConfigId = ''
  private mode: AdapterMode = 'http'
  private secrets: DiscordSecrets = {}
  private config:  DiscordConfig  = {}

  private client?: Client
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private reconnectAttempt = 0

  private readonly emitter = new EventEmitter()

  // ── ChannelAdapter: initialize ─────────────────────────────────────────────

  initialize(channelConfigId: string): void {
    this.channelConfigId = channelConfigId
  }

  // ── ChannelAdapter: setup ──────────────────────────────────────────────────

  async setup(
    config:  Record<string, unknown>,
    secrets: Record<string, unknown>,
    mode:    AdapterMode = 'http',
  ): Promise<void> {
    this.mode    = mode
    this.secrets = secrets as DiscordSecrets
    this.config  = config  as DiscordConfig

    if (mode === 'gateway') {
      await this._startGateway()
    }
  }

  // ── ChannelAdapter: send ───────────────────────────────────────────────────

  async send(message: OutgoingMessage): Promise<void> {
    const interactionToken = message.metadata?.['interactionToken'] as string | undefined
    const channelId        = message.externalId
    const text             = message.text ?? ''

    if (interactionToken && this.config.applicationId) {
      await this._sendViaFollowup(interactionToken, text, message)
      return
    }

    if (this.client) {
      await this._sendViaClient(channelId, text, message)
    } else {
      await this._sendViaRestApi(channelId, text, message)
    }
  }

  // ── ChannelAdapter: dispose ────────────────────────────────────────────────

  async dispose(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    if (this.client) {
      this.client.destroy()
      this.client = undefined
    }
  }

  // ── ChannelAdapter: listeners ──────────────────────────────────────────────

  onMessage(handler: (msg: IncomingMessage) => void): void {
    this.emitter.on('message', handler)
  }

  onError(handler: (err: Error) => void): void {
    this.emitter.on('error', handler)
  }

  // ── HTTP webhook router ────────────────────────────────────────────────────

  buildHttpRouter(): Router {
    const router = Router()

    router.post('/', async (req: Request, res: Response) => {
      const timestamp = req.headers['x-signature-timestamp'] as string
      const signature = req.headers['x-signature-ed25519']  as string

      const rawBody = typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body)

      if (!this._verifySignature(rawBody, timestamp, signature)) {
        res.status(401).json({ error: 'Invalid signature' })
        return
      }

      const body = typeof req.body === 'string'
        ? JSON.parse(req.body)
        : req.body

      // Ping de Discord
      if (body.type === 1) {
        if (!this.secrets.botToken) {
          res.status(503).json({ error: 'Bot not ready' })
          return
        }
        res.json({ type: 1 })
        return
      }

      // APPLICATION_COMMAND (type=2)
      if (body.type === 2) {
        const incoming = this._interactionBodyToIncoming(body)
        if (incoming) this.emitter.emit('message', incoming)
        res.json({ type: 5 }) // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        return
      }

      // MESSAGE_COMPONENT (type=3)
      if (body.type === 3) {
        const incoming = this._componentBodyToIncoming(body)
        if (incoming) this.emitter.emit('message', incoming)
        res.json({ type: 6 }) // DEFERRED_UPDATE_MESSAGE
        return
      }

      res.status(400).json({ error: 'Unknown interaction type' })
    })

    return router
  }

  // Alias para compatibilidad con IHttpChannelAdapter
  getRouter(): Router {
    return this.buildHttpRouter()
  }

  // ── Gateway: iniciar client ────────────────────────────────────────────────

  private async _startGateway(): Promise<void> {
    const intents = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ]

    this.client = new Client({
      intents,
      partials: [Partials.Channel, Partials.Message],
    })

    this.client.on('messageCreate', (msg: Message) => {
      const incoming = messageToIncoming(msg, this.channelConfigId)
      if (incoming) this.emitter.emit('message', incoming)
    })

    this.client.on('interactionCreate', (interaction) => {
      let incoming: IncomingMessage | null = null

      if (interaction.isButton()) {
        incoming = buttonInteractionToIncoming(
          interaction as ButtonInteraction,
          this.channelConfigId,
        )
      } else if (interaction.isStringSelectMenu()) {
        incoming = selectMenuToIncoming(
          interaction as StringSelectMenuInteraction,
          this.channelConfigId,
        )
      }

      if (incoming) this.emitter.emit('message', incoming)
    })

    this.client.on('ready', () => {
      console.info(`[discord] Gateway ready — ${this.client?.user?.tag}`)
      this.reconnectAttempt = 0
    })

    this.client.on('error', (err: Error) => {
      console.error('[discord] Client error:', err.message)
      this.emitter.emit('error', err)
    })

    this.client.on('shardDisconnect', () => {
      console.warn('[discord] Disconnected — scheduling reconnect')
      this._scheduleReconnect()
    })

    await this.client.login(this.secrets.botToken)
  }

  // ── Gateway: reconexión exponencial ───────────────────────────────────────

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) return
    const delay = RECONNECT_DELAYS[
      Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)
    ]!
    console.info(`[discord] Reconnect in ${delay / 1000}s (attempt ${this.reconnectAttempt + 1})`)
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined
      this.reconnectAttempt++
      try {
        if (this.client) {
          this.client.destroy()
          this.client = undefined
        }
        await this._startGateway()
      } catch (err) {
        console.error('[discord] Reconnect failed:', err)
        this._scheduleReconnect()
      }
    }, delay)
  }

  // ── Send helpers ──────────────────────────────────────────────────────────

  private async _sendViaClient(
    channelId: string,
    text:      string,
    message:   OutgoingMessage,
  ): Promise<void> {
    const channel = await this.client!.channels.fetch(channelId)
    if (!channel?.isTextBased()) {
      throw new Error(`[discord] Channel ${channelId} is not a text channel`)
    }

    const chunks = splitMessage(text, MAX_MESSAGE_LENGTH)
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1
      if (isLast && message.richContent) {
        await (channel as any).send({
          content: chunks[i],
          embeds:  [richContentToEmbed(message.richContent)],
        })
      } else {
        await (channel as any).send({ content: chunks[i] })
      }
    }
  }

  private async _sendViaRestApi(
    channelId: string,
    text:      string,
    message:   OutgoingMessage,
  ): Promise<void> {
    const chunks = splitMessage(text, MAX_MESSAGE_LENGTH)
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1
      const body: Record<string, unknown> = { content: chunks[i] }
      if (isLast && message.richContent) {
        body['embeds'] = [richContentToEmbed(message.richContent)]
      }

      const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
        method:  'POST',
        headers: {
          Authorization:  `Bot ${this.secrets.botToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`[discord] REST send failed (${res.status}): ${err}`)
      }
    }
  }

  private async _sendViaFollowup(
    interactionToken: string,
    text:             string,
    message:          OutgoingMessage,
  ): Promise<void> {
    const body: Record<string, unknown> = { content: text.slice(0, MAX_MESSAGE_LENGTH) }
    if (message.richContent) body['embeds'] = [richContentToEmbed(message.richContent)]

    const res = await fetch(
      `${DISCORD_API}/webhooks/${this.config.applicationId}/${interactionToken}/messages/@original`,
      {
        method:  'PATCH',
        headers: {
          Authorization:  `Bot ${this.secrets.botToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`[discord] Followup PATCH failed (${res.status}): ${err}`)
    }
  }

  // ── Signature verification (Ed25519) ──────────────────────────────────────

  /**
   * Verifica la firma Ed25519 de Discord usando node:crypto nativo.
   * Discord provee la clave pública como hex (32 bytes) — se envuelve en SPKI DER.
   *
   * Fix: createVerify('ed25519') es incorrecto para Ed25519 raw keys.
   * Usar createPublicKey con SPKI DER header + cryptoVerify(null, ...).
   */
  private _verifySignature(body: string, timestamp: string, signature: string): boolean {
    if (!timestamp || !signature || !this.secrets.publicKey) return false
    try {
      const keyBuffer = Buffer.from(this.secrets.publicKey, 'hex')
      // SPKI DER header para Ed25519 (OID 1.3.101.112)
      const spkiHeader = Buffer.from('302a300506032b657003210000', 'hex')
      const spkiDer    = Buffer.concat([spkiHeader, keyBuffer])
      const publicKey  = createPublicKey({ key: spkiDer, format: 'der', type: 'spki' })
      return cryptoVerify(
        null,
        Buffer.from(timestamp + body),
        publicKey,
        Buffer.from(signature, 'hex'),
      )
    } catch {
      return false
    }
  }

  // ── Interaction body → IncomingMessage ────────────────────────────────────

  private _interactionBodyToIncoming(
    body: Record<string, unknown>,
  ): IncomingMessage | null {
    const data = body['data'] as Record<string, unknown> | undefined
    if (!data) return null

    const commandName = data['name']    as string | undefined
    const options     = data['options'] as Array<{ name: string; value: unknown }> | undefined
    const text        = options?.map(o => String(o.value)).join(' ') ?? commandName ?? ''
    const channelId   = body['channel_id'] as string | undefined
    const member      = body['member']     as Record<string, unknown> | undefined
    const user        = (member?.['user'] ?? body['user']) as Record<string, unknown> | undefined
    const userId      = user?.['id'] as string | undefined

    if (!channelId || !userId) return null

    return {
      channelConfigId: this.channelConfigId,
      channelType:     'discord',
      externalId:      channelId,
      threadId:        channelId,
      senderId:        userId,
      text:            commandName ? `${commandName} ${text}`.trim() : text,
      type:            'command',
      msgId:           body['id'] as string | undefined,
      metadata: {
        interactionToken: body['token'],
        guildId:          body['guild_id'],
        username:         user?.['username'],
      },
      rawPayload:  body,
      receivedAt:  new Date().toISOString(),
    }
  }

  private _componentBodyToIncoming(
    body: Record<string, unknown>,
  ): IncomingMessage | null {
    const data      = body['data']       as Record<string, unknown> | undefined
    const channelId = body['channel_id'] as string | undefined
    const member    = body['member']     as Record<string, unknown> | undefined
    const user      = (member?.['user'] ?? body['user']) as Record<string, unknown> | undefined
    const userId    = user?.['id']       as string | undefined

    if (!channelId || !userId || !data) return null

    const customId      = data['custom_id']      as string | undefined ?? ''
    const componentType = data['component_type'] as number | undefined
    const values        = data['values']         as string[] | undefined

    const isSelectMenu = componentType === 3
    const text         = isSelectMenu ? (values?.[0] ?? '') : customId

    return {
      channelConfigId: this.channelConfigId,
      channelType:     'discord',
      externalId:      channelId,
      threadId:        channelId,
      senderId:        userId,
      text,
      type:    'command',
      msgId:   body['id'] as string | undefined,
      metadata: {
        subtype:          isSelectMenu ? 'quick_reply' : 'button_click',
        selectedValues:   values,
        interactionToken: body['token'],
        guildId:          body['guild_id'],
        username:         user?.['username'],
      },
      rawPayload:  body,
      receivedAt:  new Date().toISOString(),
    }
  }
}
