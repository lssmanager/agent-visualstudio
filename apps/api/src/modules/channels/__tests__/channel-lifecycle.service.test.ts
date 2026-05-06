import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChannelLifecycleService } from '../channel-lifecycle.service'
import {
  ChannelNotFoundError,
  InvalidTransitionError,
  ChannelAlreadyInStateError,
  WebhookRegistrationError,
} from '../channel-lifecycle.errors'

function makeChannel(status: string, id = 'ch-001') {
  return {
    id,
    name: 'TestBot',
    type: 'telegram',
    status,
    isActive: status === 'active' || status === 'starting',
    errorMessage: null,
    lastStartedAt: null,
    lastStoppedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    config: {},
    secretsEncrypted: null,
  }
}

function makeDb(channel: any) {
  return {
    channelConfig: {
      findUnique:         vi.fn().mockResolvedValue(channel),
      findUniqueOrThrow:  vi.fn().mockResolvedValue(channel),
      create:             vi.fn().mockResolvedValue({ ...channel, status: 'provisioned', isActive: false }),
      update:             vi.fn().mockImplementation(({ data }: any) =>
                            Promise.resolve({ ...channel, ...data })),
      findMany:           vi.fn().mockResolvedValue([channel]),
    },
    channelBinding: { count: vi.fn().mockResolvedValue(0) },
    gatewaySession: { count: vi.fn().mockResolvedValue(0) },
  }
}

function makeGateway() {
  return {
    activateChannel:   vi.fn().mockResolvedValue(undefined),
    deactivateChannel: vi.fn().mockResolvedValue(undefined),
  }
}

function makeResolver() {
  return { invalidateCache: vi.fn() }
}

function makeSvc(db: any, gateway: any = makeGateway(), resolver: any = makeResolver()) {
  return new ChannelLifecycleService(db as any, gateway as any, resolver as any)
}

