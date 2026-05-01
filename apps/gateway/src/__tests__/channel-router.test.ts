/**
 * channel-router.test.ts — [F3a-08]
 *
 * Tests unitarios del ChannelRouter con vitest.
 * Usa una AdapterFactory mock — sin adapters reales.
 * 15 casos cubriendo ciclo de vida, inspección y eventos.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChannelRouter }   from '../channel-router.service.js'
import type {
  ChannelConfigRow,
  ChannelActivatedEvent,
  ChannelDeactivatedEvent,
} from '../channel-router.types.js'
import type { IChannelAdapter, IncomingMessage } from '../channels/channel-adapter.interface.js'

// ── Mock factory ────────────────────────────────────────────────────────────

function makeMockAdapter(channel: string): IChannelAdapter {
  return {
    channel,
    initialize: vi.fn().mockResolvedValue(undefined),
    onMessage:  vi.fn(),
    send:       vi.fn().mockResolvedValue(undefined),
    dispose:    vi.fn().mockResolvedValue(undefined),
  }
}

const KNOWN_CHANNELS = ['webchat', 'telegram', 'discord', 'slack', 'webhook', 'whatsapp']

function mockFactory(channel: string): IChannelAdapter | null {
  if (KNOWN_CHANNELS.includes(channel)) return makeMockAdapter(channel)
  return null
}

const BASE_CFG: ChannelConfigRow = {
  id:               'cfg-001',
  channel:          'webchat',
  active:           true,
  secretsEncrypted: null,
}

const noopHandler = async (_msg: IncomingMessage) => { /* noop */ }

// ── Suite ─────────────────────────────────────────────────────────────────

describe('ChannelRouter', () => {

  let router: ChannelRouter

  beforeEach(() => {
    router = new ChannelRouter(mockFactory)
  })

  // ── activate() ─────────────────────────────────────────────────────────

  it('activa un canal válido y lo registra en el router', async () => {
    await router.activate(BASE_CFG, noopHandler)
    expect(router.isActive('cfg-001')).toBe(true)
    expect(router.size).toBe(1)
  })

  it('llama initialize() del adapter con el channelConfigId correcto', async () => {
    let capturedId: string | undefined
    const adapter: IChannelAdapter = {
      channel:    'webchat',
      initialize: vi.fn().mockImplementation(async (id: string) => { capturedId = id }),
      onMessage:  vi.fn(),
      send:       vi.fn(),
      dispose:    vi.fn(),
    }
    const router2 = new ChannelRouter(() => adapter)
    await router2.activate(BASE_CFG, noopHandler)
    expect(capturedId).toBe('cfg-001')
  })

  it('conecta el messageHandler vía onMessage()', async () => {
    let registeredHandler: ((msg: IncomingMessage) => Promise<void>) | undefined
    const adapter: IChannelAdapter = {
      channel:    'webchat',
      initialize: vi.fn().mockResolvedValue(undefined),
      onMessage:  vi.fn().mockImplementation((h) => { registeredHandler = h }),
      send:       vi.fn(),
      dispose:    vi.fn(),
    }
    const router2 = new ChannelRouter(() => adapter)
    await router2.activate(BASE_CFG, noopHandler)
    expect(registeredHandler).toBe(noopHandler)
  })

  it('es idempotente: activar dos veces el mismo canal no duplica la entrada', async () => {
    await router.activate(BASE_CFG, noopHandler)
    await router.activate(BASE_CFG, noopHandler)
    expect(router.size).toBe(1)
  })

  it('lanza Error para channel type desconocido', async () => {
    const unknownCfg: ChannelConfigRow = { ...BASE_CFG, channel: 'unknown-channel' }
    await expect(router.activate(unknownCfg, noopHandler)).rejects.toThrow(
      /unknown channel type/,
    )
  })

  // ── deactivate() ────────────────────────────────────────────────────────

  it('desactiva un canal activo y lo elimina del registry', async () => {
    await router.activate(BASE_CFG, noopHandler)
    await router.deactivate('cfg-001')
    expect(router.isActive('cfg-001')).toBe(false)
    expect(router.size).toBe(0)
  })

  it('llama dispose() del adapter al desactivar', async () => {
    const disposeFn = vi.fn().mockResolvedValue(undefined)
    const adapter: IChannelAdapter = {
      channel:    'webchat',
      initialize: vi.fn().mockResolvedValue(undefined),
      onMessage:  vi.fn(),
      send:       vi.fn(),
      dispose:    disposeFn,
    }
    const router2 = new ChannelRouter(() => adapter)
    await router2.activate(BASE_CFG, noopHandler)
    await router2.deactivate('cfg-001')
    expect(disposeFn).toHaveBeenCalledOnce()
  })

  it('deactivate en canal no activo es no-op (sin error)', async () => {
    await expect(router.deactivate('no-existe')).resolves.toBeUndefined()
  })

  // ── shutdownAll() ───────────────────────────────────────────────────────

  it('shutdownAll desactiva todos los canales activos', async () => {
    const cfg2: ChannelConfigRow = { ...BASE_CFG, id: 'cfg-002', channel: 'telegram' }
    await router.activate(BASE_CFG, noopHandler)
    await router.activate(cfg2, noopHandler)
    expect(router.size).toBe(2)

    await router.shutdownAll()
    expect(router.size).toBe(0)
  })

  // ── Inspección ──────────────────────────────────────────────────────────

  it('getAdapter retorna el adapter correcto para un canal activo', async () => {
    await router.activate(BASE_CFG, noopHandler)
    const adapter = router.getAdapter('cfg-001')
    expect(adapter).toBeDefined()
    expect(adapter?.channel).toBe('webchat')
  })

  it('getAdapter retorna undefined para canal no activo', () => {
    expect(router.getAdapter('no-existe')).toBeUndefined()
  })

  it('getActiveChannels retorna todas las entradas activas', async () => {
    const cfg2: ChannelConfigRow = { ...BASE_CFG, id: 'cfg-002', channel: 'telegram' }
    await router.activate(BASE_CFG, noopHandler)
    await router.activate(cfg2, noopHandler)

    const entries = router.getActiveChannels()
    expect(entries).toHaveLength(2)
    const ids = entries.map((e) => e.channelConfigId)
    expect(ids).toContain('cfg-001')
    expect(ids).toContain('cfg-002')
  })

  // ── Eventos ─────────────────────────────────────────────────────────────────

  it('emite channel:activated con payload correcto', async () => {
    const events: ChannelActivatedEvent[] = []
    router.on('channel:activated', (e) => events.push(e))

    await router.activate(BASE_CFG, noopHandler)

    expect(events).toHaveLength(1)
    expect(events[0]!.channelConfigId).toBe('cfg-001')
    expect(events[0]!.channel).toBe('webchat')
    expect(events[0]!.activatedAt).toBeInstanceOf(Date)
  })

  it('emite channel:deactivated con reason=manual por defecto', async () => {
    const events: ChannelDeactivatedEvent[] = []
    router.on('channel:deactivated', (e) => events.push(e))

    await router.activate(BASE_CFG, noopHandler)
    await router.deactivate('cfg-001')

    expect(events).toHaveLength(1)
    expect(events[0]!.reason).toBe('manual')
    expect(events[0]!.channelConfigId).toBe('cfg-001')
  })

  it('emite channel:deactivated con reason=shutdown en shutdownAll', async () => {
    const events: ChannelDeactivatedEvent[] = []
    router.on('channel:deactivated', (e) => events.push(e))

    await router.activate(BASE_CFG, noopHandler)
    await router.shutdownAll()

    expect(events[0]!.reason).toBe('shutdown')
  })

})
