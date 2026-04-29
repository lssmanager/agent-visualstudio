/**
 * SessionManager — implementación correcta sobre GatewaySession + ConversationMessage
 *
 * Diseño:
 *   - GatewaySession es el punto de entrada único. Se upsert por
 *     (channelConfigId, externalId) que ya tiene @@unique en el schema.
 *   - ConversationMessage usa session.id como FK real (no string derivado).
 *   - contentJson almacena la estructura OpenAI-compatible completa.
 *   - contentText es el texto plano para full-text search.
 *
 * Métodos:
 *   receiveUserMessage()    — upsert GatewaySession + INSERT ConversationMessage user
 *   recordAssistantReply()  — INSERT ConversationMessage assistant
 *   recordToolResult()      — INSERT ConversationMessage tool
 *   recordSystemMessage()   — INSERT ConversationMessage system
 *   buildLlmMessages()      — SELECT últimos N + mapeo OpenAI messages[]
 *   findSession()           — lookup por (channelConfigId, externalId)
 *   setSessionState()       — active | idle | closed
 *   clearSession()          — DELETE todos los ConversationMessage de la sesión
 */

import type { PrismaClient } from '@prisma/client'
import type { IncomingMessage, OutboundMessage } from './channel-adapter.js'

const MAX_HISTORY = Number(process.env.GATEWAY_SESSION_MAX_HISTORY ?? 200)

// ── Tipos públicos ──────────────────────────────────────────────────────────────

export interface SessionHistoryEntry {
  role:        'user' | 'assistant' | 'system' | 'tool'
  content:     string
  ts:          string
  toolName?:   string
  toolCallId?: string
}

export interface ActiveSession {
  /** GatewaySession.id (cuid) */
  sessionId:      string
  channelConfigId: string
  agentId:        string
  externalId:     string
  state:          string
  history:        SessionHistoryEntry[]
}

// ── SessionManager ────────────────────────────────────────────────────────────

export class SessionManager {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Upsert GatewaySession y persiste el turno de usuario en ConversationMessage.
   * Devuelve la sesión activa con los últimos MAX_HISTORY mensajes.
   *
   * @param channelConfigId  ID del ChannelConfig en DB
   * @param agentId          ID del Agent vinculado al canal
   * @param incoming         Mensaje canonicalizado por el IChannelAdapter
   */
  async receiveUserMessage(
    channelConfigId: string,
    agentId:         string,
    incoming:        IncomingMessage,
  ): Promise<ActiveSession> {
    // 1. Upsert GatewaySession por (channelConfigId, externalId)
    const session = await this.db.gatewaySession.upsert({
      where: {
        channelConfigId_externalId: { channelConfigId, externalId: incoming.externalUserId },
      },
      create: {
        channelConfigId,
        externalId: incoming.externalUserId,
        agentId,
        state:          'active',
        lastActivityAt: new Date(),
      },
      update: {
        state:          'active',
        lastActivityAt: new Date(),
        updatedAt:      new Date(),
      },
    })

    // 2. INSERT ConversationMessage con FK real a session.id
    const text = buildUserContent(incoming)
    await this.db.conversationMessage.create({
      data: {
        sessionId:   session.id,
        role:        'user',
        contentText: text,
        contentJson: buildContentJson('user', text, incoming.metadata),
        metadata:    incoming.metadata as never,
      },
    })

    const history = await this.loadHistory(session.id, MAX_HISTORY)

    return {
      sessionId:       session.id,
      channelConfigId,
      agentId:         session.agentId,
      externalId:      session.externalId,
      state:           session.state,
      history,
    }
  }

  /**
   * Persiste la respuesta del asistente en ConversationMessage.
   * Llamar después de que LLMStepExecutor produce la respuesta.
   */
  async recordAssistantReply(
    sessionId: string,
    outbound:  OutboundMessage,
  ): Promise<void> {
    await this.db.conversationMessage.create({
      data: {
        sessionId,
        role:        'assistant',
        contentText: outbound.text,
        contentJson: buildContentJson('assistant', outbound.text),
      },
    })
  }

  /**
   * Persiste un tool call result en ConversationMessage.
   * Usado por LLMStepExecutor en el loop de function calling.
   */
  async recordToolResult(
    sessionId:  string,
    toolName:   string,
    toolCallId: string,
    result:     string,
  ): Promise<void> {
    await this.db.conversationMessage.create({
      data: {
        sessionId,
        role:        'tool',
        contentText: result,
        contentJson: { type: 'tool_result', tool_use_id: toolCallId, content: result },
        toolName,
        toolCallId,
      },
    })
  }

