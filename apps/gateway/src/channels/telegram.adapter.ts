import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface.js'

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id:        number
    message_thread_id?: number
    from?:             { id: number; username?: string; first_name?: string }
    chat:              { id: number; type: string }
    text?:             string
    date:              number
  }
  callback_query?: {
    id:      string
    from:    { id: number }
    message?: { chat: { id: number }; message_id: number }
    data?:   string
  }
}

/**
 * TelegramAdapter — adaptador para Telegram Bot API
 * [F3a-17] Popula replyFn, threadId, rawPayload en receive()
 */
export class TelegramAdapter extends BaseChannelAdapter {
  readonly channel = 'telegram'

  private botToken = ''

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId
  }

  /**
   * receive() parsea el webhook update de Telegram y construye IncomingMessage
   * con los tres campos nuevos de F3a-17.
   */
  async receive(
    rawPayload: Record<string, unknown>,
    secrets:    Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const update = rawPayload as unknown as TelegramUpdate

    if (!update.message && !update.callback_query) return null

    const botToken = String(secrets['botToken'] ?? secrets['bot_token'] ?? '')

    // ── Extraer campos del mensaje ────────────────────────────────────────
    let chatId:    string
    let senderId:  string
    let text:      string
    let messageId: number
    let threadId:  string

    if (update.message) {
      chatId    = String(update.message.chat.id)
      senderId  = String(update.message.from?.id ?? '')
      text      = update.message.text ?? ''
      messageId = update.message.message_id

      // [F3a-17] threadId: message_thread_id si es supergrupo, sino chatId
      threadId  = update.message.message_thread_id
                    ? String(update.message.message_thread_id)
                    : chatId
    } else {
      // callback_query
      chatId    = String(update.callback_query!.message?.chat.id ?? '')
      senderId  = String(update.callback_query!.from.id)
      text      = update.callback_query!.data ?? ''
      messageId = update.callback_query!.message?.message_id ?? 0
      threadId  = chatId
    }

    // ── [F3a-17] Construir replyFn ────────────────────────────────────────
    // Closure: captura botToken, chatId, messageId, threadId de este scope.
    let replied = false
    const replyFn = async (replyText: string, opts?: { format?: string; quoteOriginal?: boolean }) => {
      if (replied) return  // idempotente
      replied = true

      const url  = `https://api.telegram.org/bot${botToken}/sendMessage`
      const body: Record<string, unknown> = {
        chat_id:    chatId,
        text:       replyText,
        parse_mode: opts?.format === 'markdown' ? 'Markdown'
                  : opts?.format === 'html'     ? 'HTML'
                  : undefined,
        reply_to_message_id: opts?.quoteOriginal ? messageId : undefined,
      }

      // Si hay threadId de supergrupo, incluir message_thread_id
      if (update.message?.message_thread_id) {
        body['message_thread_id'] = update.message.message_thread_id
      }

      await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(10_000),
      })
    }

    // ── [F3a-17] Sanitizar rawPayload (eliminar token del bot) ────────────
    const sanitized = this.sanitizeRawPayload(
      rawPayload,
      ['botToken', 'bot_token'],
    )

    return {
      externalId: chatId,
      threadId,
      senderId,
      text,
      type:       'text',
      rawPayload: sanitized,
      receivedAt: this.makeTimestamp(),
      replyFn,
    }
  }

  async send(message: OutgoingMessage): Promise<void> {
    const url  = `https://api.telegram.org/bot${this.botToken}/sendMessage`
    const body: Record<string, unknown> = {
      chat_id:   message.externalId,
      text:      message.text,
    }
    if (message.threadId && message.threadId !== message.externalId) {
      body['message_thread_id'] = message.threadId
    }
    await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
  }

  async dispose(): Promise<void> {
    // noop
  }
}
