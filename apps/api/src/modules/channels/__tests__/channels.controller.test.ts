import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpException, HttpStatus } from '@nestjs/common'
import { ChannelsController } from '../channels.controller'
import {
  ChannelNotFoundError,
  InvalidTransitionError,
  ChannelAlreadyInStateError,
  WebhookRegistrationError,
} from '../channel-lifecycle.errors'

// ── Minimal ChannelStatusDto fixture ─────────────────────────────────────────

function makeStatusDto(id = 'ch-001', status = 'active') {
  return {
    id,
    name:           'TestBot',
    type:           'telegram',
    status,
    isActive:       status === 'active',
    errorMessage:   null,
    lastStartedAt:  null,
    lastStoppedAt:  null,
    bindingCount:   0,
    activeSessions: 0,
    createdAt:      new Date().toISOString(),
    updatedAt:      new Date().toISOString(),
  }
}

// ── Mock lifecycle factory ────────────────────────────────────────────────────

function makeLifecycle() {
  return {
    listAll:   vi.fn().mockResolvedValue([makeStatusDto()]),
    status:    vi.fn().mockResolvedValue(makeStatusDto()),
    provision: vi.fn().mockResolvedValue(makeStatusDto('ch-001', 'provisioned')),
    start:     vi.fn().mockResolvedValue(makeStatusDto('ch-001', 'active')),
    stop:      vi.fn().mockResolvedValue(makeStatusDto('ch-001', 'stopped')),
    restart:   vi.fn().mockResolvedValue(makeStatusDto('ch-001', 'active')),
  }
}

