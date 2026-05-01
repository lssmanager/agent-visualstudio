/**
 * agent-resolver.test.ts — [F3a-06]
 *
 * Tests for AgentResolver: priority rules, cache TTL,
 * createBinding validation, resolveOrNull, error shape.
 *
 * Framework: vitest | Mocks: vi.fn() — no real DB needed.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
import { AgentResolver, AgentResolutionError } from '../agent-resolver.service.js'
import type { AgentResolutionContext } from '../agent-resolver.types.js'

// ── Helpers ─────────────────────────────────────────────────────────────

function makeBinding(overrides: {
  id?: string
  agentId?: string
  scope: string
  scopeValue?: string | null
  priority?: number
  enabled?: boolean
}) {
  return {
    id:         overrides.id         ?? 'binding-' + Math.random().toString(36).slice(2),
    agentId:    overrides.agentId    ?? 'agent-default',
    scope:      overrides.scope,
    scopeValue: overrides.scopeValue ?? null,
    priority:   overrides.priority   ?? 0,
    enabled:    overrides.enabled    ?? true,
  }
}

function makePrisma(bindings: ReturnType<typeof makeBinding>[]) {
  return {
    channelBinding: {
      findMany: vi.fn().mockResolvedValue(bindings),
      create:   vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'new-id', ...data })),
      delete:   vi.fn().mockResolvedValue(undefined),
    },
  } as any
}

const BASE_CTX: AgentResolutionContext = {
  channelConfigId: 'chan-1',
  externalUserId:  'user-ext-42',
  workspaceId:     'ws-1',
  tenantId:        'tenant-1',
}

// ── Priority rules ──────────────────────────────────────────────────────

describe('resolve() — priority rules', () => {

  it('scope=user wins over scope=workspace when both match', async () => {
    const userBinding      = makeBinding({ scope: 'user',      scopeValue: 'user-ext-42', agentId: 'agent-user' })
    const workspaceBinding = makeBinding({ scope: 'workspace', scopeValue: 'ws-1',        agentId: 'agent-ws' })
    const db = makePrisma([userBinding, workspaceBinding])
    const resolver = new AgentResolver(db)

    const result = await resolver.resolve(BASE_CTX)
    expect(result.agentId).toBe('agent-user')
    expect(result.resolvedBy).toBe('user')
  })

  it('scope=user wins over scope=default', async () => {
    const userBinding    = makeBinding({ scope: 'user',    scopeValue: 'user-ext-42', agentId: 'agent-user' })
    const defaultBinding = makeBinding({ scope: 'default', scopeValue: null,          agentId: 'agent-default' })
    const db = makePrisma([userBinding, defaultBinding])
    const resolver = new AgentResolver(db)

    const result = await resolver.resolve(BASE_CTX)
    expect(result.agentId).toBe('agent-user')
    expect(result.resolvedBy).toBe('user')
  })

  it('scope=tenant wins over scope=workspace and scope=default', async () => {
    const tenantBinding    = makeBinding({ scope: 'tenant',    scopeValue: 'tenant-1', agentId: 'agent-tenant' })
    const workspaceBinding = makeBinding({ scope: 'workspace', scopeValue: 'ws-1',     agentId: 'agent-ws' })
    const defaultBinding   = makeBinding({ scope: 'default',   scopeValue: null,        agentId: 'agent-default' })
    const db = makePrisma([tenantBinding, workspaceBinding, defaultBinding])
    const resolver = new AgentResolver(db)

    const result = await resolver.resolve(BASE_CTX)
    expect(result.agentId).toBe('agent-tenant')
    expect(result.resolvedBy).toBe('tenant')
  })

  it('scope=workspace wins over scope=default', async () => {
    const workspaceBinding = makeBinding({ scope: 'workspace', scopeValue: 'ws-1', agentId: 'agent-ws' })
    const defaultBinding   = makeBinding({ scope: 'default',   scopeValue: null,   agentId: 'agent-default' })
    const db = makePrisma([workspaceBinding, defaultBinding])
    const resolver = new AgentResolver(db)

    const result = await resolver.resolve(BASE_CTX)
    expect(result.agentId).toBe('agent-ws')
    expect(result.resolvedBy).toBe('workspace')
  })

  it('scope=default is the fallback when no dynamic scope matches', async () => {
    const defaultBinding = makeBinding({ scope: 'default', scopeValue: null, agentId: 'agent-default' })
    const db = makePrisma([defaultBinding])
    const resolver = new AgentResolver(db)

    const ctx: AgentResolutionContext = { channelConfigId: 'chan-1', externalUserId: 'user-ext-99' }
    const result = await resolver.resolve(ctx)
    expect(result.agentId).toBe('agent-default')
    expect(result.resolvedBy).toBe('default')
  })

  it('does NOT attempt workspace scope when workspaceId is absent in context', async () => {
    const workspaceBinding = makeBinding({ scope: 'workspace', scopeValue: 'ws-1', agentId: 'agent-ws' })
    const db = makePrisma([workspaceBinding])
    const resolver = new AgentResolver(db)

    // No workspaceId in context
    const ctx: AgentResolutionContext = { channelConfigId: 'chan-1', externalUserId: 'user-ext-42' }
    await expect(resolver.resolve(ctx, undefined)).rejects.toThrow(AgentResolutionError)
  })

  it('does NOT attempt tenant scope when tenantId is absent in context', async () => {
    const tenantBinding = makeBinding({ scope: 'tenant', scopeValue: 'tenant-1', agentId: 'agent-tenant' })
    const db = makePrisma([tenantBinding])
    const resolver = new AgentResolver(db)

    // No tenantId in context — only externalUserId
    const ctx: AgentResolutionContext = { channelConfigId: 'chan-1', externalUserId: 'user-ext-42' }
    await expect(resolver.resolve(ctx, undefined)).rejects.toThrow(AgentResolutionError)
  })

  it('only matches workspace binding with the exact scopeValue from context', async () => {
    const wsBinding1 = makeBinding({ scope: 'workspace', scopeValue: 'ws-99',  agentId: 'agent-ws-99' })
    const wsBinding2 = makeBinding({ scope: 'workspace', scopeValue: 'ws-1',   agentId: 'agent-ws-1' })
    const db = makePrisma([wsBinding1, wsBinding2])
    const resolver = new AgentResolver(db)

    const result = await resolver.resolve(BASE_CTX)
    expect(result.agentId).toBe('agent-ws-1')
    expect(result.resolvedBy).toBe('workspace')
  })

  it('falls back to configAgentId when no binding matches', async () => {
    const db = makePrisma([])  // empty bindings
    const resolver = new AgentResolver(db)

    const result = await resolver.resolve(BASE_CTX, 'legacy-agent')
    expect(result.agentId).toBe('legacy-agent')
    expect(result.resolvedBy).toBe('config')
    expect(result.bindingId).toBeUndefined()
  })

  it('throws AgentResolutionError when no binding and no configAgentId', async () => {
    const db = makePrisma([])
    const resolver = new AgentResolver(db)

    await expect(resolver.resolve(BASE_CTX, undefined)).rejects.toThrow(AgentResolutionError)
  })

  it('AgentResolutionError has correct name and message containing channelConfigId and externalUserId', async () => {
    const db = makePrisma([])
    const resolver = new AgentResolver(db)

    const err = await resolver.resolve(BASE_CTX, undefined).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AgentResolutionError)
    expect((err as AgentResolutionError).name).toBe('AgentResolutionError')
    expect((err as AgentResolutionError).message).toContain('chan-1')
    expect((err as AgentResolutionError).message).toContain('user-ext-42')
  })
})

// ── Cache ────────────────────────────────────────────────────────────────

describe('cache', () => {

  beforeEach(() => { vi.useFakeTimers() })
  afterEach(()  => { vi.useRealTimers() })

  it('second resolve() call does NOT call findMany again (cache hit)', async () => {
    const defaultBinding = makeBinding({ scope: 'default', scopeValue: null })
    const db = makePrisma([defaultBinding])
    const resolver = new AgentResolver(db)

    await resolver.resolve(BASE_CTX, 'fallback')
    await resolver.resolve(BASE_CTX, 'fallback')

    expect(db.channelBinding.findMany).toHaveBeenCalledTimes(1)
  })

  it('invalidateCache() forces a fresh findMany on next resolve()', async () => {
    const defaultBinding = makeBinding({ scope: 'default', scopeValue: null })
    const db = makePrisma([defaultBinding])
    const resolver = new AgentResolver(db)

    await resolver.resolve(BASE_CTX, 'fallback')
    resolver.invalidateCache('chan-1')
    await resolver.resolve(BASE_CTX, 'fallback')

    expect(db.channelBinding.findMany).toHaveBeenCalledTimes(2)
  })

  it('cache expires after 5 minutes and triggers a fresh findMany', async () => {
    const defaultBinding = makeBinding({ scope: 'default', scopeValue: null })
    const db = makePrisma([defaultBinding])
    const resolver = new AgentResolver(db)

    await resolver.resolve(BASE_CTX, 'fallback')
    // Advance time beyond TTL (5 min + 1ms)
    vi.advanceTimersByTime(5 * 60 * 1_000 + 1)
    await resolver.resolve(BASE_CTX, 'fallback')

    expect(db.channelBinding.findMany).toHaveBeenCalledTimes(2)
  })
})

// ── createBinding() ──────────────────────────────────────────────────────

describe('createBinding()', () => {

  it('throws when scope=default has a scopeValue', async () => {
    const db = makePrisma([])
    const resolver = new AgentResolver(db)

    await expect(
      resolver.createBinding({
        channelConfigId: 'chan-1',
        agentId:         'agent-1',
        scope:           'default',
        scopeValue:      'some-value',
      }),
    ).rejects.toThrow('scopeValue must be null/undefined for scope \'default\'')
  })

  it('throws when scope=workspace has no scopeValue', async () => {
    const db = makePrisma([])
    const resolver = new AgentResolver(db)

    await expect(
      resolver.createBinding({
        channelConfigId: 'chan-1',
        agentId:         'agent-1',
        scope:           'workspace',
        scopeValue:      undefined,
      }),
    ).rejects.toThrow('scopeValue is required for scope \'workspace\'')
  })

  it('creates binding and invalidates cache so next resolve calls findMany again', async () => {
    const defaultBinding = makeBinding({ scope: 'default', scopeValue: null })
    const db = makePrisma([defaultBinding])
    const resolver = new AgentResolver(db)

    // Pre-warm cache
    await resolver.resolve(BASE_CTX, 'fallback')
    expect(db.channelBinding.findMany).toHaveBeenCalledTimes(1)

    // createBinding should invalidate cache
    await resolver.createBinding({
      channelConfigId: 'chan-1',
      agentId:         'agent-new',
      scope:           'workspace',
      scopeValue:      'ws-2',
    })

    // Next resolve should hit DB again
    await resolver.resolve(BASE_CTX, 'fallback')
    expect(db.channelBinding.findMany).toHaveBeenCalledTimes(2)
  })
})

// ── resolveOrNull() ──────────────────────────────────────────────────────

describe('resolveOrNull()', () => {

  it('returns null instead of throwing when no binding and no configAgentId', async () => {
    const db = makePrisma([])
    const resolver = new AgentResolver(db)

    const result = await resolver.resolveOrNull(BASE_CTX, undefined)
    expect(result).toBeNull()
  })
})
