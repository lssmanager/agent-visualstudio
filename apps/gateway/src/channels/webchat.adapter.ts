import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface.js'

/**
 * Conexión WebSocket/SSE activa para una sesión de WebChat.
 */
export interface WebChatConnection {
  send(data: string): void
  close(): void
}

/**
 * WebChatAdapter — adaptador para el canal WebChat (WebSocket / SSE)
 * [F3a-17] replyFn emite al WebSocket/SSE de la sesión activa.
 *          Si la sesión no está conectada, encola el reply.
 */
export class WebChatAdapter extends BaseChannelAdapter {
  readonly channel = 'webchat'

  /** Conexiones WebSocket/SSE activas, por sessionId */
  protected readonly activeConnections = new Map<string, WebChatConnection>()

  /** Replies pendientes para sesiones desconectadas, por sessionId */
  protected readonly pendingReplies = new Map<string, string[]>()

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId
  }

  /**
   * Registra una conexión WebSocket/SSE activa para una sesión.
   * Llamado por el WebChat controller cuando el cliente conecta.
   */
  registerConnection(sessionId: string, connection: WebChatConnection): void {
    this.activeConnections.set(sessionId, connection)
    // Vaciar replies pendientes que se acumularon mientras estaba desconectado
    const pending = this.pendingReplies.get(sessionId)
    if (pending?.length) {
      for (const text of pending) {
        connection.send(JSON.stringify({ type: 'message', text }))
      }
      this.pendingReplies.delete(sessionId)
    }
  }

  /**
   * Elimina la conexión cuando el cliente desconecta.
   */
  unregisterConnection(sessionId: string): void {
    this.activeConnections.delete(sessionId)
  }

  async receive(
    rawPayload: Record<string, unknown>,
    _secrets:   Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const sessionId = String(rawPayload['sessionId'] ?? rawPayload['session_id'] ?? '')
    if (!sessionId) return null

    const text     = String(rawPayload['text'] ?? rawPayload['message'] ?? '')
    const senderId = String(rawPayload['userId'] ?? rawPayload['user_id'] ?? sessionId)

    // WebChat: sessionId = externalId = threadId (1 sesión = 1 hilo)
    const externalId = sessionId
    const threadId   = sessionId

    // [F3a-17] replyFn: emite al WebSocket/SSE activo o encola
    let replied = false
    const replyFn = async (replyText: string) => {
      if (replied) return
      replied = true

      const connection = this.activeConnections.get(sessionId)
      if (connection) {
        connection.send(JSON.stringify({ type: 'message', text: replyText }))
      } else {
        // Sesión desconectada → encolar para cuando reconecte
        const queue = this.pendingReplies.get(sessionId)
        if (queue) {
          queue.push(replyText)
        } else {
          this.pendingReplies.set(sessionId, [replyText])
        }
      }
    }

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

  async send(message: OutgoingMessage): Promise<void> {
    const connection = this.activeConnections.get(message.externalId)
    if (connection) {
      connection.send(JSON.stringify({ type: 'message', text: message.text }))
    } else {
      const queue = this.pendingReplies.get(message.externalId)
      if (queue) {
        queue.push(message.text)
      } else {
        this.pendingReplies.set(message.externalId, [message.text])
      }
    }
  }

  async dispose(): Promise<void> {
    for (const conn of this.activeConnections.values()) {
      conn.close()
    }
    this.activeConnections.clear()
    this.pendingReplies.clear()
  }
}
