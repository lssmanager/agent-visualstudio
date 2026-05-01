import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Response } from 'express'
import { ChannelEventEmitter } from '../channel-event-emitter.js'
import {
  makeChannelEvent,
  type ChannelEvent,
  type ChannelEventType,
} from '../channel-event.types.js'

function makeEvent(
  type: ChannelEventType = 'channel.status_changed',
  channelId = 'ch-001',
): ChannelEvent {
  return makeChannelEvent(type, channelId, { test: true })
}

function makeMockRes() {
  const written: string[] = []
  return {
    write:        vi.fn((s: string) => { written.push(s); return true }),
    end:          vi.fn(),
    setHeader:    vi.fn(),
    flushHeaders: vi.fn(),
    _written:     written,
  } as unknown as Response & { _written: string[] }
}

describe('ChannelEventEmitter', () => {
  let emitter: ChannelEventEmitter

  beforeEach(() => {
    vi.useFakeTimers()
    emitter = new ChannelEventEmitter()
  })

  afterEach(() => {
    emitter.onModuleDestroy()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('emit() — server-side listeners', () => {
    it('listener registrado con on() recibe el evento emitido', () => {
      const listener = vi.fn()
      emitter.on('channel.status_changed', listener)

      const event = makeEvent()
      emitter.emit(event)

      expect(listener).toHaveBeenCalledWith(event)
    })

    it('listener channel.* recibe todos los eventos', () => {
      const listener = vi.fn()
      emitter.on('channel.*', listener)

      const eventA = makeEvent('channel.status_changed')
      const eventB = makeEvent('channel.error')
      emitter.emit(eventA)
      emitter.emit(eventB)

      expect(listener).toHaveBeenCalledTimes(2)
      expect(listener).toHaveBeenNthCalledWith(1, eventA)
      expect(listener).toHaveBeenNthCalledWith(2, eventB)
    })

    it('listener registrado con once() se llama solo la primera vez', () => {
      const listener = vi.fn()
      emitter.once('channel.status_changed', listener)

      emitter.emit(makeEvent())
      emitter.emit(makeEvent())

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('función de cancelación de on() desuscribe el listener', () => {
      const listener = vi.fn()
      const unsubscribe = emitter.on('channel.status_changed', listener)
      unsubscribe()

      emitter.emit(makeEvent())

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('SSE — registerSseClient()', () => {
    it('cliente registrado recibe comentario connected en la primera escritura', () => {
      const res = makeMockRes()
      emitter.registerSseClient(res)

      expect(res.write).toHaveBeenCalled()
      expect(res._written[0]).toContain(': connected clientId=')
    })

    it('emitir un evento escribe event y data al cliente', () => {
      const res = makeMockRes()
      emitter.registerSseClient(res)
      const event = makeEvent()

      emitter.emit(event)

      expect(res._written.some((chunk) => chunk.includes('event: channel.status_changed'))).toBe(true)
      expect(res._written.some((chunk) => chunk.includes('data:'))).toBe(true)
    })

    it('cliente filtrado por channelId no recibe eventos de otro canal', () => {
      const res = makeMockRes()
      emitter.registerSseClient(res, 'ch-001')

      emitter.emit(makeEvent('channel.status_changed', 'ch-002'))

      expect(res._written).toHaveLength(1)
    })

    it('cliente sin filtro recibe eventos de cualquier canal', () => {
      const res = makeMockRes()
      emitter.registerSseClient(res)

      emitter.emit(makeEvent('channel.status_changed', 'ch-001'))
      emitter.emit(makeEvent('channel.error', 'ch-002'))

      expect(res._written.filter((chunk) => chunk.includes('event:')).length).toBe(2)
    })

    it('cleanup elimina el cliente y no recibe eventos posteriores', () => {
      const res = makeMockRes()
      const cleanup = emitter.registerSseClient(res)
      cleanup()

      emitter.emit(makeEvent())

      expect(res._written).toHaveLength(1)
    })

    it('MAX_SSE_CLIENTS alcanzado rechaza cliente adicional', () => {
      for (let i = 0; i < 200; i += 1) {
        emitter.registerSseClient(makeMockRes())
      }
      const extra = makeMockRes()

      emitter.registerSseClient(extra)

      expect(extra.write).toHaveBeenCalledWith('event: error\ndata: {"message":"Too many SSE clients"}\n\n')
      expect(extra.end).toHaveBeenCalled()
    })
  })

  describe('SSE — clientes muertos', () => {
    it('res.write lanza Error y cliente se elimina automáticamente', () => {
      const badRes = makeMockRes()
      vi.mocked(badRes.write).mockImplementationOnce(() => { throw new Error('socket closed') })
      emitter.registerSseClient(badRes)

      expect(() => emitter.emit(makeEvent())).not.toThrow()
      expect(emitter.getSseStats().totalClients).toBe(0)
    })

    it('broadcast con 3 clientes y 1 muerto mantiene 2 sanos', () => {
      const healthyA = makeMockRes()
      const dead = makeMockRes()
      const healthyB = makeMockRes()
      emitter.registerSseClient(healthyA)
      emitter.registerSseClient(dead)
      emitter.registerSseClient(healthyB)
      vi.mocked(dead.write).mockImplementation((() => { throw new Error('dead') }) as any)

      emitter.emit(makeEvent())

      expect(emitter.getSseStats().totalClients).toBe(2)
      expect(healthyA._written.some((chunk) => chunk.includes('event: channel.status_changed'))).toBe(true)
      expect(healthyB._written.some((chunk) => chunk.includes('event: channel.status_changed'))).toBe(true)
    })
  })

  describe('heartbeat', () => {
    it('clientes activos reciben heartbeat tras el intervalo', () => {
      const resA = makeMockRes()
      const resB = makeMockRes()
      emitter.registerSseClient(resA)
      emitter.registerSseClient(resB)

      vi.advanceTimersByTime(15_000)

      expect(resA._written.some((chunk) => chunk.includes(': heartbeat'))).toBe(true)
      expect(resB._written.some((chunk) => chunk.includes(': heartbeat'))).toBe(true)
    })
  })

  describe('onModuleDestroy()', () => {
    it('res.end es llamado en todos los clientes activos', () => {
      const resA = makeMockRes()
      const resB = makeMockRes()
      emitter.registerSseClient(resA)
      emitter.registerSseClient(resB)

      emitter.onModuleDestroy()

      expect(resA.end).toHaveBeenCalled()
      expect(resB.end).toHaveBeenCalled()
    })

    it('sseClients.size === 0 tras destroy', () => {
      emitter.registerSseClient(makeMockRes())

      emitter.onModuleDestroy()

      expect(emitter.getSseStats().totalClients).toBe(0)
    })

    it('listenerCount queda en 0 tras destroy', () => {
      emitter.on('channel.status_changed', vi.fn())

      emitter.onModuleDestroy()

      const internal = emitter as unknown as { emitter: { listenerCount: (event: string) => number } }
      expect(internal.emitter.listenerCount('channel.status_changed')).toBe(0)
    })
  })
})
