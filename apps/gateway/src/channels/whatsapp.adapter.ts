import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface.js'

interface WhatsAppMessage {
  id:        string
  from:      string
  type:      string
  timestamp: string
  text?:     { body: string }
}

interface WhatsAppWebhookPayload {
  object: string
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?:      WhatsAppMessage[]
        contacts?:      Array<{ profile: { name: string }; wa_id: string }>
        phone_number_id?: string
      }
    }>
  }>
}

/**
 * WhatsAppAdapter — adaptador para la WhatsApp Cloud API (Meta)
 * [F3a-17] Popula replyFn, threadId (=externalId, sin threads nativos), rawPayload
 */
export class WhatsAppAdapter extends BaseChannelAdapter {
  readonly channel = 'whatsapp'

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId
  }

  async receive(
    rawPayload: Record<string, unknown>,
    secrets:    Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const payload     = rawPayload as unknown as WhatsAppWebhookPayload
    const change      = payload.entry?.[0]?.changes?.[0]
    const value       = change?.value
    const message     = value?.messages?.[0]

    if (!message) return null

    const phoneNumberId = String(value?.phone_number_id ?? secrets['phoneNumberId'] ?? '')
    const accessToken   = String(secrets['accessToken'] ?? secrets['access_token'] ?? '')

    // WhatsApp no tiene threads nativos → threadId = externalId (número del remitente)
    const to       = message.from
    const threadId = to

    // [F3a-17] replyFn: closure con accessToken y phoneNumberId
    let replied = false
    const replyFn = async (replyText: string, opts?: { quoteOriginal?: boolean }) => {
      if (replied) return
      replied = true

      const url = `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`
      await fetch(url, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: replyText },
          context: opts?.quoteOriginal ? { message_id: message.id } : undefined,
        }),
        signal: AbortSignal.timeout(10_000),
      })
    }

    const sanitized = this.sanitizeRawPayload(rawPayload, ['accessToken', 'access_token'])

    return {
      externalId: to,
      threadId,
      senderId:   message.from,
      text:       message.text?.body ?? '',
      type:       'text',
      rawPayload: sanitized,
      receivedAt: this.makeTimestamp(),
      replyFn,
    }
  }

  async send(message: OutgoingMessage, _config?: Record<string, unknown>, secrets?: Record<string, unknown>): Promise<void> {
    const accessToken   = String(secrets?.['accessToken'] ?? secrets?.['access_token'] ?? '')
    const phoneNumberId = String(secrets?.['phoneNumberId'] ?? '')
    const url = `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`
    await fetch(url, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   message.externalId,
        type: 'text',
        text: { body: message.text },
      }),
    })
  }

  async dispose(): Promise<void> {
    // noop
  }
}
