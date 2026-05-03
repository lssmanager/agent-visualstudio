/**
 * discord.adapter.spec.ts — Tests F5-04
 *
 * Cubre:
 *   - PING handshake (type=1) → { type: 1 }
 *   - Slash commands (type=2) → emit IncomingMessage
 *   - Message component (type=3) → ignorado sin crash
 *   - send() → PATCH /webhooks/...
 *   - Audit hooks conectados
 */

import { DiscordAdapter } from '../discord.adapter.js'

// ── Mocks ───────────────────────────────────────────────────────────────

global.fetch = jest.fn()

jest.mock('../discord.adapter.audit.js', () => ({
  auditDiscordProvisioned:     jest.fn(),
  auditDiscordMessageInbound:  jest.fn(),
  auditDiscordMessageOutbound: jest.fn(),
  auditDiscordError:           jest.fn(),
}))

import {
  auditDiscordMessageInbound,
  auditDiscordMessageOutbound,
} from '../discord.adapter.audit.js'

// ── Helpers ─────────────────────────────────────────────────────────────

const makePrisma = (extra: Record<string, unknown> = {}) => ({
  channelConfig: {
    findUnique: jest.fn().mockResolvedValue({
      id:               'cc-test',
      secretsEncrypted: JSON.stringify({ publicKey: 'abc123' }),
      config:           { applicationId: 'app-1', agentId: 'ag-1', workspaceId: 'ws-1', guildId: 'guild-1', ...extra },
    }),
  },
})

const makeInteraction = (overrides: Record<string, unknown> = {}) => ({
  id:         'inter-1',
  type:       2,
  token:      'tok-abc',
  channel_id: 'ch-1',
  data:       { name: 'ask', options: [{ name: 'message', value: 'hola' }] },
  member:     { user: { id: 'user-1', username: 'alice' } },
  ...overrides,
})

async function buildAdapter() {
  const prisma  = makePrisma()
  const adapter = new DiscordAdapter(prisma)
  // Simular emit para capturar IncomingMessage
  const emitted: unknown[] = []
  ;(adapter as unknown as { emit: (m: unknown) => Promise<void> }).emit =
    jest.fn(async (m) => { emitted.push(m) })
  await adapter.initialize('cc-test')
  return { adapter, prisma, emitted }
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('DiscordAdapter', () => {

  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok:   true,
      text: jest.fn().mockResolvedValue(''),
    })
  })

  // ── PING handshake ────────────────────────────────────────────────────

  it('handleInteraction() con type=1 devuelve { type: 1 } (PONG)', async () => {
    const { adapter } = await buildAdapter()
    const result = await adapter.handleInteraction({ id: 'p-1', type: 1, token: '' })
    expect(result).toEqual({ type: 1 })
  })

  // ── MESSAGE_COMPONENT (type=3) ────────────────────────────────────────

  it('handleInteraction() con type=3 retorna null sin crash', async () => {
    const { adapter } = await buildAdapter()
    const result = await adapter.handleInteraction(makeInteraction({ type: 3 }) as never)
    expect(result).toBeNull()
  })

  // ── APPLICATION_COMMAND (type=2) ─────────────────────────────────────

  it('handleInteraction() con type=2 emite IncomingMessage al dispatcher', async () => {
    const { adapter, emitted } = await buildAdapter()
    await adapter.handleInteraction(makeInteraction())
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toMatchObject({
      channelType: 'discord',
      externalId:  'ch-1',
      senderId:    'user-1',
      text:        'hola',
      type:        'text',
    })
  })

  it('handleInteraction() sin channel_id → dropped (retorna null, no emite)', async () => {
    const { adapter, emitted } = await buildAdapter()
    const result = await adapter.handleInteraction(
      makeInteraction({ channel_id: undefined }) as never,
    )
    expect(result).toBeNull()
    expect(emitted).toHaveLength(0)
  })

  it('handleInteraction() extrae texto del option "message" si existe', async () => {
    const { adapter, emitted } = await buildAdapter()
    await adapter.handleInteraction(
      makeInteraction({ data: { name: 'ask', options: [{ name: 'message', value: 'test message' }] } }),
    )
    expect((emitted[0] as { text: string }).text).toBe('test message')
  })

  it('handleInteraction() fallback al nombre del comando si no hay option "message"', async () => {
    const { adapter, emitted } = await buildAdapter()
    await adapter.handleInteraction(
      makeInteraction({ data: { name: 'status', options: [] } }),
    )
    expect((emitted[0] as { text: string }).text).toBe('status')
  })

  // ── send() ────────────────────────────────────────────────────────────

  it('send() llama PATCH /webhooks/{appId}/{token}/messages/@original', async () => {
    const { adapter } = await buildAdapter()
    await adapter.handleInteraction(makeInteraction())
    await adapter.send({ text: 'respuesta', channelConfigId: 'cc-test', type: 'text' })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://discord.com/api/v10/webhooks/app-1/tok-abc/messages/@original',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('send() lanza error con res.status si HTTP falla (AUDIT-13)', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok:   false,
      status: 403,
      text: jest.fn().mockResolvedValue('Forbidden'),
    })
    const { adapter } = await buildAdapter()
    await adapter.handleInteraction(makeInteraction())
    await expect(
      adapter.send({ text: 'x', channelConfigId: 'cc-test', type: 'text' }),
    ).rejects.toThrow('HTTP 403')
  })

  it('send() lanza error si llamado antes de handleInteraction()', async () => {
    const { adapter } = await buildAdapter()
    // No llamar handleInteraction — interactionToken queda vacío
    await expect(
      adapter.send({ text: 'x', channelConfigId: 'cc-test', type: 'text' }),
    ).rejects.toThrow('send() called before handleInteraction()')
  })

  // ── Audit hooks ───────────────────────────────────────────────────────

  it('handleInteraction() tipo message llama auditDiscordMessageInbound()', async () => {
    const { adapter } = await buildAdapter()
    await adapter.handleInteraction(makeInteraction())
    expect(auditDiscordMessageInbound).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'inter-1' }),
    )
  })

  it('send() exitoso llama auditDiscordMessageOutbound()', async () => {
    const { adapter } = await buildAdapter()
    await adapter.handleInteraction(makeInteraction())
    await adapter.send({ text: 'ok', channelConfigId: 'cc-test', type: 'text' })
    expect(auditDiscordMessageOutbound).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'inter-1' }),
    )
  })

})
