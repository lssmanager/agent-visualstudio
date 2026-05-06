/**
 * webchat.adapter.ts — Adaptador WebChat (WebSocket nativo con `ws`)
 *
 * Protocolo:
 *   ws[s]://<host>/gateway/webchat?sessionId=<uuid>&agentId=<uuid>
 *
 * Flujo de mensajes cliente → servidor (JSON frame):
 *   { type: 'message', text: string, metadata?: Record<string, unknown> }
 *   { type: 'ping' }                  ← keepalive del cliente
 *   { type: 'history_request' }       ← solicita historial de la sesión
 *
 * Flujo servidor → cliente (JSON frame):
 *   { type: 'message', text, richContent?, metadata?, ts }
 *   { type: 'typing', status: 'start' | 'stop' }
 *   { type: 'pong' }
 *   { type: 'history', messages: HistoryEntry[] }
 *   { type: 'error', code, message }
 *   { type: 'connected', sessionId }  ← primer frame al conectar
 *
 * FIX [F3b-05]: initialize() ya no lee config.credentials (texto plano).
 * Usa decryptSecrets(config.secretsEncrypted) desde @lss/crypto para
 * leer las credenciales descifradas en memoria. Si secretsEncrypted es null
 * (canal webchat sin credenciales adicionales) usa {} como fallback.
 */

import { WebSocketServer, WebSocket, type RawData } from 'ws'
import type { IncomingMessage as HttpIncomingMessage, Server } from 'http'
import type { PrismaClient } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { decryptSecrets } from '@lss/crypto'
import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface'

// ── Tipos de frame ──────────────────────────────────────────────────────

type ClientFrame =
  | { type: 'message'; text: string; metadata?: Record<string, unknown> }
  | { type: 'ping' }
  | { type: 'history_request' }

type ServerFrame =
  | { type: 'connected'; sessionId: string }
  | { type: 'message'; text: string; richContent?: unknown; metadata?: Record<string, unknown>; ts: string }
  | { type: 'typing'; status: 'start' | 'stop' }
  | { type: 'pong' }
  | { type: 'history'; messages: HistoryEntry[] }
  | { type: 'error'; code: string; message: string }

interface HistoryEntry {
  role: 'user' | 'assistant'
  content: string
  ts?: string
}

// ── Conexión activa ─────────────────────────────────────────────────────

interface ActiveConnection {
  ws:          WebSocket
  sessionId:   string
  agentId:     string
  connectedAt: number
}

// ── WebChatAdapter ──────────────────────────────────────────────────────

export class WebChatAdapter extends BaseChannelAdapter {
  readonly channel = 'webchat'

  // Instancia de PrismaClient — inyectada por constructor o lazy-init
  private readonly db: PrismaClient

  // WebSocketServer — se adjunta al httpServer en initialize()
  private wss: WebSocketServer | null = null

  // sessionId → lista de conexiones activas (multi-tab support)
  private readonly connections = new Map<string, ActiveConnection[]>()

