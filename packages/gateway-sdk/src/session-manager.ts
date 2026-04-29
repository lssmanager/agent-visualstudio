/**
 * SessionManager — Prisma / ConversationMessage implementation
 *
 * Reemplaza la dependencia de `GatewaySession` (modelo inexistente en el schema)
 * por `ConversationMessage` y `Channel` que sí existen.
 *
 * Responsabilidades:
 *   1. receiveUserMessage()   — persiste el turno de usuario en ConversationMessage
 *   2. recordAssistantReply() — persiste la respuesta del agente
 *   3. getHistory()           — devuelve los últimos N mensajes para inyección de contexto
 *   4. findOrCreateSession()  — resuelve channelId + sessionId desde (channelId, externalUserId)
 *
 * Diseño de sesión:
 *   - sessionId = `${channelId}:${externalUserId}` (determinista, sin tabla extra)
 *   - No se almacena estado de sesión activo/pausado aquí; eso lo maneja el gateway con
 *     un Map en memoria (efimero por diseño, se pierde al reiniciar).
 *
 * Límite de historial:
 *   - GATEWAY_SESSION_MAX_HISTORY (default 200) mensajes por sesión.
 *   - Al consultar con getHistory(n) se devuelven los últimos n registros ordenados asc.
 */

import type { PrismaClient } from '@prisma/client'
import type { IncomingMessage, OutboundMessage } from './channel-adapter.js'

const MAX_HISTORY = Number(process.env.GATEWAY_SESSION_MAX_HISTORY ?? 200)

// ── Tipos públicos ──────────────────────────────────────────────────────────────

export interface SessionHistoryEntry {
  role:       'user' | 'assistant' | 'system' | 'tool'
  content:    string
  ts:         string
  toolName?:  string
  toolCallId?: string
}

export interface ActiveSession {
  /** channelId (FK a Channel) */
  channelId:      string
  /** sessionId determinista: `${channelId}:${externalUserId}` */
  sessionId:      string
  agentId:        string
  externalUserId: string
  /** Últimos N mensajes cargados de ConversationMessage */
  history:        SessionHistoryEntry[]
}

// ── SessionManager ────────────────────────────────────────────────────────────

export class SessionManager {
  constructor(private readonly db: PrismaClient) {}

  // ── Derivar sessionId ───────────────────────────────────────────────

  static buildSessionId(channelId: string, externalUserId: string): string {
    return `${channelId}:${externalUserId}`
  }

  // ── Recibir mensaje de usuario ─────────────────────────────────────────

  /**
   * Persiste el turno de usuario en ConversationMessage y devuelve la sesión activa
   * con el historial de los últimos MAX_HISTORY mensajes.
   *
   * @param channelId  ID del Channel en DB (no el chat_id externo)
   * @param agentId    ID del Agent vinculado al canal
   * @param incoming   Mensaje canonicalizado por el IChannelAdapter
   */
  async receiveUserMessage(
    channelId: string,
    agentId:   string,
    incoming:  IncomingMessage,
  ): Promise<ActiveSession> {
    const sessionId = SessionManager.buildSessionId(channelId, incoming.externalUserId)

    // Persistir turno de usuario
    await this.db.conversationMessage.create({
      data: {
        channelId,
        sessionId,
        role:     'user',
        content:  buildUserContent(incoming),
        metadata: incoming.metadata as never,
      },
    })

    const history = await this.loadHistory(channelId, sessionId, MAX_HISTORY)

    return {
      channelId,
      sessionId,
      agentId,
      externalUserId: incoming.externalUserId,
      history,
    }
  }

  // ── Registrar respuesta del agente ───────────────────────────────────────

  /**
   * Persiste la respuesta del asistente en ConversationMessage.
   * Llamar después de que LLMStepExecutor produce la respuesta.
   */
  async recordAssistantReply(
    channelId:  string,
    sessionId:  string,
    outbound:   OutboundMessage,
  ): Promise<void> {
    await this.db.conversationMessage.create({
      data: {
        channelId,
        sessionId,
        role:    'assistant',
        content: outbound.text,
      },
    })
  }

