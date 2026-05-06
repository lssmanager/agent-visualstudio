/**
 * session-manager.service.ts
 *
 * Gestiona el ciclo de vida de GatewaySession:
 *   - upsert por (channelConfigId, externalUserId)
 *   - append de turns via ConversationMessage (role: user | assistant)
 *   - carga del historial con límite configurable (orderBy desc + reverse)
 *   - TTL de sesión (history=[] al AgentRunner si inactiva > MAX_SESSION_AGE_MS)
 *   - caché en memoria para evitar N roundtrips a DB en el mismo request
 *
 * Contrato público:
 *
 *   receiveUserMessage(
 *     channelConfigId: string,
 *     agentId:         string,
 *     incoming:        IncomingMessage,
 *   ): Promise<GatewaySessionDto>
 *
 *   recordAssistantReply(
 *     sessionId: string,
 *     outbound:  OutboundMessage,
 *   ): Promise<void>
 *
 * El schema Prisma usa ConversationMessage (no GatewaySessionTurn).
 * TODO: remover 'as any' tras npx prisma generate
 */

import type { PrismaClient } from '@prisma/client'
import type {
  GatewaySessionDto,
  SessionTurn,
  IncomingMessage,
  OutboundMessage,
} from './types'

// ── Constantes ──────────────────────────────────────────────────────

/** Máximo de turns a cargar del historial para el AgentRunner */
const MAX_HISTORY_TURNS = 40

/**
 * TTL de sesión: si updatedAt > MAX_SESSION_AGE_MS atrás,
 * el historial se retorna vacío (sesión "fría" → contexto limpio).
 * Default: 24 horas.
 */
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1_000

// ── SessionManager ────────────────────────────────────────────────────

export class SessionManager {

  /** Caché de sesiones activas: key = `${channelConfigId}:${externalUserId}` */
  private readonly cache = new Map<string, GatewaySessionDto>()

  constructor(private readonly db: PrismaClient) {}

  // ── receiveUserMessage() ────────────────────────────────────────────

  /**
   * Punto de entrada principal del flujo inbound.
   *
   * Pasos:
   *  1. Buscar sesión existente para capturar updatedAt ANTES del upsert
   *  2. Comprobar TTL contra el updatedAt ORIGINAL (no el que escribirá el upsert)
   *  3. Upsert GatewaySession con updatedAt=now
   *  4. Si la sesión estaba "fría" (> MAX_SESSION_AGE_MS sin actividad):
   *     - preserva turns anteriores en DB
   *     - pero retorna history=[] al AgentRunner (contexto limpio)
   *  5. Crear ConversationMessage con role='user'
   *  6. Cargar los últimos MAX_HISTORY_TURNS turns (desc + reverse)
   *  7. Actualizar caché y retornar GatewaySessionDto
   */
  async receiveUserMessage(
    channelConfigId: string,
    agentId:         string,
    incoming:        IncomingMessage,
  ): Promise<GatewaySessionDto> {
    const externalUserId = incoming.externalId
    const now = new Date()

    // ── 1. Leer sesión existente para capturar updatedAt original ──
    // CRÍTICO: el upsert sobreescribe updatedAt=now, así que si hacemos
    // isSessionStale(sessionRow.updatedAt) DESPUÉS del upsert, siempre
    // comparamos now vs now → nunca stale. Debemos leer ANTES.
    const existing = await (this.db as any).gatewaySession.findUnique({
      where: {
        channelConfigId_externalUserId: { channelConfigId, externalUserId },
      },
    })

    // ── 2. Comprobar TTL contra updatedAt original ─────────────────
    const isStale = existing ? this.isSessionStale(existing.updatedAt) : false

    // ── 3. Upsert sesión ───────────────────────────────────────────
    const sessionRow = await (this.db as any).gatewaySession.upsert({
      where: {
        channelConfigId_externalUserId: { channelConfigId, externalUserId },
      },
      update: {
        agentId,
        updatedAt: now,
      },
      create: {
        channelConfigId,
        externalUserId,
        agentId,
      },
    })

    // ── 4. Crear turn de usuario ─────────────────────────────────
    // TODO: remover 'as any' tras npx prisma generate
    await (this.db as any).conversationMessage.create({
      data: {
        sessionId:   sessionRow.id,
        role:        'user',
        contentText: incoming.text,
        contentJson: {
          type:     incoming.type,
          text:     incoming.text,
          metadata: incoming.metadata ?? null,
        },
      },
    })

    // ── 5. Cargar historial ──────────────────────────────────────
    const turns = isStale
      ? []
      : await this.loadTurns(sessionRow.id)

    // ── 6. Construir DTO y cachear ────────────────────────────────
    const dto: GatewaySessionDto = {
      id:              sessionRow.id,
      channelConfigId: sessionRow.channelConfigId,
      externalUserId:  sessionRow.externalUserId,
      agentId:         sessionRow.agentId,
      history:         turns,
      createdAt:       sessionRow.createdAt.toISOString(),
      updatedAt:       now.toISOString(),
    }

    this.cache.set(this.cacheKey(channelConfigId, externalUserId), dto)
    return dto
  }

  // ── recordAssistantReply() ───────────────────────────────────────

