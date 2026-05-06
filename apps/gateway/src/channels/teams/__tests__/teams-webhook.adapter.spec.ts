/**
 * teams-webhook.adapter.spec.ts — [F3a-33]
 *
 * 20 tests unitarios.
 * Sin red real — fetch mockeado completamente via jest.spyOn(global, 'fetch').
 *
 * Suites:
 *   - constructor validation
 *   - sendText: POST shape, truncation, error response
 *   - notify: all severities, FactSet, actions, no-title, no-actions
 *   - retry logic: 429 retry success, max retries exhausted, no retry on 400
 *   - verify: ok / error
 *   - sendTeamsNotification helper: ok / invalid URL
 */

import {
  TeamsWebhookAdapter,
  sendTeamsNotification,
  type TeamsNotification,
} from '../teams-webhook.adapter'

const FAKE_WEBHOOK = 'https://company.webhook.office.com/webhookb2/fake-id'

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockFetch(status: number, body = '1') {
  return jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(body, {
      status,
      headers: { 'Content-Type': 'text/plain' },
    }),
  )
}

function getParsedBody(spy: jest.SpyInstance, callIndex = 0): {
  type:        string
  attachments: Array<{ contentType: string; content: Record<string, unknown> }>
} {
  const init = spy.mock.calls[callIndex]![1] as RequestInit
  return JSON.parse(init.body as string)
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('TeamsWebhookAdapter — constructor', () => {
  it('lanza error si webhookUrl no es HTTPS', () => {
    expect(() =>
      new TeamsWebhookAdapter({ webhookUrl: 'http://insecure.com' }),
    ).toThrow('HTTPS')
  })

  it('lanza error si webhookUrl está vacía', () => {
    expect(() =>
      new TeamsWebhookAdapter({ webhookUrl: '' }),
    ).toThrow('HTTPS')
  })

  it('acepta URL HTTPS válida sin lanzar error', () => {
    expect(() =>
      new TeamsWebhookAdapter({ webhookUrl: FAKE_WEBHOOK }),
    ).not.toThrow()
  })
})

// ── sendText ──────────────────────────────────────────────────────────────────

describe('TeamsWebhookAdapter — sendText', () => {
  afterEach(() => jest.restoreAllMocks())

  it('hace POST a webhookUrl con Adaptive Card de texto', async () => {
    const spy     = mockFetch(200)
    const adapter = new TeamsWebhookAdapter({ webhookUrl: FAKE_WEBHOOK })

    const result = await adapter.sendText('Hola Teams')

    expect(result.ok).toBe(true)
    expect(spy).toHaveBeenCalledWith(
      FAKE_WEBHOOK,
      expect.objectContaining({ method: 'POST' }),
    )

    const parsed = getParsedBody(spy)
    expect(parsed.type).toBe('message')
    expect(parsed.attachments).toHaveLength(1)
    expect(parsed.attachments[0]!.contentType).toBe(
      'application/vnd.microsoft.card.adaptive',
    )
    const cardBody = (parsed.attachments[0]!.content as Record<string, unknown>).body as Array<Record<string, unknown>>
    expect(cardBody[0]!.text).toBe('Hola Teams')
  })

  it('trunca texto mayor a 28.000 caracteres', async () => {
    const spy      = mockFetch(200)
    const adapter  = new TeamsWebhookAdapter({ webhookUrl: FAKE_WEBHOOK })
    const longText = 'a'.repeat(30_000)

    await adapter.sendText(longText)

    const parsed   = getParsedBody(spy)
    const cardBody = (parsed.attachments[0]!.content as Record<string, unknown>).body as Array<Record<string, unknown>>
    const cardText = cardBody[0]!.text as string
    expect(cardText.length).toBeLessThanOrEqual(28_200)
    expect(cardText).toContain('[truncado]')
  })

  it('devuelve ok: false si Teams responde 500', async () => {
    mockFetch(500, 'Internal Server Error')
    const adapter = new TeamsWebhookAdapter({ webhookUrl: FAKE_WEBHOOK })

    const result = await adapter.sendText('test')
    expect(result.ok).toBe(false)
    expect(result.statusCode).toBe(500)
    expect(result.error).toContain('500')
  })

  it('devuelve ok: true con statusCode en respuesta exitosa', async () => {
    mockFetch(200)
    const adapter = new TeamsWebhookAdapter({ webhookUrl: FAKE_WEBHOOK })

    const result = await adapter.sendText('ok test')
    expect(result.ok).toBe(true)
    expect(result.statusCode).toBe(200)
    expect(result.retriedCount).toBe(0)
  })
})

// ── notify ────────────────────────────────────────────────────────────────────

describe('TeamsWebhookAdapter — notify', () => {
  afterEach(() => jest.restoreAllMocks())

  it('envía Adaptive Card con título, body, FactSet y Action.OpenUrl', async () => {
    const spy = mockFetch(200)
    const adapter = new TeamsWebhookAdapter({ webhookUrl: FAKE_WEBHOOK })

    await adapter.notify({
      title:    'Deploy completado',
      body:     'Versión **v2.4.1** desplegada',
      severity: 'success',
      facts:    [{ name: 'Duración', value: '45s' }],
      actions:  [{ label: 'Ver logs', url: 'https://logs.example.com' }],
    })

    const parsed  = getParsedBody(spy)
    const content = parsed.attachments[0]!.content as Record<string, unknown>
    const cardBody = content.body as Array<Record<string, unknown>>

    expect(content.type).toBe('AdaptiveCard')

    const titleBlock = cardBody.find((b) => b['weight'] === 'Bolder')
    expect(titleBlock?.['text']).toContain('Deploy completado')
    expect(titleBlock?.['text']).toContain('✅')

    const factSet = cardBody.find((b) => b['type'] === 'FactSet') as Record<string, unknown>
    const facts   = factSet?.['facts'] as Array<Record<string, string>>
    expect(facts[0]).toEqual({ title: 'Duración', value: '45s' })

    const actions = content.actions as Array<Record<string, unknown>>
    expect(actions).toHaveLength(1)
    expect(actions[0]!['type']).toBe('Action.OpenUrl')
    expect(actions[0]!['url']).toBe('https://logs.example.com')
  })

  it('severity error → emoji 🔴 y color Attention', async () => {
    const spy = mockFetch(200)
    const adapter = new TeamsWebhookAdapter({ webhookUrl: FAKE_WEBHOOK })

    await adapter.notify({ body: 'Fallo crítico', severity: 'error', title: 'Error' })

    const parsed   = getParsedBody(spy)
    const content  = parsed.attachments[0]!.content as Record<string, unknown>
    const cardBody = content.body as Array<Record<string, unknown>>
    const title    = cardBody.find((b) => b['weight'] === 'Bolder')

    expect(title?.['text']).toContain('🔴')
    expect(title?.['color']).toBe('Attention')
  })

  it('severity warning → emoji ⚠️ y color Warning', async () => {
    const spy = mockFetch(200)
    const adapter = new TeamsWebhookAdapter({ webhookUrl: FAKE_WEBHOOK })

    await adapter.notify({ body: 'Aviso', severity: 'warning', title: 'Cuidado' })

    const parsed   = getParsedBody(spy)
    const content  = parsed.attachments[0]!.content as Record<string, unknown>
    const cardBody = content.body as Array<Record<string, unknown>>
    const title    = cardBody.find((b) => b['weight'] === 'Bolder')

    expect(title?.['text']).toContain('⚠️')
    expect(title?.['color']).toBe('Warning')
  })

  it('sin actions → no incluye array actions en el card', async () => {
    const spy = mockFetch(200)
    const adapter = new TeamsWebhookAdapter({ webhookUrl: FAKE_WEBHOOK })

    await adapter.notify({ body: 'Sin botones', severity: 'info' })

    const parsed  = getParsedBody(spy)
    const content = parsed.attachments[0]!.content as Record<string, unknown>
    expect(content['actions']).toBeUndefined()
  })

  it('sin título → no incluye bloque Bolder', async () => {
    const spy = mockFetch(200)
    const adapter = new TeamsWebhookAdapter({ webhookUrl: FAKE_WEBHOOK })

    await adapter.notify({ body: 'Solo body', severity: 'info' })

    const parsed   = getParsedBody(spy)
    const content  = parsed.attachments[0]!.content as Record<string, unknown>
    const cardBody = content.body as Array<Record<string, unknown>>
    const boldBlock = cardBody.find((b) => b['weight'] === 'Bolder')
    expect(boldBlock).toBeUndefined()
  })
})

// ── Retry logic ───────────────────────────────────────────────────────────────

describe('TeamsWebhookAdapter — retry logic', () => {
  afterEach(() => jest.restoreAllMocks())

  it('reintenta ante 429 y tiene éxito en el segundo intento', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }))
      .mockResolvedValueOnce(new Response('1', { status: 200 }))

    const adapter = new TeamsWebhookAdapter({
      webhookUrl:   FAKE_WEBHOOK,
      retryDelayMs: 5,
      maxRetries:   2,
    })

    const result = await adapter.sendText('test retry')

    expect(result.ok).toBe(true)
    expect(result.retriedCount).toBe(1)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('devuelve ok: false tras agotar todos los reintentos (503)', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('Service Unavailable', { status: 503 }),
    )

    const adapter = new TeamsWebhookAdapter({
      webhookUrl:   FAKE_WEBHOOK,
      retryDelayMs: 5,
      maxRetries:   2,
    })

    const result = await adapter.sendText('test max retries')
    expect(result.ok).toBe(false)
    expect(result.retriedCount).toBe(2)
  })

  it('NO reintenta ante 400 Bad Request', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('Bad Request', { status: 400 }),
    )

    const adapter = new TeamsWebhookAdapter({
      webhookUrl:   FAKE_WEBHOOK,
      retryDelayMs: 5,
      maxRetries:   2,
    })

    const result = await adapter.sendText('bad payload')
    expect(result.ok).toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

