/**
 * slack.adapter.spec.ts
 * [F5-03] Tests para SlackAdapter: firma HMAC, challenge, mensajes, send()
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { createHmac } from 'node:crypto'

// ── Mock global fetch ────────────────────────────────────────────────

const mockFetch = jest.fn<() => Promise<Response>>()
global.fetch = mockFetch as unknown as typeof fetch

// ── Mock de PrismaService ─────────────────────────────────────────────

const BOT_TOKEN    = 'xoxb-test-token'
const SIGNING_SECRET = 'test-signing-secret-32chars-long!'

const prismaMock = {
  channelConfig: {
    findUnique: jest.fn().mockResolvedValue({
      id:               'cc-slack-1',
      secretsEncrypted: JSON.stringify({ botToken: BOT_TOKEN, signingSecret: SIGNING_SECRET }),
    }),
  },
}

// ── Import del adapter bajo test ───────────────────────────────────────

const { SlackAdapter } = await import('../slack.adapter.js')

// ── Helper: construir firma Slack válida ────────────────────────────────

function makeSlackSignature(rawBody: string, timestamp: string, secret = SIGNING_SECRET): string {
  const base = `v0:${timestamp}:${rawBody}`
  const hmac = createHmac('sha256', secret).update(base).digest('hex')
  return `v0=${hmac}`
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('SlackAdapter', () => {
  let adapter: InstanceType<typeof SlackAdapter>
  const CHANNEL_ID = 'cc-slack-1'

  beforeEach(async () => {
    jest.clearAllMocks()
    adapter = new SlackAdapter(prismaMock as never)
    await adapter.initialize(CHANNEL_ID)
  })

  // ───────────────────────────────────────────────────────────────────
  // Bloque 1 — Verificación de firma HMAC
  // ───────────────────────────────────────────────────────────────────

  describe('verifySlackSignature()', () => {
    it('devuelve true con firma válida y timestamp reciente', () => {
      const rawBody  = '{"type":"event_callback"}'
      const timestamp = String(Math.floor(Date.now() / 1000))
      const signature = makeSlackSignature(rawBody, timestamp)

      expect(adapter.verifySlackSignature(SIGNING_SECRET, rawBody, timestamp, signature)).toBe(true)
    })

    it('devuelve false con timestamp viejo >5 min (anti-replay)', () => {
      const rawBody   = '{"type":"event_callback"}'
      const oldTs     = String(Math.floor(Date.now() / 1000) - 400)  // 6+ min ago
      const signature = makeSlackSignature(rawBody, oldTs)

      expect(adapter.verifySlackSignature(SIGNING_SECRET, rawBody, oldTs, signature)).toBe(false)
    })

    it('devuelve false con firma manipulada', () => {
      const rawBody   = '{"type":"event_callback"}'
      const timestamp = String(Math.floor(Date.now() / 1000))
      const badSig    = 'v0=0000000000000000000000000000000000000000000000000000000000000000'

      expect(adapter.verifySlackSignature(SIGNING_SECRET, rawBody, timestamp, badSig)).toBe(false)
    })
  })

  // ───────────────────────────────────────────────────────────────────
  // Bloque 2 — url_verification challenge
  // ───────────────────────────────────────────────────────────────────

  describe('receive() — url_verification', () => {
    it('devuelve { challenge } para type=url_verification', async () => {
      const rawBody  = '{"type":"url_verification","challenge":"abc123"}'
      const timestamp = String(Math.floor(Date.now() / 1000))
      const signature = makeSlackSignature(rawBody, timestamp)

      const result = await adapter.receive(
        { type: 'url_verification', challenge: 'abc123' },
        { rawBody, timestamp, signature },
      )

      expect(result).toEqual({ challenge: 'abc123' })
    })
  })

  // ───────────────────────────────────────────────────────────────────
  // Bloque 3 — Mensajes normales
  // ───────────────────────────────────────────────────────────────────

  describe('receive() — event_callback', () => {
    const makeEventPayload = (event: Record<string, unknown>) => ({
      type:    'event_callback',
      event,
    })

    const makeSecrets = (payload: unknown) => {
      const rawBody  = JSON.stringify(payload)
      const timestamp = String(Math.floor(Date.now() / 1000))
      return { rawBody, timestamp, signature: makeSlackSignature(rawBody, timestamp) }
    }

    it('devuelve IncomingMessage para message con user y channel', async () => {
      const payload = makeEventPayload({ type: 'message', user: 'U123', channel: 'C456', text: 'hola' })
      const result  = await adapter.receive(payload, makeSecrets(payload))

      expect(result).toMatchObject({
        channelType: 'slack',
        externalId:  'C456',
        senderId:    'U123',
        text:        'hola',
        type:        'text',
      })
    })

    it('devuelve null para mensajes sin user (bots)', async () => {
      const payload = makeEventPayload({ type: 'message', channel: 'C456', text: 'bot msg' })
      const result  = await adapter.receive(payload, makeSecrets(payload))

      expect(result).toBeNull()
    })

    it('devuelve null para mensajes sin channel', async () => {
      const payload = makeEventPayload({ type: 'message', user: 'U123', text: 'no channel' })
      const result  = await adapter.receive(payload, makeSecrets(payload))

      expect(result).toBeNull()
    })
  })

  // ───────────────────────────────────────────────────────────────────
  // Bloque 4 — send() con doble verificación AUDIT-13
  // ───────────────────────────────────────────────────────────────────

  describe('send()', () => {
    const makeMsg = () => ({
      channelConfigId: CHANNEL_ID,
      channelType:     'slack' as const,
      externalId:      'C789',
      senderId:        'bot',
      text:            'respuesta de prueba',
      type:            'text' as const,
      receivedAt:      new Date().toISOString(),
    })

    it('llama chat.postMessage con Authorization Bearer y entrega exitosa', async () => {
      mockFetch.mockResolvedValueOnce({
        ok:   true,
        status: 200,
        json: async () => ({ ok: true, ts: '1234567890.000001' }),
      } as unknown as Response)

      await expect(adapter.send(makeMsg())).resolves.toBeUndefined()

      const callArgs = (mockFetch.mock.calls[0] as unknown[]) as [string, RequestInit]
      expect(callArgs[0]).toBe('https://slack.com/api/chat.postMessage')
      expect((callArgs[1]?.headers as Record<string, string>)?.['Authorization'])
        .toBe(`Bearer ${BOT_TOKEN}`)
    })

    it('lanza error si data.ok === false (AUDIT-13 — Slack error en body)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok:   true,
        status: 200,
        json: async () => ({ ok: false, error: 'channel_not_found' }),
      } as unknown as Response)

      await expect(adapter.send(makeMsg())).rejects.toThrow('channel_not_found')
    })

    it('lanza error si res.ok === false (HTTP error)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok:     false,
        status: 429,
        json:   async () => ({ ok: false, error: 'ratelimited' }),
      } as unknown as Response)

      await expect(adapter.send(makeMsg())).rejects.toThrow('HTTP 429')
    })
  })
})
