/**
 * webhook.adapter.n8n.spec.ts — Tests del WebhookAdapter en modo n8n
 *
 * Cubre:
 *   - Normalización de payload n8n Webhook node (envoltura body/headers)
 *   - Normalización de payload n8n HTTP Request node (plano)
 *   - Extracción de task text (task > data string > data object > workflowName)
 *   - Extracción de externalId (sessionId > executionId > workflowId > fallback)
 *   - Verificación de firma HMAC-SHA256
 *   - Modo genérico no afectado por n8nMode
 *   - send() usa n8nCallbackField correcto
 *   - send() descarta cuando no hay callbackUrl
 */

import { createHmac }                from 'node:crypto'
import {
  isN8nWebhookNodePayload,
  extractN8nBody,
  n8nBodyToTaskText,
  n8nBodyToExternalId,
} from '../webhook.n8n-payload.js'
import { WebhookAdapter }            from '../webhook.adapter.js'
import type { IncomingMessage }      from '../channel-adapter.interface.js'

// ── Helpers de test ───────────────────────────────────────────────────────────

function makeAdapter() {
  const adapter = new WebhookAdapter()
  return adapter
}

function signPayload(payload: unknown, secret: string): string {
  const body = JSON.stringify(payload)
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

// Mock de PrismaService inyectado por loadConfig()
jest.mock('../../../prisma/prisma.service.js', () => ({
  PrismaService: jest.fn().mockImplementation(() => ({
    channelConfig: {
      findUnique: jest.fn().mockResolvedValue({
        id:     'cfg-test',
        config: { callbackUrl: 'https://n8n.example.com/cb', n8nMode: true },
      }),
    },
  })),
}))

// ── Unit tests: funciones puras de payload ────────────────────────────────────

describe('isN8nWebhookNodePayload()', () => {
  it('reconoce envoltura { body: {...} }', () => {
    expect(isN8nWebhookNodePayload({ body: { workflowId: 'wf-1' } })).toBe(true)
  })

  it('rechaza payload plano', () => {
    expect(isN8nWebhookNodePayload({ workflowId: 'wf-1' })).toBe(false)
  })

  it('rechaza null', () => {
    expect(isN8nWebhookNodePayload(null)).toBe(false)
  })
})

describe('n8nBodyToTaskText()', () => {
  it('prioriza body.task sobre body.data', () => {
    expect(n8nBodyToTaskText({ task: 'resume esto', data: { x: 1 } })).toBe('resume esto')
  })

  it('usa body.data como string si task no está', () => {
    expect(n8nBodyToTaskText({ data: 'analiza este ticket' })).toBe('analiza este ticket')
  })

  it('serializa body.data como JSON si es objeto', () => {
    const result = n8nBodyToTaskText({ data: { ticket: 'T-123', priority: 'high' } })
    expect(result).toBe('{"ticket":"T-123","priority":"high"}')
  })

  it('usa workflowName si no hay task ni data', () => {
    expect(n8nBodyToTaskText({ workflowName: 'Clasificador' })).toBe('Workflow trigger: Clasificador')
  })

  it('devuelve string vacío si no hay nada', () => {
    expect(n8nBodyToTaskText({})).toBe('')
  })
})

describe('n8nBodyToExternalId()', () => {
  it('prioriza sessionId', () => {
    expect(n8nBodyToExternalId(
      { sessionId: 's-1', executionId: 'e-1', workflowId: 'w-1' },
      'fallback',
    )).toBe('s-1')
  })

  it('usa executionId si no hay sessionId', () => {
    expect(n8nBodyToExternalId({ executionId: 'e-1', workflowId: 'w-1' }, 'fallback')).toBe('e-1')
  })

  it('usa workflowId si no hay sessionId ni executionId', () => {
    expect(n8nBodyToExternalId({ workflowId: 'w-1' }, 'fallback')).toBe('w-1')
  })

  it('usa fallback si no hay ninguno de los anteriores', () => {
    expect(n8nBodyToExternalId({}, 'cfg-test')).toBe('cfg-test')
  })
})

// ── Integration tests: WebhookAdapter ────────────────────────────────────────

describe('WebhookAdapter — modo n8n', () => {
  let adapter: WebhookAdapter
  let captured: IncomingMessage | null

  beforeEach(async () => {
    adapter  = makeAdapter()
    captured = null
    adapter.onMessage(async (msg) => { captured = msg })
    await adapter.initialize('cfg-test')
  })

  afterEach(async () => {
    await adapter.dispose()
  })

  it('normaliza payload de nodo Webhook de n8n (envoltura body)', async () => {
    const payload = {
      body: {
        task:       'Clasifica este ticket',
        workflowId: 'wf-123',
        executionId: 'exec-456',
        metadata:   { nodeId: 'n-1' },
      },
      headers: { 'content-type': 'application/json' },
    }

    await adapter.handleInbound(payload)

    expect(captured).not.toBeNull()
    expect(captured!.text).toBe('Clasifica este ticket')
    expect(captured!.externalId).toBe('exec-456')
    expect(captured!.metadata?.workflowId).toBe('wf-123')
    expect(captured!.metadata?.n8nPayloadShape).toBe('webhook-node')
    expect(captured!.channelType).toBe('webhook')
  })

  it('normaliza payload plano del nodo HTTP Request de n8n', async () => {
    const payload = {
      workflowId:   'wf-999',
      executionId:  'exec-777',
      data:         { text: 'Resumir urgente', priority: 'critical' },
    }

    await adapter.handleInbound(payload)

    expect(captured).not.toBeNull()
    expect(captured!.text).toBe('{"text":"Resumir urgente","priority":"critical"}')
    expect(captured!.externalId).toBe('exec-777')
    expect(captured!.metadata?.n8nPayloadShape).toBe('http-request')
  })

  it('usa body.task con precedencia sobre body.data', async () => {
    const payload = {
      body: {
        task:       'tarea explícita',
        data:       { field: 'este no debe usarse' },
        workflowId: 'wf-1',
        executionId: 'e-1',
      },
    }

    await adapter.handleInbound(payload)

    expect(captured!.text).toBe('tarea explícita')
  })

  it('prioriza sessionId para el externalId', async () => {
    const payload = {
      body: {
        sessionId:   'sess-abc',
        executionId: 'exec-xyz',
        workflowId:  'wf-xyz',
        task:        'una tarea',
      },
    }

    await adapter.handleInbound(payload)

    expect(captured!.externalId).toBe('sess-abc')
  })

  it('descarta mensaje si el payload no es un objeto', async () => {
    await adapter.handleInbound('string-invalido')
    expect(captured).toBeNull()
  })
})

describe('WebhookAdapter — verificación de firma n8n', () => {
  let adapter: WebhookAdapter
  let captured: IncomingMessage | null

  beforeEach(async () => {
    const { PrismaService } = await import('../../../prisma/prisma.service.js')
    ;(PrismaService as jest.Mock).mockImplementationOnce(() => ({
      channelConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id:     'cfg-sig',
          config: {
            callbackUrl:        'https://n8n.example.com/cb',
            n8nMode:            true,
            n8nSignatureSecret: 'mi-secreto-hmac',
          },
        }),
      },
    }))

    adapter  = makeAdapter()
    captured = null
    adapter.onMessage(async (msg) => { captured = msg })
    await adapter.initialize('cfg-sig')
  })

  afterEach(async () => { await adapter.dispose() })

  it('acepta payload con firma HMAC válida', async () => {
    const payload = { body: { task: 'tarea segura', executionId: 'e-1' } }
    const sig     = signPayload(payload, 'mi-secreto-hmac')

    await adapter.handleInbound(payload, { 'x-n8n-signature': sig })

    expect(captured).not.toBeNull()
  })

  it('descarta payload con firma inválida', async () => {
    const payload = { body: { task: 'tarea comprometida', executionId: 'e-2' } }

    await adapter.handleInbound(payload, { 'x-n8n-signature': 'sha256=firmaFalsa' })

    expect(captured).toBeNull()
  })

  it('descarta payload sin header de firma cuando hay secreto', async () => {
    const payload = { body: { task: 'sin firma', executionId: 'e-3' } }

    await adapter.handleInbound(payload, {})

    expect(captured).toBeNull()
  })
})

