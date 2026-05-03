/**
 * n8n-webhook.adapter.test.ts — [F4a-03]
 *
 * Tests unitarios para N8nWebhookAdapter.
 *
 * Cubre:
 *   - normalizePayload: body.data vs body directo
 *   - verifySignature: HMAC válido, inválido, header ausente
 *   - send(): modo síncrono (resuelve pendingSync), asíncrono (POST a callbackUrl)
 *   - deliverWithRetry: reintentos con backoff
 *   - dispose(): limpia pendingSync
 */

import { createHmac } from 'node:crypto'
import { N8nWebhookAdapter, N8nWebhookError } from '../n8n-webhook.adapter.js'
import type { OutgoingMessage } from '../channel-adapter.interface.js'

// ── Mock PrismaService ────────────────────────────────────────────────────────

const mockChannelConfig = {
  id:               'cfg-test-001',
  channelType:      'webhook',
  config:           { callbackUrl: 'https://n8n.example.com/webhook/abc', webhookSecret: '' },
  secretsEncrypted: null,
}

jest.mock('../../../prisma/prisma.service.js', () => ({
  PrismaService: jest.fn().mockImplementation(() => ({
    channelConfig: {
      findUnique: jest.fn().mockResolvedValue(mockChannelConfig),
    },
  })),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdapter() {
  return new N8nWebhookAdapter()
}

function makeOutgoing(overrides: Partial<OutgoingMessage> = {}): OutgoingMessage {
  return {
    externalId: 'ext-001',
    text:       'Respuesta del agente',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('N8nWebhookAdapter', () => {

  describe('initialize()', () => {
    it('carga callbackUrl y webhookSecret desde config', async () => {
      const adapter = makeAdapter()
      await adapter.initialize('cfg-test-001')
      // El adapter carga la config sin lanzar errores
      expect(adapter).toBeDefined()
    })

    it('lanza N8nWebhookError CONFIG_NOT_FOUND si el channelConfig no existe', async () => {
      const { PrismaService } = await import('../../../prisma/prisma.service.js')
      ;(PrismaService as jest.Mock).mockImplementationOnce(() => ({
        channelConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      }))
      const adapter = makeAdapter()
      await expect(adapter.initialize('no-existe')).rejects.toThrow(
        expect.objectContaining({ code: 'CONFIG_NOT_FOUND' }),
      )
    })
  })

  describe('normalizePayload (vía handleTrigger)', () => {
    it('extrae texto desde body.data.text', async () => {
      const adapter = makeAdapter()
      await adapter.initialize('cfg-test-001')

      let captured: Parameters<Parameters<typeof adapter.onMessage>[0]>[0] | null = null
      adapter.onMessage(async (msg) => { captured = msg })

      // Simular handleTrigger invocando el adapter directamente
      // (testeamos a través del router en integración; aquí usamos emit como proxy)
      const payload = { data: { text: 'Hola desde n8n', senderId: 'workflow-42', sessionId: 'sess-1' } }
      // Acceso a método privado via cast para unit test
      const normalized = (adapter as unknown as {
        normalizePayload: (b: unknown) => unknown
      }).normalizePayload(payload)

      expect(normalized).toMatchObject({
        text:       'Hola desde n8n',
        senderId:   'workflow-42',
        externalId: 'sess-1',
        channelType: 'webhook',
      })
    })

    it('extrae texto desde body directo (sin body.data)', async () => {
      const adapter = makeAdapter()
      await adapter.initialize('cfg-test-001')

      const payload = { text: 'Texto directo', senderId: 'user-1' }
      const normalized = (adapter as unknown as {
        normalizePayload: (b: unknown) => unknown
      }).normalizePayload(payload)

      expect(normalized).toMatchObject({ text: 'Texto directo' })
    })

    it('lanza MISSING_TEXT si no hay texto en el payload', async () => {
      const adapter = makeAdapter()
      await adapter.initialize('cfg-test-001')

      expect(() => {
        ;(adapter as unknown as {
          normalizePayload: (b: unknown) => unknown
        }).normalizePayload({ data: { senderId: 'x' } })
      }).toThrow(expect.objectContaining({ code: 'MISSING_TEXT' }))
    })

    it('usa channelConfigId como externalId fallback cuando no hay sessionId/externalId', async () => {
      const adapter = makeAdapter()
      await adapter.initialize('cfg-test-001')

      const normalized = (adapter as unknown as {
        normalizePayload: (b: unknown) => unknown
      }).normalizePayload({ text: 'Hola' }) as { externalId: string }

      expect(normalized.externalId).toBe('cfg-test-001')
    })
  })

  describe('verifySignature()', () => {
    const secret = 'test-secret-32-bytes-long-enough'
    const bodyJson = JSON.stringify({ data: { text: 'test' } })
    const bodyBuffer = Buffer.from(bodyJson, 'utf8')
    const validHex = createHmac('sha256', secret).update(bodyBuffer).digest('hex')

    it('no lanza si la firma HMAC es válida', async () => {
      const adapter = makeAdapter()
      ;(adapter as unknown as { webhookSecret: string }).webhookSecret = secret

      const req = {
        headers:  { 'x-n8n-signature': `sha256=${validHex}` },
        rawBody:  bodyBuffer,
        body:     JSON.parse(bodyJson),
      }

      expect(() => {
        ;(adapter as unknown as { verifySignature: (r: unknown) => void }).verifySignature(req)
      }).not.toThrow()
    })

    it('lanza INVALID_SIGNATURE si el header está ausente', async () => {
      const adapter = makeAdapter()
      ;(adapter as unknown as { webhookSecret: string }).webhookSecret = secret

      const req = { headers: {}, rawBody: bodyBuffer, body: {} }
      expect(() => {
        ;(adapter as unknown as { verifySignature: (r: unknown) => void }).verifySignature(req)
      }).toThrow(expect.objectContaining({ code: 'INVALID_SIGNATURE' }))
    })

    it('lanza INVALID_SIGNATURE si la firma es incorrecta', async () => {
      const adapter = makeAdapter()
      ;(adapter as unknown as { webhookSecret: string }).webhookSecret = secret

      const req = {
        headers:  { 'x-n8n-signature': 'sha256=badhex' },
        rawBody:  bodyBuffer,
        body:     {},
      }
      expect(() => {
        ;(adapter as unknown as { verifySignature: (r: unknown) => void }).verifySignature(req)
      }).toThrow(expect.objectContaining({ code: 'INVALID_SIGNATURE' }))
    })
  })

  describe('send() — modo síncrono', () => {
    it('resuelve la pendingSync Promise con el OutgoingMessage', async () => {
      const adapter = makeAdapter()
      await adapter.initialize('cfg-test-001')
      ;(adapter as unknown as { callbackUrl: string }).callbackUrl = 'sync'

      const outgoing = makeOutgoing({ externalId: 'sync-ext-1', text: 'Respuesta sync' })

      // Registrar una entrada en pendingSync simulando handleTrigger
      let resolved: OutgoingMessage | null = null
      const promise = new Promise<OutgoingMessage>((res) => {
        ;(adapter as unknown as { pendingSync: Map<string, (m: OutgoingMessage) => void> })
          .pendingSync.set('sync-ext-1', (m) => { resolved = m; res(m) })
      })

      await adapter.send(outgoing)
      const result = await promise

      expect(result.text).toBe('Respuesta sync')
      expect(resolved).not.toBeNull()
      // pendingSync debe quedar limpio
      expect(
        (adapter as unknown as { pendingSync: Map<string, unknown> }).pendingSync.size
      ).toBe(0)
    })
  })

  describe('send() — modo asíncrono', () => {
    beforeEach(() => jest.clearAllMocks())

    it('hace POST al callbackUrl con N8nCallbackPayload', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true })
      global.fetch = fetchMock as unknown as typeof fetch

      const adapter = makeAdapter()
      await adapter.initialize('cfg-test-001')
      ;(adapter as unknown as { callbackUrl: string }).callbackUrl = 'https://n8n.example.com/callback'

      await adapter.send(makeOutgoing({ externalId: 'async-ext-1', text: 'Hola async' }))

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const callArgs = fetchMock.mock.calls[0] as [string, { body: string }]
      const body = JSON.parse(callArgs[1].body) as { text: string; externalId: string }
      expect(body.text).toBe('Hola async')
      expect(body.externalId).toBe('async-ext-1')
    })

    it('lanza CALLBACK_DELIVERY_FAILED tras agotar reintentos', async () => {
      const fetchMock = jest.fn().mockRejectedValue(new Error('network error'))
      global.fetch = fetchMock as unknown as typeof fetch

      const adapter = makeAdapter()
      await adapter.initialize('cfg-test-001')
      ;(adapter as unknown as { callbackUrl: string }).callbackUrl = 'https://n8n.example.com/bad'
      // Reducir delays para que el test no tarde 7 segundos
      ;(adapter as unknown as { sleep: (ms: number) => Promise<void> }).sleep = () => Promise.resolve()

      await expect(adapter.send(makeOutgoing())).rejects.toThrow(
        expect.objectContaining({ code: 'CALLBACK_DELIVERY_FAILED' }),
      )
      // 1 intento inicial + 3 reintentos = 4 llamadas
      expect(fetchMock).toHaveBeenCalledTimes(4)
    })
  })

  describe('dispose()', () => {
    it('resuelve todas las pendingSync pendientes y limpia el map', async () => {
      const adapter = makeAdapter()
      await adapter.initialize('cfg-test-001')

      let resolved = false
      ;(adapter as unknown as { pendingSync: Map<string, (m: OutgoingMessage) => void> })
        .pendingSync.set('ext-1', () => { resolved = true })

      await adapter.dispose()

      expect(resolved).toBe(true)
      expect(
        (adapter as unknown as { pendingSync: Map<string, unknown> }).pendingSync.size
      ).toBe(0)
    })
  })

  describe('getRouter()', () => {
    it('devuelve un Router de Express con rutas GET y POST', () => {
      const adapter = makeAdapter()
      const router = adapter.getRouter()
      // El router es una función de Express (tiene .stack)
      expect(typeof router).toBe('function')
      expect((router as unknown as { stack: unknown[] }).stack.length).toBeGreaterThanOrEqual(2)
    })
  })
})