  /**
   * @param prisma — instancia compartida de PrismaClient.
   *   Si no se pasa, se crea una instancia local via PrismaService (fallback
   *   para compatibilidad con código antiguo). En producción siempre pasar
   *   la instancia compartida del servidor para evitar pool exhaustion.
   */
  constructor(prisma?: PrismaClient) {
    super()
    this.db = prisma ?? (new PrismaService() as unknown as PrismaClient)
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * initialize() adjunta un WebSocketServer al httpServer de Fastify/Express.
   *
   * @param channelConfigId  ID del ChannelConfig en DB
   * @param httpServer       http.Server de la app — se pasa como segundo arg
   *                         desde gateway.service.ts o server.ts al instanciar
   *                         el adaptador. Ej:
   *                           adapter.initialize(configId, app.server)
   */
  async initialize(
    channelConfigId: string,
    httpServer?: Server,
  ): Promise<void> {
    this.channelConfigId = channelConfigId

    const config = await this.db.channelConfig.findUnique({
      where: { id: channelConfigId },
    })
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`)

    this.credentials = config.secretsEncrypted
      ? decryptSecrets(config.secretsEncrypted)
      : {}

    // Crear WebSocketServer adjunto al httpServer existente.
    // path: '/gateway/webchat' → filtra solo esta ruta.
    this.wss = new WebSocketServer({
      server: httpServer,
      path:   '/gateway/webchat',
    })

    this.wss.on('connection', (ws: WebSocket, req: HttpIncomingMessage) => {
      this.handleConnection(ws, req)
    })

    this.wss.on('error', (err: Error) => {
      console.error('[webchat] WebSocketServer error:', err.message)
    })

    console.info(`[webchat] WebSocketServer attached — path /gateway/webchat`)
  }

  async dispose(): Promise<void> {
    if (!this.wss) {
      return Promise.resolve()
    }

    // Cerrar todas las conexiones activas con código 1001 (Going Away)
    for (const [sessionId, conns] of this.connections) {
      for (const conn of conns) {
        conn.ws.close(1001, 'Server shutting down')
      }
      console.info(`[webchat] Closed ${conns.length} WS for session ${sessionId}`)
    }
    this.connections.clear()

    const wss = this.wss
    await new Promise<void>((resolve, reject) => {
      wss.close((err) => (err ? reject(err) : resolve()))
    })
    this.wss = null
    console.info('[webchat] WebSocketServer closed')
  }

  // ── send() — enviar respuesta al cliente ──────────────────────────────

  async send(message: OutgoingMessage): Promise<void> {
    const conns = this.connections.get(message.externalId) ?? []

    const frame: ServerFrame = {
      type:        'message',
      text:         message.text,
      richContent:  message.richContent ?? undefined,
      metadata:     message.metadata ?? {},
      ts:           new Date().toISOString(),
    }
    const payload = JSON.stringify(frame)

    if (conns.length === 0) {
      // Sin conexión activa → persistir en contextWindow para recuperar al reconectar
      await this.persistMessage(message.externalId, 'assistant', message.text)
      return
    }

    const alive = conns.filter((conn) => conn.ws.readyState === WebSocket.OPEN)
    if (alive.length === 0) {
      this.connections.delete(message.externalId)
      await this.persistMessage(message.externalId, 'assistant', message.text)
      return
    }

    if (alive.length !== conns.length) {
      this.connections.set(message.externalId, alive)
    }

    for (const conn of alive) {
      conn.ws.send(payload)
    }
  }

  // ── sendTyping() — helper para typing indicator ───────────────────────

  sendTyping(sessionId: string, status: 'start' | 'stop'): void {
    const conns = this.connections.get(sessionId) ?? []
    const frame = JSON.stringify({ type: 'typing', status } satisfies ServerFrame)
    for (const conn of conns) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(frame)
      }
    }
  }

  // ── handleConnection() ────────────────────────────────────────────────

  private handleConnection(ws: WebSocket, req: HttpIncomingMessage): void {
    // Parsear query string: ?sessionId=...&agentId=...
    const url       = new URL(req.url ?? '/', `ws://127.0.0.1`)
    const sessionId = url.searchParams.get('sessionId') ?? ''
    const agentId   = url.searchParams.get('agentId')   ?? ''

    if (!sessionId) {
      this.sendFrame(ws, {
        type:    'error',
        code:    'MISSING_SESSION_ID',
        message: 'sessionId query param is required',
      })
      ws.close(1008, 'Missing sessionId')
      return
    }

    if (!agentId) {
      this.sendFrame(ws, {
        type:    'error',
        code:    'MISSING_AGENT_ID',
        message: 'agentId query param is required',
      })
      ws.close(1008, 'Missing agentId')
      return
    }

    const conn: ActiveConnection = {
      ws,
      sessionId,
      agentId,
      connectedAt: Date.now(),
    }

    // Registrar conexión
    if (!this.connections.has(sessionId)) {
      this.connections.set(sessionId, [])
    }
    this.connections.get(sessionId)!.push(conn)

    console.info(
      `[webchat] Connected: session=${sessionId} agent=${agentId} ` +
      `total_conns=${this.connections.get(sessionId)!.length}`,
    )

    // Frame de bienvenida
    this.sendFrame(ws, { type: 'connected', sessionId })

    // Handlers de eventos
    ws.on('message', (raw: RawData) => {
      this.handleMessage(conn, raw).catch((err: Error) => {
        console.error(`[webchat] handleMessage error session=${sessionId}:`, err.message)
        this.sendFrame(ws, {
          type:    'error',
          code:    'INTERNAL_ERROR',
          message: 'Failed to process message',
        })
      })
    })

    ws.on('close', (code: number, reason: Buffer) => {
      this.removeConnection(sessionId, ws)
      console.info(
        `[webchat] Disconnected: session=${sessionId} code=${code} ` +
        `reason=${reason.toString() || 'none'}`,
      )
    })

    ws.on('error', (err: Error) => {
      console.error(`[webchat] WS error session=${sessionId}:`, err.message)
      this.removeConnection(sessionId, ws)
    })
  }

  // ── handleMessage() ───────────────────────────────────────────────────

  private async handleMessage(
    conn: ActiveConnection,
    raw:  RawData,
  ): Promise<void> {
    let frame: ClientFrame

    try {
      frame = JSON.parse(raw.toString()) as ClientFrame
    } catch {
      this.sendFrame(conn.ws, {
        type:    'error',
        code:    'INVALID_JSON',
        message: 'Message must be valid JSON',
      })
      return
    }

    switch (frame.type) {
      case 'ping':
        this.sendFrame(conn.ws, { type: 'pong' })
        break

      case 'history_request':
        await this.sendHistory(conn)
        break

      case 'message': {
        const text = frame.text?.trim()
        if (!text) {
          this.sendFrame(conn.ws, {
            type:    'error',
            code:    'EMPTY_MESSAGE',
            message: 'text cannot be empty',
          })
          return
        }

        // Persistir mensaje del usuario
        await this.persistMessage(conn.sessionId, 'user', text, conn.agentId)

        const msg: IncomingMessage = {
          channelConfigId: this.channelConfigId,
          channelType:     'webchat',
          externalId:  conn.sessionId,
          senderId:    conn.sessionId,
          text,
          type:        'text',
          metadata:    {
            ...frame.metadata,
            agentId: conn.agentId || undefined,
            channel: 'webchat',
          },
          receivedAt: this.makeTimestamp(),
        }

        await this.emit(msg)
        break
      }

      default: {
        // TypeScript exhaustive check helper
        const _never: never = frame
        void _never
        this.sendFrame(conn.ws, {
          type:    'error',
          code:    'UNKNOWN_FRAME_TYPE',
          message: 'Unknown frame type',
        })
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private sendFrame(ws: WebSocket, frame: ServerFrame): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame))
    }
  }

