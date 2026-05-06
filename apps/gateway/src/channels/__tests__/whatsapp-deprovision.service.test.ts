/**
 * whatsapp-deprovision.service.test.ts — [F3a-23]
 *
 * Tests unitarios para WhatsAppDeprovisionService.
 * Todos los colaboradores (db, store, fs) se mockean.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import { WhatsAppDeprovisionService } from '../whatsapp-deprovision.service'

// ── Mocks de fs ──────────────────────────────────────────────────────────────
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  rmSync:     vi.fn(),
}))

// ── Factory helpers ──────────────────────────────────────────────────────────

function makeAdapter(state: string, hasLogout = true) {
  return {
    state,
    logout:  hasLogout ? vi.fn().mockResolvedValue(undefined) : undefined,
    dispose: vi.fn().mockResolvedValue(undefined),
  }
}

function makeStore(adapter?: ReturnType<typeof makeAdapter>) {
  return {
    get:    vi.fn().mockReturnValue(adapter ? { adapter } : undefined),
    remove: vi.fn(),
  }
}

function makeDb(prismaError?: { code: string }) {
  return {
    channelConfig: {
      update: prismaError
        ? vi.fn().mockRejectedValue(Object.assign(new Error('not found'), prismaError))
        : vi.fn().mockResolvedValue({}),
    },
  }
}

// ── Tests: logout() ──────────────────────────────────────────────────────────

describe('WhatsAppDeprovisionService.logout()', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
  })

  it('calls adapter.logout() when state is "open"', async () => {
    const adapter = makeAdapter('open')
    const store   = makeStore(adapter)
    const svc     = new WhatsAppDeprovisionService(makeDb() as any, store as any)

    await svc.logout('cfg-1')

    expect(adapter.logout).toHaveBeenCalledOnce()
    expect(adapter.dispose).not.toHaveBeenCalled()
  })

  it('calls adapter.logout() when state is "reconnecting"', async () => {
    const adapter = makeAdapter('reconnecting')
    const store   = makeStore(adapter)
    const svc     = new WhatsAppDeprovisionService(makeDb() as any, store as any)

    await svc.logout('cfg-2')

    expect(adapter.logout).toHaveBeenCalledOnce()
  })

  it('calls adapter.dispose() when state is "idle"', async () => {
    const adapter = makeAdapter('idle')
    const store   = makeStore(adapter)
    const svc     = new WhatsAppDeprovisionService(makeDb() as any, store as any)

    await svc.logout('cfg-3')

    expect(adapter.dispose).toHaveBeenCalledOnce()
    expect(adapter.logout).not.toHaveBeenCalled()
  })

  it('when configId not in store — returns adapterState=not_in_store without throwing', async () => {
    const store = makeStore(undefined)
    const svc   = new WhatsAppDeprovisionService(makeDb() as any, store as any)

    const result = await svc.logout('cfg-missing')

    expect(result.adapterState).toBe('not_in_store')
  })

  it('deletes sessionDir when it exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    const store = makeStore(undefined)
    const svc   = new WhatsAppDeprovisionService(makeDb() as any, store as any)

    const result = await svc.logout('cfg-fs')

    expect(fs.rmSync).toHaveBeenCalled()
    expect(result.sessionDeleted).toBe(true)
  })

  it('sessionDeleted=false when sessionDir does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    const store = makeStore(undefined)
    const svc   = new WhatsAppDeprovisionService(makeDb() as any, store as any)

    const result = await svc.logout('cfg-nofs')

    expect(result.sessionDeleted).toBe(false)
  })
})

// ── Tests: deprovision() ─────────────────────────────────────────────────────

describe('WhatsAppDeprovisionService.deprovision()', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
  })

  it('calls db.channelConfig.update with { active: false }', async () => {
    const db    = makeDb()
    const store = makeStore(makeAdapter('open'))
    const svc   = new WhatsAppDeprovisionService(db as any, store as any)

    await svc.deprovision('cfg-deprov-1')

    expect(db.channelConfig.update).toHaveBeenCalledWith({
      where: { id: 'cfg-deprov-1' },
      data:  { active: false },
    })
  })

  it('calls store.remove(configId)', async () => {
    const store = makeStore(makeAdapter('open'))
    const svc   = new WhatsAppDeprovisionService(makeDb() as any, store as any)

    await svc.deprovision('cfg-deprov-2')

    expect(store.remove).toHaveBeenCalledWith('cfg-deprov-2')
  })

  it('when ChannelConfig not found (P2025) → channelDeactivated=false, no throw', async () => {
    const db    = makeDb({ code: 'P2025' })
    const store = makeStore(undefined)
    const svc   = new WhatsAppDeprovisionService(db as any, store as any)

    const result = await svc.deprovision('cfg-missing-db')

    expect(result.channelDeactivated).toBe(false)
    expect(result.storeDestroyed).toBe(true)
  })

  it('result contains all required fields', async () => {
    const store = makeStore(makeAdapter('open'))
    const svc   = new WhatsAppDeprovisionService(makeDb() as any, store as any)

    const result = await svc.deprovision('cfg-fields')

    expect(result).toMatchObject({
      configId:           'cfg-fields',
      sessionDeleted:     expect.any(Boolean),
      adapterState:       expect.any(String),
      channelDeactivated: true,
      storeDestroyed:     true,
    })
  })
})