// ── verify ────────────────────────────────────────────────────────────────────

describe('TeamsWebhookAdapter — verify', () => {
  afterEach(() => jest.restoreAllMocks())

  it('devuelve ok: true si Teams responde 200', async () => {
    mockFetch(200)
    const adapter = new TeamsWebhookAdapter({ webhookUrl: FAKE_WEBHOOK })
    const result  = await adapter.verify()
    expect(result.ok).toBe(true)
  })

  it('devuelve ok: false si Teams responde 404', async () => {
    mockFetch(404, 'Not Found')
    const adapter = new TeamsWebhookAdapter({ webhookUrl: FAKE_WEBHOOK })
    const result  = await adapter.verify()
    expect(result.ok).toBe(false)
    expect(result.statusCode).toBe(404)
  })
})

// ── sendTeamsNotification (función helper) ────────────────────────────────────

describe('sendTeamsNotification', () => {
  afterEach(() => jest.restoreAllMocks())

  it('crea adapter y llama notify() correctamente', async () => {
    const spy = mockFetch(200)

    const result = await sendTeamsNotification(FAKE_WEBHOOK, {
      title:    'Prueba',
      body:     'Mensaje de prueba',
      severity: 'info',
    })

    expect(result.ok).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('lanza error si webhookUrl no es HTTPS', async () => {
    await expect(
      sendTeamsNotification('http://insecure', { body: 'test', severity: 'info' }),
    ).rejects.toThrow('HTTPS')
  })
})
