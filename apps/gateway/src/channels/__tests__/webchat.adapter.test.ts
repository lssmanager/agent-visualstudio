/**
 * webchat.adapter.test.ts - Integration tests for WebChatAdapter (ws)
 */

import { createServer, type Server } from 'http'
import { WebSocket } from 'ws'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WebChatAdapter } from '../webchat.adapter'

const prismaMock = vi.hoisted(() => ({
  channelConfig: {
    findUnique: vi.fn().mockResolvedValue({
      id: 'cfg-1',
      credentials: {},
    }),
  },
  gatewaySession: {
    findFirst: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('../../prisma/prisma.service', () => ({
  PrismaService: vi.fn().mockImplementation(() => prismaMock),
}))

function waitForFrame(
  ws: WebSocket,
  predicate: (frame: Record<string, unknown>) => boolean,
  timeoutMs = 2000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('waitForFrame timeout')), timeoutMs)
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
    const ws = new WebSocket(`ws://127.0.0.1:${port}/gateway/webchat?${query}`)
    ws.once('open', () => resolve(ws))
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

describe('WebChatAdapter - WebSocket protocol', () => {
  let httpServer: Server
  let adapter: WebChatAdapter
  let port: number

  beforeEach(async () => {
    adapter = new WebChatAdapter()
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

  it('conectar sin sessionId -> recibe error MISSING_SESSION_ID y se cierra con 1008', async () => {
    const ws = await connectWS(port, {})
    const closed = new Promise<number>((resolve) => {
      ws.once('close', (code) => resolve(code))
    })

    const frame = await waitForFrame(ws, (f) => f['type'] === 'error')
    expect(frame['code']).toBe('MISSING_SESSION_ID')
    expect(await closed).toBe(1008)
  })

  it('conectar sin agentId -> recibe error MISSING_AGENT_ID y se cierra con 1008', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-missing-agent' })
    const closed = new Promise<number>((resolve) => {
      ws.once('close', (code) => resolve(code))
    })

    const frame = await waitForFrame(ws, (f) => f['type'] === 'error')
    expect(frame['code']).toBe('MISSING_AGENT_ID')
    expect(await closed).toBe(1008)
  })

  it('conectar con sessionId valido -> primer frame es connected', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-001', agentId: 'agent-1' })
    const frame = await waitForFrame(ws, (f) => f['type'] === 'connected')
    expect(frame['sessionId']).toBe('sess-001')
    await closeWS(ws)
  })

  it('multiple clients with same sessionId -> both receive send() message', async () => {
    const ws1 = await connectWS(port, { sessionId: 'sess-multi', agentId: 'agent-1' })
    const ws2 = await connectWS(port, { sessionId: 'sess-multi', agentId: 'agent-1' })

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

  it('message frame with text dispatches the user message', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-msg', agentId: 'agent-1' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    let received: import('../channel-adapter.interface').IncomingMessage | null = null
    adapter.onMessage(async (msg) => {
      received = msg
    })

    ws.send(JSON.stringify({ type: 'message', text: 'hola' }))

    await vi.waitFor(() => expect(received).not.toBeNull(), { timeout: 1000 })
    expect(received!.text).toBe('hola')
    expect(received!.externalId).toBe('sess-msg')

    await closeWS(ws)
  })

  it('empty message returns EMPTY_MESSAGE and does not dispatch', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-empty', agentId: 'agent-1' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    let called = false
    adapter.onMessage(async () => {
      called = true
    })

    ws.send(JSON.stringify({ type: 'message', text: '' }))

    const frame = await waitForFrame(ws, (f) => f['type'] === 'error')
    expect(frame['code']).toBe('EMPTY_MESSAGE')
    expect(called).toBe(false)

    await closeWS(ws)
  })

  it('malformed JSON returns INVALID_JSON', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-json', agentId: 'agent-1' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    ws.send('not-valid-json{')

    const frame = await waitForFrame(ws, (f) => f['type'] === 'error')
    expect(frame['code']).toBe('INVALID_JSON')

    await closeWS(ws)
  })

  it('ping returns pong', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-ping', agentId: 'agent-1' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    ws.send(JSON.stringify({ type: 'ping' }))

    const frame = await waitForFrame(ws, (f) => f['type'] === 'pong')
    expect(frame['type']).toBe('pong')

    await closeWS(ws)
  })

  it('history_request returns the active session history', async () => {
    vi.mocked(prismaMock.gatewaySession.findFirst).mockResolvedValueOnce({
      activeContextJson: [
        { role: 'user', content: 'hola', ts: '2026-05-01T00:00:00.000Z' },
        { role: 'assistant', content: 'saludos', ts: '2026-05-01T00:00:01.000Z' },
      ],
    })

    const ws = await connectWS(port, { sessionId: 'sess-history', agentId: 'agent-1' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    ws.send(JSON.stringify({ type: 'history_request' }))

    const frame = await waitForFrame(ws, (f) => f['type'] === 'history')
    expect(Array.isArray(frame['messages'])).toBe(true)
    expect((frame['messages'] as Array<Record<string, unknown>>).length).toBe(2)

    await closeWS(ws)
  })

  it('adapter.send() with connected client delivers a message frame', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-send', agentId: 'agent-1' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    const pending = waitForFrame(ws, (f) => f['type'] === 'message')
    await adapter.send({ externalId: 'sess-send', text: 'hola bot' })

    const frame = await pending
    expect(frame['text']).toBe('hola bot')

    await closeWS(ws)
  })

  it('adapter.send() without a client does not throw and upserts the session', async () => {
    await expect(
      adapter.send({ externalId: 'sess-offline', text: 'guardado' }),
    ).resolves.not.toThrow()

    expect(prismaMock.gatewaySession.upsert).toHaveBeenCalled()
  })

  it('sendTyping(start) sends a typing frame', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-typing', agentId: 'agent-1' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    const pending = waitForFrame(ws, (f) => f['type'] === 'typing')
    adapter.sendTyping('sess-typing', 'start')

    const frame = await pending
    expect(frame['status']).toBe('start')

    await closeWS(ws)
  })

  it('closing the client decrements totalConnections', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-disconnect', agentId: 'agent-1' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    expect(adapter.getStats().totalConnections).toBe(1)

    await closeWS(ws)
    await new Promise((r) => setTimeout(r, 50))
    expect(adapter.getStats().totalConnections).toBe(0)
  })

  it('dispose closes all connections with code 1001', async () => {
    const ws = await connectWS(port, { sessionId: 'sess-dispose', agentId: 'agent-1' })
    await waitForFrame(ws, (f) => f['type'] === 'connected')

    const closeCode = new Promise<number>((resolve) => {
      ws.once('close', (code) => resolve(code))
    })

    await adapter.dispose()
    expect(await closeCode).toBe(1001)
  })
})