  /**
   * Persiste un mensaje de herramienta (tool call result).
   * Usado por LLMStepExecutor cuando skill-invoker devuelve un resultado.
   */
  async recordToolResult(
    channelId:  string,
    sessionId:  string,
    toolName:   string,
    toolCallId: string,
    result:     string,
  ): Promise<void> {
    await this.db.conversationMessage.create({
      data: {
        channelId,
        sessionId,
        role:       'tool',
        content:    result,
        toolName,
        toolCallId,
      },
    })
  }

  /**
   * Persiste un mensaje de sistema (inyección de system prompt en el historial).
   * Útil para registrar cambios de profile.
   */
  async recordSystemMessage(
    channelId: string,
    sessionId: string,
    content:   string,
  ): Promise<void> {
    await this.db.conversationMessage.create({
      data: { channelId, sessionId, role: 'system', content },
    })
  }

  // ── Consultas de historial ───────────────────────────────────────────────

  /**
   * Devuelve los últimos `limit` mensajes de la sesión, ordenados asc (más antiguo primero).
   * Formato compatible con OpenAI messages array.
   */
  async getHistory(
    channelId: string,
    sessionId: string,
    limit = 20,
  ): Promise<SessionHistoryEntry[]> {
    return this.loadHistory(channelId, sessionId, Math.min(limit, MAX_HISTORY))
  }

  /**
   * Construye el array de mensajes OpenAI-compatible para inyección en el LLM.
   * Antepone el system prompt del AgentProfile si se provee.
   *
   * @param systemPrompt  System prompt del AgentProfile (opcional)
   * @param limit         Número de mensajes de historial a incluir (default 20)
   */
  async buildLlmMessages(
    channelId:    string,
    sessionId:    string,
    systemPrompt?: string,
    limit = 20,
  ): Promise<Array<{ role: string; content: string; name?: string }>> {
    const history = await this.getHistory(channelId, sessionId, limit)

    const messages: Array<{ role: string; content: string; name?: string }> = []

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }

    for (const entry of history) {
      if (entry.role === 'system') continue  // skip persisted system messages si ya hay uno
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
   * Busca una sesión activa por (channelId, externalUserId).
   * No crea la sesión — sólo verifica si hay historial previo.
   */
  async findSession(
    channelId:      string,
    externalUserId: string,
  ): Promise<ActiveSession | null> {
    const sessionId = SessionManager.buildSessionId(channelId, externalUserId)
    const count = await this.db.conversationMessage.count({
      where: { channelId, sessionId },
    })
    if (count === 0) return null

    const channel = await this.db.channel.findUnique({ where: { id: channelId } })
    if (!channel) return null

    const history = await this.loadHistory(channelId, sessionId, MAX_HISTORY)
    return {
      channelId,
      sessionId,
      agentId:        channel.boundAgentId ?? '',
      externalUserId,
      history,
    }
  }

  /**
   * Elimina todos los mensajes de una sesión (reset de contexto).
   */
  async clearSession(channelId: string, sessionId: string): Promise<number> {
    const { count } = await this.db.conversationMessage.deleteMany({
      where: { channelId, sessionId },
    })
    return count
  }

  /**
   * Cuenta el total de mensajes de una sesión.
   */
  async countMessages(channelId: string, sessionId: string): Promise<number> {
    return this.db.conversationMessage.count({ where: { channelId, sessionId } })
  }

  // ── Privado ──────────────────────────────────────────────────────────────────

  private async loadHistory(
    channelId: string,
    sessionId: string,
    limit:     number,
  ): Promise<SessionHistoryEntry[]> {
    const rows = await this.db.conversationMessage.findMany({
      where:   { channelId, sessionId },
      orderBy: { createdAt: 'desc' },
      take:    limit,
      select:  {
        role:       true,
        content:    true,
        toolName:   true,
        toolCallId: true,
        createdAt:  true,
      },
    })

    // Invertir para orden cronológico asc (más antiguo primero)
    return rows.reverse().map((r) => ({
      role:       r.role as SessionHistoryEntry['role'],
      content:    r.content,
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