  /**
   * Persiste un mensaje de sistema.
   * Útil para registrar cambios de profile o inyecciones de contexto.
   */
  async recordSystemMessage(
    sessionId: string,
    content:   string,
  ): Promise<void> {
    await this.db.conversationMessage.create({
      data: {
        sessionId,
        role:        'system',
        contentText: content,
        contentJson: content,
      },
    })
  }

  /**
   * Construye el array de mensajes OpenAI-compatible para inyección en el LLM.
   * Antepone el system prompt si se provee.
   * Omite mensajes de sistema del historial (ya están en systemPrompt).
   *
   * @param sessionId    GatewaySession.id
   * @param systemPrompt System prompt del AgentProfile (opcional)
   * @param limit        Número de mensajes de historial a incluir (default 20)
   */
  async buildLlmMessages(
    sessionId:     string,
    systemPrompt?: string,
    limit = 20,
  ): Promise<Array<{ role: string; content: string; name?: string }>> {
    const history = await this.loadHistory(sessionId, Math.min(limit, MAX_HISTORY))

    const messages: Array<{ role: string; content: string; name?: string }> = []

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }

    for (const entry of history) {
      // Saltar mensajes de sistema del historial si ya inyectamos uno
      if (entry.role === 'system' && systemPrompt) continue
      const msg: { role: string; content: string; name?: string } = {
        role:    entry.role,
        content: entry.content,
      }
      if (entry.toolName) msg.name = entry.toolName
      messages.push(msg)
    }

    return messages
  }

  /**
   * Busca una sesión activa por (channelConfigId, externalId).
   * Devuelve null si no existe.
   */
  async findSession(
    channelConfigId: string,
    externalId:      string,
  ): Promise<ActiveSession | null> {
    const session = await this.db.gatewaySession.findUnique({
      where: { channelConfigId_externalId: { channelConfigId, externalId } },
    })
    if (!session) return null

    const history = await this.loadHistory(session.id, MAX_HISTORY)
    return {
      sessionId:       session.id,
      channelConfigId: session.channelConfigId,
      agentId:         session.agentId,
      externalId:      session.externalId,
      state:           session.state,
      history,
    }
  }

  /**
   * Cambia el estado de la sesión.
   */
  async setSessionState(
    sessionId: string,
    state:     'active' | 'idle' | 'closed',
  ): Promise<void> {
    await this.db.gatewaySession.update({
      where: { id: sessionId },
      data:  { state, updatedAt: new Date() },
    })
  }

  /**
   * Elimina todos los mensajes de una sesión (reset de contexto).
   * No elimina la GatewaySession.
   */
  async clearSession(sessionId: string): Promise<number> {
    const { count } = await this.db.conversationMessage.deleteMany({
      where: { sessionId },
    })
    return count
  }

  /**
   * Cuenta el total de mensajes de una sesión.
   */
  async countMessages(sessionId: string): Promise<number> {
    return this.db.conversationMessage.count({ where: { sessionId } })
  }

  // ── Privado ──────────────────────────────────────────────────────────────────

  private async loadHistory(
    sessionId: string,
    limit:     number,
  ): Promise<SessionHistoryEntry[]> {
    const rows = await this.db.conversationMessage.findMany({
      where:   { sessionId },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      select:  {
        role:        true,
        contentText: true,
        toolName:    true,
        toolCallId:  true,
        createdAt:   true,
      },
    })

    // Invertir para orden cronológico asc (más antiguo primero)
    return rows.reverse().map((r) => ({
      role:       r.role as SessionHistoryEntry['role'],
      content:    r.contentText ?? '',
      ts:         r.createdAt.toISOString(),
      toolName:   r.toolName ?? undefined,
      toolCallId: r.toolCallId ?? undefined,
    }))
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildUserContent(msg: IncomingMessage): string {
  const parts: string[] = []
  if (msg.text) parts.push(msg.text)
  for (const att of msg.attachments) {
    parts.push(`[attachment: ${att.mimeType} ${att.name ?? att.url}]`)
  }
  return parts.join('\n') || '(empty message)'
}

function buildContentJson(
  role:     string,
  text:     string,
  metadata?: Record<string, unknown>,
): unknown {
  if (role === 'user') {
    return [{ type: 'text', text, ...(metadata ? { _meta: metadata } : {}) }]
  }
  if (role === 'assistant') {
    return [{ type: 'text', text }]
  }
  // system, tool: guardar como string simple
  return text
}
