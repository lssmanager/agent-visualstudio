import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface.js'

interface DiscordMessage {
  id:         string
  channel_id: string
  author?:    { id: string; username?: string; bot?: boolean }
  content?:   string
  timestamp?: string
  thread?:    { id: string; name?: string }
}

interface DiscordInteraction {
  id:          string
  type:        number
  token:       string
  channel_id:  string
  user?:       { id: string }
  member?:     { user: { id: string } }
  data?:       { name?: string; options?: unknown[] }
}

/**
 * DiscordAdapter — adaptador para la Discord API (mensajes y slash commands)
 * [F3a-17] threadId = message.thread?.id ?? message.channelId
 */
export class DiscordAdapter extends BaseChannelAdapter {
  readonly channel = 'discord'

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId
  }

  async receive(
    rawPayload: Record<string, unknown>,
    secrets:    Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const botToken = String(secrets['botToken'] ?? secrets['bot_token'] ?? '')

    // Determinar si es un message event o una interaction
    const eventType = String(rawPayload['type'] ?? rawPayload['t'] ?? '')
    const data      = (rawPayload['d'] ?? rawPayload) as Record<string, unknown>

    if (
      eventType === 'INTERACTION_CREATE'
      || typeof (data as { token?: unknown }).token === 'string'
    ) {
      return this.receiveInteraction(rawPayload, data as unknown as DiscordInteraction, botToken)
    }

    return this.receiveMessage(rawPayload, data as unknown as DiscordMessage, botToken)
  }

  private async receiveMessage(
    rawPayload: Record<string, unknown>,
    message:    DiscordMessage,
    botToken:   string,
  ): Promise<IncomingMessage | null> {
    if (!message.channel_id) return null
    // Ignorar mensajes de bots
    if (message.author?.bot) return null

    const channelId = message.channel_id
    // [F3a-17] threadId: thread.id si hay thread activo, sino channelId
    const threadId  = message.thread?.id ?? channelId

    let replied = false
    const replyFn = async (replyText: string, opts?: { quoteOriginal?: boolean }) => {
      if (replied) return
      replied = true

      // Responder al thread si hay thread activo, al canal si no
      const targetId = message.thread?.id ?? channelId
      const url = `https://discord.com/api/v10/channels/${targetId}/messages`
      await fetch(url, {
        method:  'POST',
        headers: {
          Authorization:  `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content:           replyText,
          message_reference: opts?.quoteOriginal
            ? { message_id: message.id }
            : undefined,
        }),
        signal: AbortSignal.timeout(10_000),
      })
    }

    const sanitized = this.sanitizeRawPayload(rawPayload, ['botToken', 'bot_token'])

    return {
      externalId: channelId,
      threadId,
      senderId:   message.author?.id ?? '',
      text:       message.content ?? '',
      type:       'text',
      rawPayload: sanitized,
      receivedAt: this.makeTimestamp(),
      replyFn,
    }
  }

  private async receiveInteraction(
    rawPayload:   Record<string, unknown>,
    interaction:  DiscordInteraction,
    _botToken:    string,
  ): Promise<IncomingMessage | null> {
    if (!interaction.channel_id) return null

    const channelId = interaction.channel_id
    const threadId  = channelId  // interactions no tienen threads propios

    // Discord interactions tienen su propio endpoint de reply
    let replied = false
    const replyFn = async (replyText: string) => {
      if (replied) return
      replied = true

      const url = `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`
      await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 4,  // CHANNEL_MESSAGE_WITH_SOURCE
          data: { content: replyText },
        }),
        signal: AbortSignal.timeout(3_000),  // Discord requiere reply en ≤3s
      })
    }

    const sanitized = this.sanitizeRawPayload(rawPayload, ['botToken', 'bot_token'])
    const senderId  = interaction.user?.id ?? interaction.member?.user.id ?? ''

    return {
      externalId: channelId,
      threadId,
      senderId,
      text:       String(interaction.data?.name ?? ''),
      type:       'command',
      rawPayload: sanitized,
      receivedAt: this.makeTimestamp(),
      replyFn,
    }
  }

  async send(message: OutgoingMessage, _config?: Record<string, unknown>, secrets?: Record<string, unknown>): Promise<void> {
    const botToken = String(secrets?.['botToken'] ?? secrets?.['bot_token'] ?? '')
    // Usar threadId si es distinto del channelId, sino usar externalId
    const targetId = message.threadId && message.threadId !== message.externalId
                       ? message.threadId
                       : message.externalId
    const url = `https://discord.com/api/v10/channels/${targetId}/messages`
    await fetch(url, {
      method:  'POST',
      headers: {
        Authorization:  `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: message.text }),
    })
  }

  async dispose(): Promise<void> {
    // noop
  }
}
