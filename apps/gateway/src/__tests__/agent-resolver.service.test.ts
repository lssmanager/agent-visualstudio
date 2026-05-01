import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentResolverService, type BindingRow } from '../agent-resolver.service.js'
import {
  ChannelBindingNotFoundError,
  ChannelConfigInactiveError,
  AmbiguousBindingError,
} from '../agent-resolver.errors.js'

const CHANNEL_ID = 'cc-001'
const USER_ID    = 'user-ext-001'

function makeBinding(
  agentId:    string,
  scopeLevel: string,
  isDefault = false,
  id        = `binding-${agentId}`,
  scopeId   = `scope-${scopeLevel}`,
): BindingRow {
  return { id, agentId, scopeLevel, scopeId, isDefault }
}

function makeDb(bindings: BindingRow[], isActive = true) {
  return {
    channelConfig: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ isActive }),
    },
    channelBinding: {
      findMany: vi.fn().mockResolvedValue(bindings),
    },
    gatewaySession: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  } as unknown as any
}

function makeSvc(db: any) {
  return new AgentResolverService(db)
}

// ─────────────────────────────────────────────────────────────────────────────
describe('resolve() — casos base', () => {
  it('0 bindings → throws ChannelBindingNotFoundError', async () => {
    const svc = makeSvc(makeDb([]))
    await expect(svc.resolve(CHANNEL_ID, USER_ID)).rejects.toBeInstanceOf(ChannelBindingNotFoundError)
  })

  it('1 binding → retorna ese agentId', async () => {
    const svc = makeSvc(makeDb([makeBinding('agent-A', 'agency')]))
    const res = await svc.resolve(CHANNEL_ID, USER_ID)
    expect(res.agentId).toBe('agent-A')
  })

  it('[agency, agent] → retorna scope=agent (prioridad 4)', async () => {
    const svc = makeSvc(makeDb([
      makeBinding('agent-A', 'agency'),
      makeBinding('agent-B', 'agent'),
    ]))
    const res = await svc.resolve(CHANNEL_ID, USER_ID)
    expect(res.agentId).toBe('agent-B')
    expect(res.scopeLevel).toBe('agent')
  })

  it('[department, workspace] → retorna scope=workspace (prioridad 3)', async () => {
    const svc = makeSvc(makeDb([
      makeBinding('agent-A', 'department'),
      makeBinding('agent-B', 'workspace'),
    ]))
    const res = await svc.resolve(CHANNEL_ID, USER_ID)
    expect(res.agentId).toBe('agent-B')
    expect(res.scopeLevel).toBe('workspace')
  })

  it('3 bindings, uno isDefault → retorna el isDefault aunque su scope sea menor', async () => {
    const svc = makeSvc(makeDb([
      makeBinding('agent-A', 'agent', false),
      makeBinding('agent-B', 'agency', true),   // isDefault, scope menor
      makeBinding('agent-C', 'workspace', false),
    ]))
    const res = await svc.resolve(CHANNEL_ID, USER_ID)
    expect(res.agentId).toBe('agent-B')
    expect(res.isDefault).toBe(true)
  })

  it('2 bindings isDefault=true → AmbiguousBindingError', async () => {
    const svc = makeSvc(makeDb([
      makeBinding('agent-A', 'agent', true),
      makeBinding('agent-B', 'agency', true),
    ]))
    const err = await svc.resolve(CHANNEL_ID, USER_ID).catch((e) => e)
    expect(err).toBeInstanceOf(AmbiguousBindingError)
    expect((err as AmbiguousBindingError).candidates).toContain('agent-A')
    expect((err as AmbiguousBindingError).candidates).toContain('agent-B')
  })

  it('2 bindings mismo scopeLevel sin isDefault → AmbiguousBindingError', async () => {
    const svc = makeSvc(makeDb([
      makeBinding('agent-A', 'agent'),
      makeBinding('agent-B', 'agent'),
    ]))
    const err = await svc.resolve(CHANNEL_ID, USER_ID).catch((e) => e)
    expect(err).toBeInstanceOf(AmbiguousBindingError)
    expect((err as AmbiguousBindingError).candidates).toContain('agent-A')
    expect((err as AmbiguousBindingError).candidates).toContain('agent-B')
  })

  it('canal inactivo → throws ChannelConfigInactiveError', async () => {
    const svc = makeSvc(makeDb([], false))
    await expect(svc.resolve(CHANNEL_ID, USER_ID)).rejects.toBeInstanceOf(ChannelConfigInactiveError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('resolve() — sticky session', () => {
  it('existingAgentId presente + binding encontrado → retorna existingAgentId', async () => {
    const binding = makeBinding('agent-A', 'agent')
    const svc = makeSvc(makeDb([binding]))
    const res = await svc.resolve(CHANNEL_ID, USER_ID, 'agent-A')
    expect(res.agentId).toBe('agent-A')
  })

  it('existingAgentId presente + binding eliminado → re-resuelve con bindings activos', async () => {
    // Solo existe binding para agent-B, agent-A fue eliminado
    const svc = makeSvc(makeDb([makeBinding('agent-B', 'agent')]))
    const res = await svc.resolve(CHANNEL_ID, USER_ID, 'agent-A')
    expect(res.agentId).toBe('agent-B')
  })

  it('existingAgentId=null → resuelve por prioridad normal', async () => {
    const svc = makeSvc(makeDb([
      makeBinding('agent-A', 'agency'),
      makeBinding('agent-B', 'agent'),
    ]))
    const res = await svc.resolve(CHANNEL_ID, USER_ID, null)
    expect(res.agentId).toBe('agent-B')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('resolve() — caché', () => {
  it('dos llamadas al mismo channelConfigId → findMany llamado solo 1 vez', async () => {
    const db = makeDb([makeBinding('agent-A', 'agent')])
    const svc = makeSvc(db)
    await svc.resolve(CHANNEL_ID, USER_ID)
    await svc.resolve(CHANNEL_ID, USER_ID)
    expect(db.channelBinding.findMany).toHaveBeenCalledTimes(1)
  })

  it('invalidateCache → siguiente llamada recarga desde DB', async () => {
    const db = makeDb([makeBinding('agent-A', 'agent')])
    const svc = makeSvc(db)
    await svc.resolve(CHANNEL_ID, USER_ID)
    svc.invalidateCache(CHANNEL_ID)
    await svc.resolve(CHANNEL_ID, USER_ID)
    expect(db.channelBinding.findMany).toHaveBeenCalledTimes(2)
  })

  it('caché expirado (cachedAt > CACHE_TTL_MS) → recarga desde DB', async () => {
    const db = makeDb([makeBinding('agent-A', 'agent')])
    const svc = makeSvc(db)
    // Primera llamada
    await svc.resolve(CHANNEL_ID, USER_ID)
    // Manipular el timestamp del caché para simular expiración
    const cache = (svc as any).bindingsCache as Map<string, any>
    const entry = cache.get(CHANNEL_ID)!
    entry.cachedAt = Date.now() - (6 * 60 * 1_000) // 6 min atrás
    // Segunda llamada con caché expirado
    await svc.resolve(CHANNEL_ID, USER_ID)
    expect(db.channelBinding.findMany).toHaveBeenCalledTimes(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('resolve() — multi-canal / multi-binding', () => {
  it('dos canales distintos → resuelve agentes diferentes sin interferencia de caché', async () => {
    const db1 = makeDb([makeBinding('agent-telegram', 'agent')])
    const db2 = makeDb([makeBinding('agent-webchat', 'agent')])
    // Dos instancias distintas para simular canales distintos
    const svc1 = makeSvc(db1)
    const svc2 = makeSvc(db2)
    const res1 = await svc1.resolve('cc-telegram', USER_ID)
    const res2 = await svc2.resolve('cc-webchat', USER_ID)
    expect(res1.agentId).toBe('agent-telegram')
    expect(res2.agentId).toBe('agent-webchat')
  })

  it('scope completo [agency, department, workspace, agent] → retorna agent', async () => {
    const svc = makeSvc(makeDb([
      makeBinding('agent-agency',     'agency'),
      makeBinding('agent-department', 'department'),
      makeBinding('agent-workspace',  'workspace'),
      makeBinding('agent-agent',      'agent'),
    ]))
    const res = await svc.resolve(CHANNEL_ID, USER_ID)
    expect(res.agentId).toBe('agent-agent')
    expect(res.scopeLevel).toBe('agent')
  })

  it('scope completo, agency tiene isDefault=true, agent tiene isDefault=false → retorna agency (isDefault > scope)', async () => {
    const svc = makeSvc(makeDb([
      makeBinding('agent-agency',    'agency', true),   // isDefault
      makeBinding('agent-workspace', 'workspace', false),
      makeBinding('agent-agent',     'agent', false),
    ]))
    const res = await svc.resolve(CHANNEL_ID, USER_ID)
    expect(res.agentId).toBe('agent-agency')
    expect(res.isDefault).toBe(true)
  })
})
