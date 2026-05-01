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
  protected readonly activeConnections = new Map<string, Set<WebChatConnection>>()

  /** Replies pendientes para sesiones desconectadas, por sessionId */
  protected readonly pendingReplies = new Map<string, { messages: string[]; lastTouchedAt: number }>()

  private static readonly MAX_PENDING_SESSIONS = 500
  private static readonly MAX_PENDING_MESSAGES_PER_SESSION = 50
  private static readonly PENDING_TTL_MS = 60 * 60 * 1000

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId
  }

  /**
   * Registra una conexión WebSocket/SSE activa para una sesión.
   * Llamado por el WebChat controller cuando el cliente conecta.
   */
  registerConnection(sessionId: string, connection: WebChatConnection): void {
    let connections = this.activeConnections.get(sessionId)
    if (!connections) {
      connections = new Set<WebChatConnection>()
      this.activeConnections.set(sessionId, connections)
    }
    connections.add(connection)

    // Vaciar replies pendientes que se acumularon mientras estaba desconectado
    const pending = this.pendingReplies.get(sessionId)
    if (pending?.messages.length) {
      for (const text of pending.messages) {
        connection.send(JSON.stringify({ type: 'message', text }))
      }
      this.pendingReplies.delete(sessionId)
    }
  }

  /**
   * Elimina la conexión cuando el cliente desconecta.
   */
  unregisterConnection(sessionId: string, connection?: WebChatConnection): void {
    if (!connection) {
      this.activeConnections.delete(sessionId)
      return
    }

    const connections = this.activeConnections.get(sessionId)
    if (!connections) return
    connections.delete(connection)
    if (connections.size === 0) {
      this.activeConnections.delete(sessionId)
    }
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

      const connections = this.activeConnections.get(sessionId)
      if (connections && connections.size > 0) {
        for (const connection of connections) {
          connection.send(JSON.stringify({ type: 'message', text: replyText }))
        }
      } else {
        this.enqueuePendingReply(sessionId, replyText)
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
    const connections = this.activeConnections.get(message.externalId)
    if (connections && connections.size > 0) {
      for (const connection of connections) {
        connection.send(JSON.stringify({ type: 'message', text: message.text }))
      }
    } else {
      this.enqueuePendingReply(message.externalId, message.text)
    }
  }

  async dispose(): Promise<void> {
    for (const conn of this.activeConnections.values()) {
      for (const connection of conn) {
        connection.close()
      }
    }
    this.activeConnections.clear()
    this.pendingReplies.clear()
  }

  private enqueuePendingReply(sessionId: string, replyText: string): void {
    this.prunePendingReplies()

    const now = Date.now()
    const queue = this.pendingReplies.get(sessionId) ?? { messages: [], lastTouchedAt: now }
    queue.messages.push(replyText)
    queue.lastTouchedAt = now

    if (queue.messages.length > WebChatAdapter.MAX_PENDING_MESSAGES_PER_SESSION) {
      queue.messages.splice(
        0,
        queue.messages.length - WebChatAdapter.MAX_PENDING_MESSAGES_PER_SESSION,
      )
    }

    this.pendingReplies.set(sessionId, queue)
  }

  private prunePendingReplies(now = Date.now()): void {
    for (const [sessionId, queue] of this.pendingReplies.entries()) {
      if (now - queue.lastTouchedAt > WebChatAdapter.PENDING_TTL_MS) {
        this.pendingReplies.delete(sessionId)
      }
    }

    if (this.pendingReplies.size <= WebChatAdapter.MAX_PENDING_SESSIONS) {
      return
    }

    const oldest = [...this.pendingReplies.entries()]
      .sort((a, b) => a[1].lastTouchedAt - b[1].lastTouchedAt)
      .slice(0, this.pendingReplies.size - WebChatAdapter.MAX_PENDING_SESSIONS)

    for (const [sessionId] of oldest) {
      this.pendingReplies.delete(sessionId)
    }
  }
}
