/**
 * ConversationMessageRepository — Prisma implementation (F0-06)
 *
 * D-15: historial append-only.
 *   - NUNCA hace UPDATE ni DELETE sobre ConversationMessage.
 *   - Todo acceso de escritura es vía append() o appendBatch().
 *   - Garantiza que el historial sea inmutable e auditable.
 *
 * Columnas clave del modelo:
 *   sessionId        — FK → GatewaySession (CASCADE)
 *   role             — 'user' | 'assistant' | 'system' | 'tool'
 *   contentText      — representación plana del mensaje (nullable)
 *   contentJson      — estructura completa del mensaje (JSONB)
 *   channelMessageId — ID externo del canal (Discord, WA, etc.) — nullable
 *   toolCallId       — ID de la tool call (para mensajes role='tool')
 *   toolName         — nombre de la herramienta invocada
 *   scopeType/Id     — nivel que produjo el mensaje (agent/workspace/…)
 *   tokenCount       — tokens consumidos por este mensaje (nullable)
 */

import type { PrismaClient } from '@prisma/client'

// ── Tipos auxiliares ─────────────────────────────────────────────────────────

/** Roles estándar LLM + extensión de canal. */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface AppendMessageInput {
  sessionId:         string
  role:              MessageRole
  /** Texto plano del mensaje (para búsqueda rápida / display). */
  contentText?:      string
  /** Estructura completa del mensaje (contenido OpenAI, tool calls, etc.). */
  contentJson:       Record<string, unknown>
  /** ID del mensaje en el canal externo (Discord message ID, WA ID, etc.). */
  channelMessageId?: string
  /** ID de la tool call a la que responde este mensaje (role='tool'). */
  toolCallId?:       string
  /** Nombre de la herramienta invocada. */
  toolName?:         string
  /** Nivel que produjo el mensaje: 'agent' | 'workspace' | 'department' | 'agency'. */
  scopeType?:        string
  /** ID del scope (agentId, workspaceId, …). */
  scopeId?:          string
  /** Tokens estimados/contados para este mensaje. */
  tokenCount?:       number
}

export interface FindMessagesOptions {
  /** Roles a incluir (undefined = todos). */
  roles?:      MessageRole[]
  /** Solo mensajes a partir de esta fecha. */
  since?:      Date
  /** Solo mensajes hasta esta fecha. */
  until?:      Date
  limit?:      number
  offset?:     number
  /** 'asc' = cronológico (default), 'desc' = más reciente primero. */
  order?:      'asc' | 'desc'
}

// ── Repository ────────────────────────────────────────────────────────────────

export class ConversationMessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Write (append-only) ─────────────────────────────────────────────

  /**
   * Inserta un mensaje en la sesión.
   * ⚠ï¸ Esta es la única operación de escritura permitida (D-15).
   */
  async append(input: AppendMessageInput) {
    return this.prisma.conversationMessage.create({
      data: {
        sessionId:        input.sessionId,
        role:             input.role,
        contentText:      input.contentText,
        contentJson:      input.contentJson as never,
        channelMessageId: input.channelMessageId,
        toolCallId:       input.toolCallId,
        toolName:         input.toolName,
        scopeType:        input.scopeType,
        scopeId:          input.scopeId,
        tokenCount:       input.tokenCount,
      },
    })
  }

  /**
   * Inserta varios mensajes en una transacción atómica.
   * Útil para guardar el turno completo (user + assistant + tool results)
   * de forma atómica y en orden.
   */
  async appendBatch(inputs: AppendMessageInput[]) {
    if (inputs.length === 0) return []

    return this.prisma.$transaction(
      inputs.map((input) =>
        this.prisma.conversationMessage.create({
          data: {
            sessionId:        input.sessionId,
            role:             input.role,
            contentText:      input.contentText,
            contentJson:      input.contentJson as never,
            channelMessageId: input.channelMessageId,
            toolCallId:       input.toolCallId,
            toolName:         input.toolName,
            scopeType:        input.scopeType,
            scopeId:          input.scopeId,
            tokenCount:       input.tokenCount,
          },
        }),
      ),
    )
  }

  // ── Read ──────────────────────────────────────────────────────────────

  /**
   * Retorna los mensajes de una sesión con filtros opcionales.
   * Orden default: cronológico ascendente (para reconstruir el hilo).
   */
  async findBySession(sessionId: string, opts: FindMessagesOptions = {}) {
    return this.prisma.conversationMessage.findMany({
      where: {
        sessionId,
        ...(opts.roles ? { role: { in: opts.roles } } : {}),
        ...(opts.since || opts.until
          ? {
              createdAt: {
                ...(opts.since ? { gte: opts.since } : {}),
                ...(opts.until ? { lte: opts.until } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: opts.order ?? 'asc' },
      take:    opts.limit  ?? 200,
      skip:    opts.offset ?? 0,
    })
  }

  /**
   * Retorna los últimos N mensajes de una sesión, en orden cronológico.
   * Uso principal: reconstruir el context window del LLM antes de cada inferencia.
   *
   * Ejemplo: `findLastN(sessionId, 40)` → últimos 40 mensajes cronológicos.
   */
  async findLastN(sessionId: string, n: number) {
    const rows = await this.prisma.conversationMessage.findMany({
      where:   { sessionId },
      orderBy: { createdAt: 'desc' },
      take:    n,
    })
    // Invertir para devolver orden cronológico ascendente
    return rows.reverse()
  }

  /**
   * Retorna mensajes filtrando por scope (agentId, workspaceId, …).
   * Permite consultas cross-session por nivel jerárquico.
   */
  async findByScope(
    scopeType: string,
    scopeId: string,
    opts: Omit<FindMessagesOptions, 'roles'> = {},
  ) {
    return this.prisma.conversationMessage.findMany({
      where: {
        scopeType,
        scopeId,
        ...(opts.since || opts.until
          ? {
              createdAt: {
                ...(opts.since ? { gte: opts.since } : {}),
                ...(opts.until ? { lte: opts.until } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: opts.order ?? 'asc' },
      take:    opts.limit  ?? 200,
      skip:    opts.offset ?? 0,
    })
  }

  /** Busca un mensaje por su ID externo de canal (idempotencia de ingest). */
  async findByChannelMessageId(sessionId: string, channelMessageId: string) {
    return this.prisma.conversationMessage.findFirst({
      where: { sessionId, channelMessageId },
    })
  }

  /** Total de mensajes de una sesión, opcionalmente filtrado por rol. */
  async countBySession(sessionId: string, role?: MessageRole) {
    return this.prisma.conversationMessage.count({
      where: { sessionId, ...(role ? { role } : {}) },
    })
  }

  /**
   * Suma de tokenCount de los mensajes de una sesión.
   * Útil para calcular el uso acumulado de tokens por conversación.
   */
  async sumTokensBySession(sessionId: string): Promise<number> {
    const result = await this.prisma.conversationMessage.aggregate({
      where:  { sessionId, tokenCount: { not: null } },
      _sum:   { tokenCount: true },
    })
    return result._sum.tokenCount ?? 0
  }
}
