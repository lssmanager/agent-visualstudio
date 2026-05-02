/**
 * F3a-IV — E2E WebChat
 * Covers: WebSocket reconexión sin mensajes duplicados
 *
 * Isolation strategy:
 *   - ws server en puerto efímero (0)
 *   - IDs de sesión únicos por test con crypto.randomUUID()
 *   - Contador de respuestas por sessionId para detectar duplicados
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import { WebSocketServer, WebSocket } from 'ws'
import type { Server as HttpServer } from 'node:http'
import http from 'node:http'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CHANNEL_CONFIG_ID = 'webchat-cfg-e2e-001'
const AGENT_ID          = 'agent-e2e-webchat-001'

interface WsMessage {
  type:      'message' | 'ack' | 'error' | 'reconnect'
  sessionId: string
  messageId?: string
  text?:     string
  reply?:    string
}

// ── Test Server ───────────────────────────────────────────────────────────────

interface WebChatTestServer {
  wsUrl:   string
  cleanup(): Promise<void>
  getResponseCount(sessionId: string): number
  getDeliveredIds(sessionId: string): string[]
}

async function startWebChatTestServer(
  agentReply: string,
): Promise<WebChatTestServer> {
  const httpServer = http.createServer()
  const wss        = new WebSocketServer({ server: httpServer })

  // Estado en memoria: session → historial
  const sessions    = new Map<string, { role: string; content: string }[]>()
  // Deduplicación: session → Set de messageIds ya procesados
  const processedIds = new Map<string, Set<string>>()
  // Contadores de respuestas enviadas por sesión
  const responseCount = new Map<string, number>()
  // messageId → respuesta ya calculada (para reconexión sin recalcular)
  const cachedReplies = new Map<string, string>()

  wss.on('connection', (ws) => {
    ws.on('message', async (data: Buffer) => {
      let msg: WsMessage
      try {
        msg = JSON.parse(data.toString()) as WsMessage
      } catch {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }))
        return
      }

      const { sessionId, messageId, text } = msg

      if (msg.type === 'message') {
        if (!sessionId || !messageId || !text) {
          ws.send(JSON.stringify({ type: 'error', error: 'Missing fields' }))
          return
        }

        // Deduplicación por messageId
        const processed = processedIds.get(sessionId) ?? new Set<string>()
        if (processed.has(messageId)) {
          // Ya procesado — reenviar respuesta cacheada sin llamar al agente
          const cached = cachedReplies.get(messageId)
          if (cached) {
            ws.send(JSON.stringify({ type: 'ack', sessionId, messageId, reply: cached }))
          }
          return
        }

        processed.add(messageId)
        processedIds.set(sessionId, processed)

        // Procesar mensaje
        const history = sessions.get(sessionId) ?? []
        history.push({ role: 'user', content: text })
        sessions.set(sessionId, history)

        // Simular AgentExecutor
        const reply = agentReply
        history.push({ role: 'assistant', content: reply })
        cachedReplies.set(messageId, reply)

        // Incrementar contador de respuestas
        responseCount.set(sessionId, (responseCount.get(sessionId) ?? 0) + 1)

        ws.send(JSON.stringify({ type: 'ack', sessionId, messageId, reply }))
      }
    })
  })

  const port = await new Promise<number>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address() as { port: number }
      resolve(addr.port)
    })
  })

  return {
    wsUrl:   `ws://127.0.0.1:${port}`,
    cleanup: async () => {
      await new Promise<void>((r) => wss.close(() => r()))
      await new Promise<void>((r) => httpServer.close(() => r()))
    },
    getResponseCount: (sid: string) => responseCount.get(sid) ?? 0,
    getDeliveredIds:  (sid: string) => [...(processedIds.get(sid) ?? [])],
  }
}

function wsConnect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.once('open',  () => resolve(ws))
    ws.once('error', reject)
  })
}

function wsSend(ws: WebSocket, msg: WsMessage): Promise<WsMessage> {
  return new Promise((resolve, reject) => {
    ws.once('message', (data: Buffer) => {
      try { resolve(JSON.parse(data.toString()) as WsMessage) }
      catch (e) { reject(e) }
    })
    ws.send(JSON.stringify(msg))
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('F3a-IV — E2E WebChat: WebSocket reconexión sin duplicados', () => {
  let testServer: WebChatTestServer
  const AGENT_REPLY = 'Respuesta WebChat E2E'

  beforeAll(async () => {
    testServer = await startWebChatTestServer(AGENT_REPLY)
  })

  afterAll(async () => {
    await testServer.cleanup()
  })

  it('sends message and receives reply via WebSocket', async () => {
    const ws        = await wsConnect(testServer.wsUrl)
    const sessionId = `session-${Date.now()}-a`
    const messageId = `msg-${Date.now()}-a`

    const ack = await wsSend(ws, { type: 'message', sessionId, messageId, text: 'Hola webchat' })

    expect(ack.type).toBe('ack')
    expect(ack.sessionId).toBe(sessionId)
    expect(ack.messageId).toBe(messageId)
    expect(ack.reply).toBe(AGENT_REPLY)

    ws.close()
  })

  it('does NOT duplicate reply when same messageId is sent twice (reconnect scenario)', async () => {
    const sessionId = `session-${Date.now()}-b`
    const messageId = `msg-${Date.now()}-b`

    // Primera conexión — enviar mensaje
    const ws1 = await wsConnect(testServer.wsUrl)
    await wsSend(ws1, { type: 'message', sessionId, messageId, text: 'Mensaje original' })
    ws1.close()

    // Esperar cierre
    await new Promise((r) => setTimeout(r, 50))

    // Segunda conexión — reconectar y reenviar el mismo messageId
    const ws2  = await wsConnect(testServer.wsUrl)
    const ack2 = await wsSend(ws2, { type: 'message', sessionId, messageId, text: 'Mensaje original' })

    // El servidor debe responder con el reply cacheado, NO incrementar el contador
    expect(ack2.type).toBe('ack')
    expect(ack2.reply).toBe(AGENT_REPLY)

    // Solo 1 respuesta generada (no duplicada)
    expect(testServer.getResponseCount(sessionId)).toBe(1)

    ws2.close()
  })

  it('handles two different sessions independently without contamination', async () => {
    const sessionA = `session-${Date.now()}-c1`
    const sessionB = `session-${Date.now()}-c2`
    const msgA     = `msg-${Date.now()}-c1`
    const msgB     = `msg-${Date.now()}-c2`

    const wsA = await wsConnect(testServer.wsUrl)
    const wsB = await wsConnect(testServer.wsUrl)

    const [ackA, ackB] = await Promise.all([
      wsSend(wsA, { type: 'message', sessionId: sessionA, messageId: msgA, text: 'Sesión A' }),
      wsSend(wsB, { type: 'message', sessionId: sessionB, messageId: msgB, text: 'Sesión B' }),
    ])

    expect(ackA.sessionId).toBe(sessionA)
    expect(ackB.sessionId).toBe(sessionB)

    // Historial de A no debe aparecer en B
    expect(testServer.getDeliveredIds(sessionA)).not.toContain(msgB)
    expect(testServer.getDeliveredIds(sessionB)).not.toContain(msgA)

    wsA.close()
    wsB.close()
  })

  it('increments response count only once per unique messageId', async () => {
    const sessionId  = `session-${Date.now()}-d`
    const messageId  = `msg-${Date.now()}-d`
    const ITERATIONS = 5

    for (let i = 0; i < ITERATIONS; i++) {
      const ws  = await wsConnect(testServer.wsUrl)
      await wsSend(ws, { type: 'message', sessionId, messageId, text: 'Misma mensaje repetida' })
      ws.close()
      await new Promise((r) => setTimeout(r, 20))
    }

    expect(testServer.getResponseCount(sessionId)).toBe(1)
  })
})