// ─────────────────────────────────────────────────────────────────────────────
describe('provision()', () => {
  it('creates channel with status=provisioned and isActive=false', async () => {
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    const svc = makeSvc(db)
    const result = await svc.provision({ type: 'telegram', name: 'TestBot', config: {} })
    expect(db.channelConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'provisioned', isActive: false }) })
    )
    expect(result.status).toBe('provisioned')
    expect(result.isActive).toBe(false)
  })

  it('encrypts secrets when provided', async () => {
    process.env.GATEWAY_ENCRYPTION_KEY = 'a'.repeat(64) // 32-byte key in hex
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    const svc = makeSvc(db)
    await svc.provision({ type: 'telegram', name: 'TestBot', config: {}, secrets: { token: 'secret' } })
    const createCall = (db.channelConfig.create as any).mock.calls[0][0]
    expect(createCall.data.secretsEncrypted).toBeTruthy()
    expect(createCall.data.secretsEncrypted).not.toBe('{"token":"secret"}')
    delete process.env.GATEWAY_ENCRYPTION_KEY
  })

  it('autoStart=true calls start() and returns active status', async () => {
    process.env.GATEWAY_ENCRYPTION_KEY = 'b'.repeat(64)
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const svc = makeSvc(db)
    const result = await svc.provision({ type: 'telegram', name: 'TestBot', config: {}, autoStart: true })
    expect(result.status).toBe('active')
    delete process.env.GATEWAY_ENCRYPTION_KEY
  })

  it('throws Error when GATEWAY_ENCRYPTION_KEY is missing and secrets provided', async () => {
    delete process.env.GATEWAY_ENCRYPTION_KEY
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    const svc = makeSvc(db)
    await expect(
      svc.provision({ type: 'telegram', name: 'TestBot', config: {}, secrets: { token: 'x' } })
    ).rejects.toThrow('GATEWAY_ENCRYPTION_KEY is not set')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('start()', () => {
  it('provisioned → active, isActive=true', async () => {
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const svc = makeSvc(db)
    const result = await svc.start('ch-001')
    expect(result.status).toBe('active')
    expect(result.isActive).toBe(true)
  })

  it('stopped → active', async () => {
    const ch = makeChannel('stopped')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const svc = makeSvc(db)
    const result = await svc.start('ch-001')
    expect(result.status).toBe('active')
  })

  it('error → active', async () => {
    const ch = makeChannel('error')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const svc = makeSvc(db)
    const result = await svc.start('ch-001')
    expect(result.status).toBe('active')
  })

  it('active → throws ChannelAlreadyInStateError', async () => {
    const ch = makeChannel('active')
    const db = makeDb(ch)
    const svc = makeSvc(db)
    await expect(svc.start('ch-001')).rejects.toBeInstanceOf(ChannelAlreadyInStateError)
  })

  it('starting → throws InvalidTransitionError', async () => {
    const ch = makeChannel('starting')
    const db = makeDb(ch)
    const svc = makeSvc(db)
    await expect(svc.start('ch-001')).rejects.toBeInstanceOf(InvalidTransitionError)
  })

  it('gateway failure → persists error status and throws WebhookRegistrationError', async () => {
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    const gateway = { activateChannel: vi.fn().mockRejectedValue(new Error('webhook timeout')) }
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const svc = makeSvc(db, gateway)
    await expect(svc.start('ch-001')).rejects.toBeInstanceOf(WebhookRegistrationError)
    const lastUpdateCall = (db.channelConfig.update as any).mock.calls.at(-1)[0]
    expect(lastUpdateCall.data.status).toBe('error')
    expect(lastUpdateCall.data.isActive).toBe(false)
    expect(lastUpdateCall.data.errorMessage).toContain('webhook timeout')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('stop()', () => {
  it('active → stopped, isActive=false', async () => {
    const ch = makeChannel('active')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const svc = makeSvc(db)
    const result = await svc.stop('ch-001')
    expect(result.status).toBe('stopped')
    expect(result.isActive).toBe(false)
  })

  it('stopped → throws ChannelAlreadyInStateError', async () => {
    const ch = makeChannel('stopped')
    const db = makeDb(ch)
    const svc = makeSvc(db)
    await expect(svc.stop('ch-001')).rejects.toBeInstanceOf(ChannelAlreadyInStateError)
  })

  it('provisioned → throws InvalidTransitionError', async () => {
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    const svc = makeSvc(db)
    await expect(svc.stop('ch-001')).rejects.toBeInstanceOf(InvalidTransitionError)
  })

  it('gateway failure → persists error status and re-throws', async () => {
    const ch = makeChannel('active')
    const db = makeDb(ch)
    const gateway = {
      activateChannel:   vi.fn(),
      deactivateChannel: vi.fn().mockRejectedValue(new Error('network error')),
    }
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const svc = makeSvc(db, gateway)
    await expect(svc.stop('ch-001')).rejects.toThrow('network error')
    const lastUpdateCall = (db.channelConfig.update as any).mock.calls.at(-1)[0]
    expect(lastUpdateCall.data.status).toBe('error')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('restart()', () => {
  it('active → stop() + start() → returns active', async () => {
    const ch = makeChannel('active')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    db.channelConfig.findUnique = vi.fn()
      .mockResolvedValueOnce(ch)              // restart load
      .mockResolvedValueOnce(ch)              // stop load
      .mockResolvedValueOnce({ ...ch, status: 'stopped', isActive: false }) // start load
    const svc = makeSvc(db)
    const result = await svc.restart('ch-001')
    expect(result.status).toBe('active')
  })

  it('error → calls start() directly (no stop())', async () => {
    const ch = makeChannel('error')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const svc = makeSvc(db)
    const result = await svc.restart('ch-001')
    expect(result.status).toBe('active')
  })

  it('stopped → calls start() directly', async () => {
    const ch = makeChannel('stopped')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const svc = makeSvc(db)
    const result = await svc.restart('ch-001')
    expect(result.status).toBe('active')
  })

  it('starting → throws InvalidTransitionError', async () => {
    const ch = makeChannel('starting')
    const db = makeDb(ch)
    const svc = makeSvc(db)
    await expect(svc.restart('ch-001')).rejects.toBeInstanceOf(InvalidTransitionError)
  })

  it('stopping → throws InvalidTransitionError', async () => {
    const ch = makeChannel('stopping')
    const db = makeDb(ch)
    const svc = makeSvc(db)
    await expect(svc.restart('ch-001')).rejects.toBeInstanceOf(InvalidTransitionError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('status()', () => {
  it('returns ChannelStatusDto with all fields for existing channel', async () => {
    const ch = makeChannel('active')
    const db = makeDb(ch)
    const svc = makeSvc(db)
    const result = await svc.status('ch-001')
    expect(result.id).toBe('ch-001')
    expect(result.status).toBe('active')
    expect(result.isActive).toBe(true)
    expect(result.bindingCount).toBe(0)
    expect(result.activeSessions).toBe(0)
    expect(result.createdAt).toBeTruthy()
  })

  it('throws ChannelNotFoundError when channel does not exist', async () => {
    const db = makeDb(null)
    db.channelConfig.findUnique = vi.fn().mockResolvedValue(null)
    const svc = makeSvc(db)
    await expect(svc.status('nonexistent')).rejects.toBeInstanceOf(ChannelNotFoundError)
  })
})
