import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface.js'

/**
 * WebhookAdapter — adaptador para webhooks genéricos (cualquier HTTP callback)
 * [F3a-17] replyFn hace POST al callbackUrl si está en el payload.
 *          Sin callbackUrl → replyFn = undefined → path legacy.
 */
export class WebhookAdapter extends BaseChannelAdapter {
  readonly channel = 'webhook'

  static verifySecret(
    config: { webhookSecret?: string },
    authHeader?: string,
    xWebhookSecret?: string,
  ): boolean {
    const expected = config.webhookSecret ?? ''
    if (!expected) return true

    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const provided = xWebhookSecret ?? bearer
    return provided === expected
  }

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId
  }

  async receive(
    rawPayload: Record<string, unknown>,
    _secrets:   Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const text        = String(rawPayload['text'] ?? rawPayload['message'] ?? rawPayload['body'] ?? '')
    const externalId  = String(rawPayload['sessionId'] ?? rawPayload['id'] ?? rawPayload['chatId'] ?? 'unknown')
    const threadId    = String(rawPayload['threadId'] ?? externalId)
    const senderId    = String(rawPayload['userId'] ?? rawPayload['senderId'] ?? externalId)
    const callbackUrl = rawPayload['callbackUrl'] as string | undefined

    // [F3a-17] replyFn solo si hay callbackUrl en el payload
    let replied = false
    const replyFn = callbackUrl
      ? async (replyText: string) => {
          if (replied) return
          replied = true

          await fetch(callbackUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ reply: replyText, externalId }),
            signal:  AbortSignal.timeout(10_000),
          })
        }
      : undefined   // sin callbackUrl → replyFn undefined → path legacy en dispatch()

    const sanitized = this.sanitizeRawPayload(rawPayload)

    return {
      externalId,
      threadId,
      senderId,
      text,
      type:       'text',
      rawPayload: sanitized,
      receivedAt: this.makeTimestamp(),
      replyFn,
    }
  }

  async send(message: OutgoingMessage, _config?: Record<string, unknown>, _secrets?: Record<string, unknown>): Promise<void> {
    // Webhook genérico no tiene un endpoint de envío fijo.
    // El callbackUrl solo existe en el contexto de receive().
    // Este método solo se invoca en el path legacy (sin replyFn).
    console.warn('[WebhookAdapter] send() called on legacy path — no callbackUrl available')
    console.warn(`[WebhookAdapter] Dropping outgoing message for externalId=${message.externalId}`)
  }

  async dispose(): Promise<void> {
    // noop
  }
}
