/**
 * webchat.adapter.test.ts — Integration tests for WebChatAdapter (ws)
 *
 * Pattern: creates an in-memory http.Server, attaches the adapter,
 * connects with a ws client, sends frames, verifies responses.
 */

import { createServer, type Server } from 'http'
import { WebSocket } from 'ws'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WebChatAdapter } from '../webchat.adapter.js'

// ── Mock prisma ─────────────────────────────────────────────────────────
vi.mock('../../../../api/src/modules/core/db/prisma.service', () => ({
  prisma: {
    channelConfig: {
      findUnique: vi.fn().mockResolvedValue({
        id:          'cfg-1',
        credentials: {},
      }),
    },
    gatewaySession: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert:    vi.fn().mockResolvedValue({}),
    },
  },
}))

// ── Helpers ─────────────────────────────────────────────────────────────

function waitForFrame(
  ws: WebSocket,
  predicate: (frame: Record<string, unknown>) => boolean,
  timeoutMs = 2000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('waitForFrame timeout')),
      timeoutMs,
    )
    ws.on('message', (data) => {
      const frame = JSON.parse(data.toString()) as Record<string, unknown>
      if (predicate(frame)) {
        clearTimeout(timer)
        resolve(frame)
      }
    })
  })
}

function connectWS(
  port: number,
  params: Record<string, string> = {},
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams(params).toString()
    const ws = new WebSocket(`ws://localhost:${port}/gateway/webchat?${query}`)
    ws.once('open',  () => resolve(ws))
    ws.once('error', reject)
  })
}

function closeWS(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve()
    ws.once('close', () => resolve())
    ws.close()
  })
}

// ── Test suite ──────────────────────────────────────────────────────────

describe('WebChatAdapter — WebSocket protocol', () => {
  let httpServer: Server
  let adapter: WebChatAdapter
  let port: number

  beforeEach(async () => {
    adapter    = new WebChatAdapter()
    httpServer = createServer()
    await adapter.initialize('cfg-1', httpServer)

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as { port: number }
        port = addr.port
        resolve()
      })
    })
  })

  afterEach(async () => {
    await adapter.dispose()
    await new Promise<void>((res) => httpServer.close(() => res()))
  })

  // ── Conexión ──────────────────────────────────────────────────────────

  it('conectar sin sessionId → recibe error MISSING_SESSION_ID y se cierra con 1008', async () => {
    const ws = await connectWS(port, {}) // sin sessionId
    const frame = await waitForFrame(ws, (f) => f['type'] === 'error')
    expect(frame['code']).toBe('MISSING_SESSION_ID')

    const closeCode = await new Promise<number>((resolve) => {
      ws.once('close', (code) => resolve(code))
    })
    expect(closeCode).toBe(1008)
  })

  it('conectar con sessionId válido → primer frame es { type: connected, sessionId }', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-001' })
    const frame = await waitForFrame(ws, (f) => f['type'] === 'connected')
    expect(frame['sessionId']).toBe('sess-001')
    await closeWS(ws)
  })

  it('múltiples clientes con el mismo sessionId → ambos reciben el mensaje de send()', async () => {
    const ws1 = await connectWS(port, { sessionId: 'sess-multi' })
    const ws2 = await connectWS(port, { sessionId: 'sess-multi' })

    // Consumir frames 'connected'
    await waitForFrame(ws1, (f) => f['type'] === 'connected')
    await waitForFrame(ws2, (f) => f['type'] === 'connected')

    const [p1, p2] = [
      waitForFrame(ws1, (f) => f['type'] === 'message'),
      waitForFrame(ws2, (f) => f['type'] === 'message'),
    ]

    await adapter.send({ externalId: 'sess-multi', text: 'broadcast' })

    const [f1, f2] = await Promise.all([p1, p2])
    expect(f1['text']).toBe('broadcast')
    expect(f2['text']).toBe('broadcast')

    await closeWS(ws1)
    await closeWS(ws2)
  })

  // ── Mensajes ──────────────────────────────────────────────────────────

  it('enviar { type: message, text: "hola" } → messageHandler llamado con texto correcto', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-msg' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    let received: import('../channel-adapter.interface.js').IncomingMessage | null = null
    adapter.onMessage(async (msg) => { received = msg })

    ws.send(JSON.stringify({ type: 'message', text: 'hola' }))

    await vi.waitFor(() => expect(received).not.toBeNull(), { timeout: 1000 })
    expect(received!.text).toBe('hola')
    expect(received!.externalId).toBe('sess-msg')

    await closeWS(ws)
  })

  it('enviar { type: message, text: "" } → recibe error EMPTY_MESSAGE, messageHandler NO llamado', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-empty' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    let called = false
    adapter.onMessage(async () => { called = true })

    ws.send(JSON.stringify({ type: 'message', text: '' }))

    const frame = await waitForFrame(ws, (f) => f['type'] === 'error')
    expect(frame['code']).toBe('EMPTY_MESSAGE')
    expect(called).toBe(false)

    await closeWS(ws)
  })

  it('enviar JSON malformado → recibe error INVALID_JSON', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-json' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    ws.send('not-valid-json{')

    const frame = await waitForFrame(ws, (f) => f['type'] === 'error')
    expect(frame['code']).toBe('INVALID_JSON')

    await closeWS(ws)
  })

  it('enviar { type: ping } → recibe { type: pong }', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-ping' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    ws.send(JSON.stringify({ type: 'ping' }))

    const frame = await waitForFrame(ws, (f) => f['type'] === 'pong')
    expect(frame['type']).toBe('pong')

    await closeWS(ws)
  })

  // ── send() / respuestas ───────────────────────────────────────────────

  it('adapter.send() con cliente conectado → cliente recibe { type: message }', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-send' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    const pending = waitForFrame(ws, (f) => f['type'] === 'message')
    await adapter.send({ externalId: 'sess-send', text: 'hola bot' })

    const frame = await pending
    expect(frame['text']).toBe('hola bot')

    await closeWS(ws)
  })

  it('adapter.send() sin cliente conectado → no lanza, llama upsert en DB', async () => {
    const { prisma } = await import('../../../../api/src/modules/core/db/prisma.service')
    const upsertSpy = vi.spyOn((prisma as any).gatewaySession, 'upsert')

    await expect(
      adapter.send({ externalId: 'sess-offline', text: 'guardado' }),
    ).resolves.not.toThrow()

    expect(upsertSpy).toHaveBeenCalled()
  })

  // ── sendTyping() ──────────────────────────────────────────────────────

  it('sendTyping(sessionId, "start") → cliente recibe { type: typing, status: "start" }', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-typing' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    const pending = waitForFrame(ws, (f) => f['type'] === 'typing')
    adapter.sendTyping('sess-typing', 'start')

    const frame = await pending
    expect(frame['status']).toBe('start')

    await closeWS(ws)
  })

  // ── Desconexión / limpieza ────────────────────────────────────────────

  it('al cerrar WebSocket cliente → getStats().totalConnections decrementa', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-disconnect' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    expect(adapter.getStats().totalConnections).toBe(1)

    await closeWS(ws)

    // Pequeña espera para que el evento close se procese
    await new Promise((r) => setTimeout(r, 50))
    expect(adapter.getStats().totalConnections).toBe(0)
  })

  it('dispose() → cierra todas las conexiones con código 1001', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-dispose' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    const closeCode = new Promise<number>((resolve) => {
      ws.once('close', (code) => resolve(code))
    })

    await adapter.dispose()

    expect(await closeCode).toBe(1001)
  })
})