  /**
   * Persiste la respuesta del agente como ConversationMessage role='assistant'.
   * Actualiza la caché si la sesión está en memoria.
   */
  async recordAssistantReply(
    sessionId: string,
    outbound:  OutboundMessage,
  ): Promise<void> {
    // TODO: remover 'as any' tras npx prisma generate
    const msg = await (this.db as any).conversationMessage.create({
      data: {
        sessionId,
        role:        'assistant',
        contentText: outbound.text,
        contentJson: {
          type:     outbound.type ?? 'text',
          text:     outbound.text,
          metadata: outbound.metadata ?? null,
        },
      },
    })

    // Actualizar updatedAt de la sesión
    // TODO: remover 'as any' tras npx prisma generate
    await (this.db as any).gatewaySession.update({
      where: { id: sessionId },
      data:  { updatedAt: new Date() },
    })

    // Sincronizar caché si la sesión está presente
    for (const [key, cached] of this.cache.entries()) {
      if (cached.id === sessionId) {
        const newTurn: SessionTurn = {
          id:        msg.id,
          role:      'assistant',
          text:      outbound.text,
          type:      outbound.type ?? 'text',
          metadata:  outbound.metadata ?? null,
          createdAt: msg.createdAt.toISOString(),
        }
        cached.history.push(newTurn)
        // Sliding window: truncar si excede el límite
        if (cached.history.length > MAX_HISTORY_TURNS) {
          cached.history = cached.history.slice(-MAX_HISTORY_TURNS)
        }
        this.cache.set(key, cached)
        break
      }
    }
  }

  // ── findSession() ────────────────────────────────────────────────────

  /**
   * Recupera una sesión activa por su ID.
   * Cache-first: si está en memoria no hace query a DB.
   * Retorna null si no existe.
   */
  async findSession(sessionId: string): Promise<GatewaySessionDto | null> {
    // Buscar en caché primero
    for (const cached of this.cache.values()) {
      if (cached.id === sessionId) return cached
    }

    // TODO: remover 'as any' tras npx prisma generate
    const row = await (this.db as any).gatewaySession.findUnique({
      where: { id: sessionId },
    })
    if (!row) return null

    const turns = await this.loadTurns(sessionId)
    const dto: GatewaySessionDto = {
      id:              row.id,
      channelConfigId: row.channelConfigId,
      externalUserId:  row.externalUserId,
      agentId:         row.agentId,
      history:         turns,
      createdAt:       row.createdAt.toISOString(),
      updatedAt:       row.updatedAt.toISOString(),
    }
    this.cache.set(this.cacheKey(row.channelConfigId, row.externalUserId), dto)
    return dto
  }

  // ── findSessionByUser() ─────────────────────────────────────────────

  /**
   * Recupera la sesión activa de un usuario en un canal específico.
   * Útil para proactive messaging.
   * Retorna null si no existe sesión previa.
   */
  async findSessionByUser(
    channelConfigId: string,
    externalUserId:  string,
  ): Promise<GatewaySessionDto | null> {
    const key    = this.cacheKey(channelConfigId, externalUserId)
    const cached = this.cache.get(key)
    if (cached) return cached

    // TODO: remover 'as any' tras npx prisma generate
    const row = await (this.db as any).gatewaySession.findUnique({
      where: {
        channelConfigId_externalUserId: { channelConfigId, externalUserId },
      },
    })
    if (!row) return null

    const turns = await this.loadTurns(row.id)
    const dto: GatewaySessionDto = {
      id:              row.id,
      channelConfigId: row.channelConfigId,
      externalUserId:  row.externalUserId,
      agentId:         row.agentId,
      history:         turns,
      createdAt:       row.createdAt.toISOString(),
      updatedAt:       row.updatedAt.toISOString(),
    }
    this.cache.set(key, dto)
    return dto
  }

  // ── clearSessionHistory() ───────────────────────────────────────────

  /**
   * Borra todos los ConversationMessage de una sesión (comando /reset).
   * NO borra la sesión — solo el historial de conversación.
   */
  async clearSessionHistory(sessionId: string): Promise<void> {
    // TODO: remover 'as any' tras npx prisma generate
    await (this.db as any).conversationMessage.deleteMany({
      where: { sessionId },
    })

    // Limpiar caché
    for (const [key, cached] of this.cache.entries()) {
      if (cached.id === sessionId) {
        cached.history = []
        this.cache.set(key, cached)
        break
      }
    }
  }

  // ── invalidateCache() ─────────────────────────────────────────────────

  /** Eliminar una entrada de la caché en memoria (para tests y reloads). */
  invalidateCache(channelConfigId: string, externalUserId: string): void {
    this.cache.delete(this.cacheKey(channelConfigId, externalUserId))
  }

  // ── Privados ──────────────────────────────────────────────────────────

  /**
   * Carga los últimos MAX_HISTORY_TURNS turns de una sesión.
   * Usa orderBy desc + take N + reverse() para evitar cargar todos en memoria.
   * Solo roles 'user' y 'assistant' (excluye 'tool' y 'system').
   */
  private async loadTurns(sessionId: string): Promise<SessionTurn[]> {
    // TODO: remover 'as any' tras npx prisma generate
    const rows = await (this.db as any).conversationMessage.findMany({
      where: {
        sessionId,
        role: { in: ['user', 'assistant'] },
      },
      orderBy: { createdAt: 'desc' },
      take:    MAX_HISTORY_TURNS,
    })

    return (rows as any[]).reverse().map((r): SessionTurn => ({
      id:        r.id,
      role:      r.role as 'user' | 'assistant',
      text:      r.contentText ?? '',
      type:      (r.contentJson as any)?.type ?? 'text',
      metadata:  (r.contentJson as any)?.metadata ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
  }

  private isSessionStale(updatedAt: Date): boolean {
    return Date.now() - updatedAt.getTime() > MAX_SESSION_AGE_MS
  }

  private cacheKey(channelConfigId: string, externalUserId: string): string {
    return `${channelConfigId}:${externalUserId}`
  }
}
