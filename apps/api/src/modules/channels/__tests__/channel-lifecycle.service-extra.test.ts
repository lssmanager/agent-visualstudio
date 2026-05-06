/**
 * channel-lifecycle.service-extra.test.ts
 *
 * Additional unit tests complementing channel-lifecycle.service.test.ts.
 * Covers: listAll(), resolver.invalidateCache calls, toStatusDto date fields,
 * buildStatusDto non-zero counts, restart(provisioned), stop(error),
 * gateway no-op when methods absent, and provision() secretsEncrypted=null.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChannelLifecycleService } from '../channel-lifecycle.service'
import {
  ChannelNotFoundError,
  InvalidTransitionError,
  ChannelAlreadyInStateError,
} from '../channel-lifecycle.errors'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeChannel(status: string, id = 'ch-001', overrides: Record<string, unknown> = {}) {
  return {
    id,
    name:             'TestBot',
    type:             'telegram',
    status,
    isActive:         status === 'active' || status === 'starting',
    errorMessage:     null,
    lastStartedAt:    null,
    lastStoppedAt:    null,
    createdAt:        new Date('2024-01-01T00:00:00Z'),
    updatedAt:        new Date('2024-01-02T00:00:00Z'),
    config:           {},
    secretsEncrypted: null,
    ...overrides,
  }
}

function makeDb(channel: any, channels: any[] = [channel]) {
  return {
    channelConfig: {
      findUnique:        vi.fn().mockResolvedValue(channel),
      findUniqueOrThrow: vi.fn().mockResolvedValue(channel),
      create:            vi.fn().mockResolvedValue({ ...channel, status: 'provisioned', isActive: false }),
      update:            vi.fn().mockImplementation(({ data }: any) =>
                           Promise.resolve({ ...channel, ...data })),
      findMany:          vi.fn().mockResolvedValue(channels),
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
  return { svc: new ChannelLifecycleService(db as any, gateway as any, resolver as any), resolver, gateway, db }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('listAll()', () => {
  it('returns a ChannelStatusDto for each channel in the DB', async () => {
    const channels = [makeChannel('active', 'ch-001'), makeChannel('stopped', 'ch-002')]
    const db = makeDb(channels[0], channels)
    const { svc } = makeSvc(db)
    const result = await svc.listAll()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('ch-001')
    expect(result[1].id).toBe('ch-002')
  })

  it('returns empty array when there are no channels', async () => {
    const db = makeDb(null, [])
    const { svc } = makeSvc(db)
    const result = await svc.listAll()
    expect(result).toEqual([])
  })

  it('calls findMany with orderBy isActive desc, name asc', async () => {
    const ch = makeChannel('active')
    const db = makeDb(ch, [ch])
    const { svc } = makeSvc(db)
    await svc.listAll()
    expect(db.channelConfig.findMany).toHaveBeenCalledWith({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    })
  })

  it('each item in the result contains all ChannelStatusDto fields', async () => {
    const ch = makeChannel('active', 'ch-001')
    const db = makeDb(ch, [ch])
    const { svc } = makeSvc(db)
    const [item] = await svc.listAll()
    expect(item).toHaveProperty('id')
    expect(item).toHaveProperty('name')
    expect(item).toHaveProperty('type')
    expect(item).toHaveProperty('status')
    expect(item).toHaveProperty('isActive')
    expect(item).toHaveProperty('errorMessage')
    expect(item).toHaveProperty('lastStartedAt')
    expect(item).toHaveProperty('lastStoppedAt')
    expect(item).toHaveProperty('bindingCount')
    expect(item).toHaveProperty('activeSessions')
    expect(item).toHaveProperty('createdAt')
    expect(item).toHaveProperty('updatedAt')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('status() — enriched counts', () => {
  it('returns bindingCount and activeSessions from DB queries', async () => {
    const ch = makeChannel('active')
    const db = makeDb(ch)
    db.channelBinding.count = vi.fn().mockResolvedValue(5)
    db.gatewaySession.count = vi.fn().mockResolvedValue(3)
    const { svc } = makeSvc(db)
    const result = await svc.status('ch-001')
    expect(result.bindingCount).toBe(5)
    expect(result.activeSessions).toBe(3)
  })

  it('queries gatewaySession with state=active filter', async () => {
    const ch = makeChannel('active')
    const db = makeDb(ch)
    const { svc } = makeSvc(db)
    await svc.status('ch-001')
    expect(db.gatewaySession.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ state: 'active' }) })
    )
  })

  it('queries channelBinding with correct channelConfigId', async () => {
    const ch = makeChannel('active', 'ch-xyz')
    const db = makeDb(ch)
    db.channelConfig.findUnique = vi.fn().mockResolvedValue(ch)
    const { svc } = makeSvc(db)
    await svc.status('ch-xyz')
    expect(db.channelBinding.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ channelConfigId: 'ch-xyz' }) })
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('toStatusDto — date serialization', () => {
  it('serializes lastStartedAt as ISO string when present', async () => {
    const lastStartedAt = new Date('2024-06-15T10:30:00Z')
    const ch = makeChannel('active', 'ch-001', { lastStartedAt })
    const db = makeDb(ch)
    db.channelConfig.findUnique = vi.fn().mockResolvedValue(ch)
    const { svc } = makeSvc(db)
    const result = await svc.status('ch-001')
    expect(result.lastStartedAt).toBe(lastStartedAt.toISOString())
  })

  it('serializes lastStoppedAt as ISO string when present', async () => {
    const lastStoppedAt = new Date('2024-06-14T08:00:00Z')
    const ch = makeChannel('stopped', 'ch-001', { lastStoppedAt })
    const db = makeDb(ch)
    db.channelConfig.findUnique = vi.fn().mockResolvedValue(ch)
    const { svc } = makeSvc(db)
    const result = await svc.status('ch-001')
    expect(result.lastStoppedAt).toBe(lastStoppedAt.toISOString())
  })

  it('returns null for lastStartedAt when not set', async () => {
    const ch = makeChannel('provisioned', 'ch-001', { lastStartedAt: null })
    const db = makeDb(ch)
    const { svc } = makeSvc(db)
    const result = await svc.status('ch-001')
    expect(result.lastStartedAt).toBeNull()
  })

  it('returns null for lastStoppedAt when not set', async () => {
    const ch = makeChannel('active', 'ch-001', { lastStoppedAt: null })
    const db = makeDb(ch)
    const { svc } = makeSvc(db)
    const result = await svc.status('ch-001')
    expect(result.lastStoppedAt).toBeNull()
  })

  it('serializes createdAt and updatedAt as ISO strings', async () => {
    const createdAt = new Date('2024-01-01T00:00:00Z')
    const updatedAt = new Date('2024-01-02T12:00:00Z')
    const ch = makeChannel('active', 'ch-001', { createdAt, updatedAt })
    const db = makeDb(ch)
    db.channelConfig.findUnique = vi.fn().mockResolvedValue(ch)
    const { svc } = makeSvc(db)
    const result = await svc.status('ch-001')
    expect(result.createdAt).toBe(createdAt.toISOString())
    expect(result.updatedAt).toBe(updatedAt.toISOString())
  })

  it('returns null for errorMessage when not set', async () => {
    const ch = makeChannel('active', 'ch-001', { errorMessage: null })
    const db = makeDb(ch)
    const { svc } = makeSvc(db)
    const result = await svc.status('ch-001')
    expect(result.errorMessage).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('resolver.invalidateCache — call sites', () => {
  it('start() calls invalidateCache twice on success (starting + active)', async () => {
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const resolver = makeResolver()
    const { svc } = makeSvc(db, makeGateway(), resolver)
    await svc.start('ch-001')
    expect(resolver.invalidateCache).toHaveBeenCalledTimes(2)
    expect(resolver.invalidateCache).toHaveBeenCalledWith('ch-001')
  })

  it('start() calls invalidateCache three times on gateway failure (starting + error)', async () => {
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const gateway = { activateChannel: vi.fn().mockRejectedValue(new Error('fail')) }
    const resolver = makeResolver()
    const { svc } = makeSvc(db, gateway, resolver)
    await expect(svc.start('ch-001')).rejects.toThrow()
    // Called for: starting state + error state
    expect(resolver.invalidateCache).toHaveBeenCalledTimes(2)
  })

  it('stop() calls invalidateCache twice on success (stopping + stopped)', async () => {
    const ch = makeChannel('active')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const resolver = makeResolver()
    const { svc } = makeSvc(db, makeGateway(), resolver)
    await svc.stop('ch-001')
    expect(resolver.invalidateCache).toHaveBeenCalledTimes(2)
    expect(resolver.invalidateCache).toHaveBeenCalledWith('ch-001')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('restart() — additional states', () => {
  it('provisioned → calls start() directly (status=active)', async () => {
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const { svc } = makeSvc(db)
    const result = await svc.restart('ch-001')
    expect(result.status).toBe('active')
  })

  it('provisioned → does NOT call deactivateChannel (no stop phase)', async () => {
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const gateway = makeGateway()
    const { svc } = makeSvc(db, gateway)
    await svc.restart('ch-001')
    expect(gateway.deactivateChannel).not.toHaveBeenCalled()
  })

  it('channel not found → throws ChannelNotFoundError', async () => {
    const db = makeDb(null)
    db.channelConfig.findUnique = vi.fn().mockResolvedValue(null)
    const { svc } = makeSvc(db)
    await expect(svc.restart('nonexistent')).rejects.toBeInstanceOf(ChannelNotFoundError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('stop() — additional invalid transitions', () => {
  it('error → throws InvalidTransitionError (cannot stop from error state)', async () => {
    const ch = makeChannel('error')
    const db = makeDb(ch)
    const { svc } = makeSvc(db)
    await expect(svc.stop('ch-001')).rejects.toBeInstanceOf(InvalidTransitionError)
  })

  it('starting → throws InvalidTransitionError', async () => {
    const ch = makeChannel('starting')
    const db = makeDb(ch)
    const { svc } = makeSvc(db)
    await expect(svc.stop('ch-001')).rejects.toBeInstanceOf(InvalidTransitionError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('start() — additional scenarios', () => {
  it('stopping → throws InvalidTransitionError', async () => {
    const ch = makeChannel('stopping')
    const db = makeDb(ch)
    const { svc } = makeSvc(db)
    await expect(svc.start('ch-001')).rejects.toBeInstanceOf(InvalidTransitionError)
  })

  it('channel not found → throws ChannelNotFoundError', async () => {
    const db = makeDb(null)
    db.channelConfig.findUnique = vi.fn().mockResolvedValue(null)
    const { svc } = makeSvc(db)
    await expect(svc.start('nonexistent')).rejects.toBeInstanceOf(ChannelNotFoundError)
  })

  it('calls gateway.activateChannel with the channelConfigId', async () => {
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const gateway = makeGateway()
    const { svc } = makeSvc(db, gateway)
    await svc.start('ch-001')
    expect(gateway.activateChannel).toHaveBeenCalledWith('ch-001')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('stop() — calls gateway.deactivateChannel', () => {
  it('calls deactivateChannel with channelConfigId on success', async () => {
    const ch = makeChannel('active')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const gateway = makeGateway()
    const { svc } = makeSvc(db, gateway)
    await svc.stop('ch-001')
    expect(gateway.deactivateChannel).toHaveBeenCalledWith('ch-001')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('gateway stub safety — no-op when methods are absent', () => {
  it('start() succeeds when gateway has no activateChannel method', async () => {
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const emptyGateway = {}
    const { svc } = makeSvc(db, emptyGateway)
    const result = await svc.start('ch-001')
    expect(result.status).toBe('active')
  })

  it('stop() succeeds when gateway has no deactivateChannel method', async () => {
    const ch = makeChannel('active')
    const db = makeDb(ch)
    db.channelConfig.update = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ ...ch, ...data }))
    const emptyGateway = {}
    const { svc } = makeSvc(db, emptyGateway)
    const result = await svc.stop('ch-001')
    expect(result.status).toBe('stopped')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('provision() — secretsEncrypted=null when no secrets', () => {
  it('does not set secretsEncrypted when secrets are omitted', async () => {
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    const { svc } = makeSvc(db)
    await svc.provision({ type: 'telegram', name: 'TestBot', config: {} })
    const createCall = (db.channelConfig.create as any).mock.calls[0][0]
    expect(createCall.data.secretsEncrypted).toBeNull()
  })

  it('sets correct type and name from ProvisionChannelDto', async () => {
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    const { svc } = makeSvc(db)
    await svc.provision({ type: 'whatsapp', name: 'WhatsApp Bot', config: { webhookUrl: 'https://example.com' } })
    const createCall = (db.channelConfig.create as any).mock.calls[0][0]
    expect(createCall.data.type).toBe('whatsapp')
    expect(createCall.data.name).toBe('WhatsApp Bot')
  })

  it('sets errorMessage=null and lastStartedAt=null and lastStoppedAt=null on create', async () => {
    const ch = makeChannel('provisioned')
    const db = makeDb(ch)
    const { svc } = makeSvc(db)
    await svc.provision({ type: 'telegram', name: 'Bot', config: {} })
    const createCall = (db.channelConfig.create as any).mock.calls[0][0]
    expect(createCall.data.errorMessage).toBeNull()
    expect(createCall.data.lastStartedAt).toBeNull()
    expect(createCall.data.lastStoppedAt).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('ChannelNotFoundError — loadOrThrow behavior', () => {
  it('stop() throws ChannelNotFoundError when channel does not exist', async () => {
    const db = makeDb(null)
    db.channelConfig.findUnique = vi.fn().mockResolvedValue(null)
    const { svc } = makeSvc(db)
    await expect(svc.stop('nonexistent')).rejects.toBeInstanceOf(ChannelNotFoundError)
  })

  it('status() throws ChannelNotFoundError for unknown id (regression)', async () => {
    const db = makeDb(null)
    db.channelConfig.findUnique = vi.fn().mockResolvedValue(null)
    const { svc } = makeSvc(db)
    const err = await svc.status('unknown-id').catch(e => e)
    expect(err).toBeInstanceOf(ChannelNotFoundError)
    expect(err.message).toContain('unknown-id')
  })
})