describe('WebhookAdapter — send() con n8nCallbackField', () => {
  let fetchMock: jest.SpyInstance

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
  })

  afterEach(() => fetchMock.mockRestore())

  it('usa "text" como campo por defecto en la respuesta', async () => {
    const { PrismaService } = await import('../../../prisma/prisma.service.js')
    ;(PrismaService as jest.Mock).mockImplementationOnce(() => ({
      channelConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id:     'cfg-send',
          config: { callbackUrl: 'https://cb.example.com/ok', n8nMode: true },
        }),
      },
    }))

    const adapter = makeAdapter()
    await adapter.initialize('cfg-send')
    await adapter.send({ externalId: 'sess-1', text: 'respuesta del agente' })

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.text).toBe('respuesta del agente')
    expect(body.externalId).toBe('sess-1')
    expect(body.ts).toBeDefined()
  })

  it('usa n8nCallbackField personalizado cuando está configurado', async () => {
    const { PrismaService } = await import('../../../prisma/prisma.service.js')
    ;(PrismaService as jest.Mock).mockImplementationOnce(() => ({
      channelConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id:     'cfg-field',
          config: {
            callbackUrl:      'https://cb.example.com/ok',
            n8nMode:          true,
            n8nCallbackField: 'output',
          },
        }),
      },
    }))

    const adapter = makeAdapter()
    await adapter.initialize('cfg-field')
    await adapter.send({ externalId: 'sess-2', text: 'resultado' })

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.output).toBe('resultado')
    expect(body.text).toBeUndefined()
  })
})

describe('WebhookAdapter — modo genérico (retrocompatibilidad)', () => {
  let adapter: WebhookAdapter
  let captured: IncomingMessage | null

  beforeEach(async () => {
    const { PrismaService } = await import('../../../prisma/prisma.service.js')
    ;(PrismaService as jest.Mock).mockImplementationOnce(() => ({
      channelConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id:     'cfg-generic',
          config: { callbackUrl: 'https://cb.example.com', n8nMode: false },
        }),
      },
    }))

    adapter  = makeAdapter()
    captured = null
    adapter.onMessage(async (msg) => { captured = msg })
    await adapter.initialize('cfg-generic')
  })

  afterEach(async () => { await adapter.dispose() })

  it('procesa payload genérico sin n8nMode sin cambios', async () => {
    await adapter.handleInbound({
      externalId: 'user-123',
      senderId:   'user-123',
      text:       'hola desde webhook genérico',
    })

    expect(captured).not.toBeNull()
    expect(captured!.text).toBe('hola desde webhook genérico')
    expect(captured!.externalId).toBe('user-123')
  })

  it('no interpreta payload de n8n en modo genérico', async () => {
    await adapter.handleInbound({
      body:    { task: 'esto no es n8n aquí' },
      headers: {},
    })

    expect(captured).not.toBeNull()
    expect(captured!.text).toBe('')
  })
})
