import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface.js'
import { createHmac, timingSafeEqual } from 'crypto'

interface SlackEvent {
  type:       string
  channel:    string
  user?:      string
  text?:      string
  ts:         string
  thread_ts?: string
  bot_id?:    string
}

interface SlackWebhookPayload {
  type:         string
  challenge?:   string
  token?:       string
  team_id?:     string
  event?:       SlackEvent
  event_id?:    string
}

/**
 * SlackAdapter — adaptador para la Slack Events API
 * [F3a-17] threadId = event.thread_ts ?? event.ts para preservar hilos
 */
export class SlackAdapter extends BaseChannelAdapter {
  readonly channel = 'slack'

  static async verifySignature(
    signingSecret: string,
    timestamp: string,
    signature: string,
    rawBody: string,
  ): Promise<boolean> {
    if (!signingSecret || !timestamp || !signature) return false

    const baseString = `v0:${timestamp}:${rawBody}`
    const expected = `v0=${createHmac('sha256', signingSecret).update(baseString).digest('hex')}`

    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    } catch {
      return false
    }
  }

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId
  }

  async receive(
    rawPayload: Record<string, unknown>,
    secrets:    Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const payload = rawPayload as unknown as SlackWebhookPayload

    // Challenge de verificación de Slack
    if (payload.type === 'url_verification') return null

    const event = payload.event
    if (!event || event.type !== 'message') return null

    // Ignorar mensajes de bots (evitar loops)
    if (event.bot_id) return null

    const botToken  = String(secrets['botToken'] ?? secrets['bot_token'] ?? '')
    const channelId = event.channel

    // [F3a-17] threadId: thread_ts si existe (es un reply en un hilo)
    //          En DM o mensaje raíz: thread_ts no existe → usar ts
    const threadId = event.thread_ts ?? event.ts

    // [F3a-17] replyFn: closure con botToken y channelId
    let replied = false
    const replyFn = async (replyText: string) => {
      if (replied) return
      replied = true

      await fetch('https://slack.com/api/chat.postMessage', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel:   channelId,
          text:      replyText,
          thread_ts: threadId,  // siempre reply en el mismo thread
        }),
        signal: AbortSignal.timeout(10_000),
      })
    }

    const sanitized = this.sanitizeRawPayload(
      rawPayload,
      ['botToken', 'bot_token', 'token'],
    )

    return {
      externalId: channelId,
      threadId,
      senderId:   event.user ?? '',
      text:       event.text ?? '',
      type:       'text',
      rawPayload: sanitized,
      receivedAt: this.makeTimestamp(),
      replyFn,
    }
  }

  async send(message: OutgoingMessage, _config?: Record<string, unknown>, secrets?: Record<string, unknown>): Promise<void> {
    const botToken = String(secrets?.['botToken'] ?? secrets?.['bot_token'] ?? '')
    await fetch('https://slack.com/api/chat.postMessage', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel:   message.externalId,
        text:      message.text,
        thread_ts: message.threadId,
      }),
    })
  }

  async dispose(): Promise<void> {
    // noop
  }
}