  private removeConnection(sessionId: string, ws: WebSocket): void {
    const conns = this.connections.get(sessionId)
    if (!conns) return
    const filtered = conns.filter((c) => c.ws !== ws)
    if (filtered.length > 0) {
      this.connections.set(sessionId, filtered)
    } else {
      this.connections.delete(sessionId)
    }
  }

  private async sendHistory(conn: ActiveConnection): Promise<void> {
    try {
      const session = await this.db.gatewaySession.findFirst({
        where: {
          channelConfigId: this.channelConfigId,
          externalUserId:   conn.sessionId,
        },
      })
      const messages = this.readHistory(session?.activeContextJson)
      this.sendFrame(conn.ws, { type: 'history', messages })
    } catch (err) {
      console.error('[webchat] sendHistory error:', (err as Error).message)
      this.sendFrame(conn.ws, {
        type:    'error',
        code:    'HISTORY_ERROR',
        message: 'Failed to retrieve history',
      })
    }
  }

  private async persistMessage(
    sessionId: string,
    role:      'user' | 'assistant',
    content:   string,
    agentId?:  string,
  ): Promise<void> {
    try {
      const resolvedAgentId = agentId ?? await this.resolveAgentId(sessionId)
      if (!resolvedAgentId) {
        throw new Error(`Missing agentId for WebChat session ${sessionId}`)
      }

      await this.db.gatewaySession.upsert({
        where: {
          channelConfigId_externalUserId: {
            channelConfigId: this.channelConfigId,
            externalUserId:   sessionId,
          },
        },
        update: {
          activeContextJson: {
            push: { role, content, ts: new Date().toISOString() },
          } as any,
        },
        create: {
          channelConfigId: this.channelConfigId,
          externalUserId:   sessionId,
          activeContextJson: [{ role, content, ts: new Date().toISOString() }] as any,
          agentId:          resolvedAgentId,
        },
      })
    } catch (err) {
      // No bloquear el flujo principal si la persistencia falla
      console.warn('[webchat] persistMessage failed:', (err as Error).message)
    }
  }

  // ── Métricas (opcional, para observabilidad) ──────────────────────────

  getStats(): { activeSessions: number; totalConnections: number } {
    let totalConnections = 0
    for (const conns of this.connections.values()) {
      totalConnections += conns.length
    }
    return {
      activeSessions:   this.connections.size,
      totalConnections,
    }
  }

  private readHistory(value: unknown): HistoryEntry[] {
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is HistoryEntry => {
      return !!entry && typeof entry === 'object' && typeof (entry as HistoryEntry).content === 'string'
    })
  }

  private async resolveAgentId(sessionId: string): Promise<string | null> {
    const session = await this.db.gatewaySession.findFirst({
      where: {
        channelConfigId: this.channelConfigId,
        externalUserId:  sessionId,
      },
      select: { agentId: true },
    })
    return session?.agentId ?? null
  }
}
