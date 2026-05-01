/**
 * [F3a-09] status-stream.gateway.spec.ts
 *
 * Unit tests for StatusStreamGateway.
 * Uses jest mocks — no real Socket.IO server needed.
 */

import { StatusStreamGateway, StatusChangeEvent } from '../status-stream.gateway.js'

// ── Mock socket factory ───────────────────────────────────────────────────────

function makeSocket(id = 'socket-1') {
  return {
    id,
    handshake: { address: '127.0.0.1' },
    join:      jest.fn().mockResolvedValue(undefined),
    leave:     jest.fn().mockResolvedValue(undefined),
    emit:      jest.fn(),
  } as unknown as import('socket.io').Socket
}

function makeServer() {
  const toMock = { emit: jest.fn() }
  return {
    to:  jest.fn().mockReturnValue(toMock),
    _to: toMock,
  } as unknown as import('socket.io').Server & { _to: { emit: jest.Mock } }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildGateway() {
  const gw  = new StatusStreamGateway()
  const srv = makeServer()
  // Inject the private server property
  ;(gw as unknown as { server: unknown }).server = srv
  return { gw, srv }
}

const baseEvent: StatusChangeEvent = {
  runId:   'run-abc',
  stepId:  'step-xyz',
  nodeId:  'node-1',
  status:  'running',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StatusStreamGateway', () => {

  describe('handleConnection / handleDisconnect', () => {
    it('does not throw on connect', () => {
      const { gw } = buildGateway()
      expect(() => gw.handleConnection(makeSocket())).not.toThrow()
    })

    it('does not throw on disconnect', () => {
      const { gw } = buildGateway()
      expect(() => gw.handleDisconnect(makeSocket())).not.toThrow()
    })
  })

  describe('handleSubscribe', () => {
    it('joins the correct room for a valid runId', async () => {
      const { gw }    = buildGateway()
      const socket    = makeSocket()
      await gw.handleSubscribe({ runId: 'run-abc' }, socket)
      expect(socket.join).toHaveBeenCalledWith('run:run-abc')
    })

    it('emits subscribed ack after joining', async () => {
      const { gw }    = buildGateway()
      const socket    = makeSocket()
      await gw.handleSubscribe({ runId: 'run-abc' }, socket)
      expect(socket.emit).toHaveBeenCalledWith('subscribed', { runId: 'run-abc' })
    })

    it('emits error when runId is missing', async () => {
      const { gw }    = buildGateway()
      const socket    = makeSocket()
      await gw.handleSubscribe({} as { runId: string }, socket)
      expect(socket.join).not.toHaveBeenCalled()
      expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }))
    })
  })

  describe('handleUnsubscribe', () => {
    it('leaves the correct room for a valid runId', async () => {
      const { gw }    = buildGateway()
      const socket    = makeSocket()
      await gw.handleUnsubscribe({ runId: 'run-abc' }, socket)
      expect(socket.leave).toHaveBeenCalledWith('run:run-abc')
    })

    it('emits error when runId is missing', async () => {
      const { gw }    = buildGateway()
      const socket    = makeSocket()
      await gw.handleUnsubscribe({} as { runId: string }, socket)
      expect(socket.leave).not.toHaveBeenCalled()
      expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }))
    })
  })

  describe('handleStatusChanged', () => {
    it('calls server.to() with the correct room', () => {
      const { gw, srv } = buildGateway()
      gw.handleStatusChanged(baseEvent)
      expect(srv.to).toHaveBeenCalledWith('run:run-abc')
    })

    it('emits run_status_update to the room', () => {
      const { gw, srv } = buildGateway()
      gw.handleStatusChanged(baseEvent)
      expect(srv._to.emit).toHaveBeenCalledWith(
        'run_status_update',
        expect.objectContaining({
          runId:  'run-abc',
          stepId: 'step-xyz',
          status: 'running',
          ts:     expect.any(String),
        }),
      )
    })

    it('payload ts is a valid ISO-8601 date', () => {
      const { gw, srv } = buildGateway()
      gw.handleStatusChanged(baseEvent)
      const [, payload] = srv._to.emit.mock.calls[0] as [string, { ts: string }]
      expect(new Date(payload.ts).toISOString()).toBe(payload.ts)
    })
  })
})
