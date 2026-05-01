import { describe, expect, it, vi, beforeEach } from 'vitest'
import { WebChatAdapter, type WebChatConnection } from '../webchat.adapter.js'

function makeConnection() {
  return {
    send: vi.fn(),
    close: vi.fn(),
  } satisfies WebChatConnection
}

describe('WebChatAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('broadcasts replyFn payload to every active connection for the session', async () => {
    const adapter = new WebChatAdapter()
    const connA = makeConnection()
    const connB = makeConnection()

    adapter.registerConnection('sess-1', connA)
    adapter.registerConnection('sess-1', connB)

    const incoming = await adapter.receive(
      { sessionId: 'sess-1', text: 'hola' } as Record<string, unknown>,
      {},
    )

    await incoming!.replyFn!('respuesta')

    expect(connA.send).toHaveBeenCalledOnce()
    expect(connB.send).toHaveBeenCalledOnce()
  })

  it('flushes queued replies when a session reconnects', async () => {
    const adapter = new WebChatAdapter()

    const incoming = await adapter.receive(
      { sessionId: 'sess-2', text: 'hola' } as Record<string, unknown>,
      {},
    )

    await incoming!.replyFn!('pendiente')

    const conn = makeConnection()
    adapter.registerConnection('sess-2', conn)

    expect(conn.send).toHaveBeenCalledWith(JSON.stringify({ type: 'message', text: 'pendiente' }))
  })
})