function makeController(lifecycle = makeLifecycle()) {
  return { controller: new ChannelsController(lifecycle as any), lifecycle }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('ChannelsController — success paths', () => {
  it('listAll() delegates to lifecycle.listAll()', async () => {
    const { controller, lifecycle } = makeController()
    const result = await controller.listAll()
    expect(lifecycle.listAll).toHaveBeenCalledOnce()
    expect(Array.isArray(result)).toBe(true)
  })

  it('status() delegates to lifecycle.status(id)', async () => {
    const { controller, lifecycle } = makeController()
    const result = await controller.status('ch-001')
    expect(lifecycle.status).toHaveBeenCalledWith('ch-001')
    expect(result.id).toBe('ch-001')
  })

  it('provision() delegates to lifecycle.provision(dto)', async () => {
    const { controller, lifecycle } = makeController()
    const dto = { type: 'telegram', name: 'TestBot', config: {} }
    const result = await controller.provision(dto as any)
    expect(lifecycle.provision).toHaveBeenCalledWith(dto)
    expect(result.status).toBe('provisioned')
  })

  it('start() delegates to lifecycle.start(id)', async () => {
    const { controller, lifecycle } = makeController()
    const result = await controller.start('ch-001')
    expect(lifecycle.start).toHaveBeenCalledWith('ch-001')
    expect(result.status).toBe('active')
  })

  it('stop() delegates to lifecycle.stop(id)', async () => {
    const { controller, lifecycle } = makeController()
    const result = await controller.stop('ch-001')
    expect(lifecycle.stop).toHaveBeenCalledWith('ch-001')
    expect(result.status).toBe('stopped')
  })

  it('restart() delegates to lifecycle.restart(id)', async () => {
    const { controller, lifecycle } = makeController()
    const result = await controller.restart('ch-001')
    expect(lifecycle.restart).toHaveBeenCalledWith('ch-001')
    expect(result.status).toBe('active')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('ChannelsController — error mapping (wrap() method)', () => {
  describe('ChannelNotFoundError → 404 NOT_FOUND', () => {
    it('status() throws HttpException with 404 when lifecycle throws ChannelNotFoundError', async () => {
      const lifecycle = makeLifecycle()
      lifecycle.status.mockRejectedValue(new ChannelNotFoundError('ch-999'))
      const controller = new ChannelsController(lifecycle as any)

      await expect(controller.status('ch-999')).rejects.toBeInstanceOf(HttpException)

      try {
        await controller.status('ch-999')
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException)
        expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND)
        expect((err as HttpException).message).toContain('ch-999')
      }
    })

    it('start() throws HttpException with 404 when channel not found', async () => {
      const lifecycle = makeLifecycle()
      lifecycle.start.mockRejectedValue(new ChannelNotFoundError('ch-missing'))
      const controller = new ChannelsController(lifecycle as any)

      try {
        await controller.start('ch-missing')
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException)
        expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND)
      }
    })

    it('stop() throws HttpException with 404 when channel not found', async () => {
      const lifecycle = makeLifecycle()
      lifecycle.stop.mockRejectedValue(new ChannelNotFoundError('ch-missing'))
      const controller = new ChannelsController(lifecycle as any)

      try {
        await controller.stop('ch-missing')
        expect.fail('should have thrown')
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND)
      }
    })
  })

  describe('ChannelAlreadyInStateError → 409 CONFLICT', () => {
    it('start() throws HttpException with 409 when already active', async () => {
      const lifecycle = makeLifecycle()
      lifecycle.start.mockRejectedValue(new ChannelAlreadyInStateError('ch-001', 'active'))
      const controller = new ChannelsController(lifecycle as any)

      try {
        await controller.start('ch-001')
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException)
        expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT)
      }
    })

    it('stop() throws HttpException with 409 when already stopped', async () => {
      const lifecycle = makeLifecycle()
      lifecycle.stop.mockRejectedValue(new ChannelAlreadyInStateError('ch-001', 'stopped'))
      const controller = new ChannelsController(lifecycle as any)

      try {
        await controller.stop('ch-001')
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException)
        expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT)
      }
    })

    it('error message is preserved in the HttpException', async () => {
      const lifecycle = makeLifecycle()
      const domainError = new ChannelAlreadyInStateError('ch-001', 'active')
      lifecycle.start.mockRejectedValue(domainError)
      const controller = new ChannelsController(lifecycle as any)

      try {
        await controller.start('ch-001')
        expect.fail('should have thrown')
      } catch (err) {
        expect((err as HttpException).message).toBe(domainError.message)
      }
    })
  })

  describe('InvalidTransitionError → 422 UNPROCESSABLE_ENTITY', () => {
    it('start() throws HttpException with 422 when transition invalid', async () => {
      const lifecycle = makeLifecycle()
      lifecycle.start.mockRejectedValue(new InvalidTransitionError('ch-001', 'starting', 'starting'))
      const controller = new ChannelsController(lifecycle as any)

      try {
        await controller.start('ch-001')
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException)
        expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY)
      }
    })

    it('restart() throws HttpException with 422 when in transitional state', async () => {
      const lifecycle = makeLifecycle()
      lifecycle.restart.mockRejectedValue(new InvalidTransitionError('ch-001', 'stopping', 'restart'))
      const controller = new ChannelsController(lifecycle as any)

      try {
        await controller.restart('ch-001')
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException)
        expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY)
      }
    })
  })

  describe('WebhookRegistrationError → 502 BAD_GATEWAY', () => {
    it('start() throws HttpException with 502 when webhook registration fails', async () => {
      const lifecycle = makeLifecycle()
      lifecycle.start.mockRejectedValue(new WebhookRegistrationError('ch-001', 'timeout'))
      const controller = new ChannelsController(lifecycle as any)

      try {
        await controller.start('ch-001')
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException)
        expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY)
      }
    })

    it('provision() throws HttpException with 502 when autoStart triggers webhook failure', async () => {
      const lifecycle = makeLifecycle()
      lifecycle.provision.mockRejectedValue(new WebhookRegistrationError('ch-001', 'connection refused'))
      const controller = new ChannelsController(lifecycle as any)

      try {
        await controller.provision({ type: 'telegram', name: 'Bot', config: {} } as any)
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException)
        expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY)
      }
    })
  })

  describe('Unknown errors — pass-through', () => {
    it('rethrows generic Error without wrapping in HttpException', async () => {
      const lifecycle = makeLifecycle()
      const generic = new Error('unexpected database error')
      lifecycle.status.mockRejectedValue(generic)
      const controller = new ChannelsController(lifecycle as any)

      try {
        await controller.status('ch-001')
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBe(generic)
        expect(err).not.toBeInstanceOf(HttpException)
      }
    })

    it('rethrows non-Error thrown values without wrapping', async () => {
      const lifecycle = makeLifecycle()
      const thrown = { code: 'CUSTOM_CODE' }
      lifecycle.start.mockRejectedValue(thrown)
      const controller = new ChannelsController(lifecycle as any)

      try {
        await controller.start('ch-001')
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBe(thrown)
        expect(err).not.toBeInstanceOf(HttpException)
      }
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('ChannelsController — listAll() does not go through wrap()', () => {
  it('listAll() propagates lifecycle errors directly (no wrapping)', async () => {
    const lifecycle = makeLifecycle()
    const err = new Error('db down')
    lifecycle.listAll.mockRejectedValue(err)
    const controller = new ChannelsController(lifecycle as any)

    await expect(controller.listAll()).rejects.toBe(err)
  })

  it('listAll() returns the full array from lifecycle', async () => {
    const lifecycle = makeLifecycle()
    const channels = [makeStatusDto('ch-001'), makeStatusDto('ch-002', 'stopped')]
    lifecycle.listAll.mockResolvedValue(channels)
    const controller = new ChannelsController(lifecycle as any)

    const result = await controller.listAll()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('ch-001')
    expect(result[1].id).toBe('ch-002')
  })
})
