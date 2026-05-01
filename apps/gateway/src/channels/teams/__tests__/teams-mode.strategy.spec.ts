/**
 * teams-mode.strategy.spec.ts — Tests de la estrategia de modo Teams
 *
 * Usa jest.spyOn(global, 'fetch') — sin red real.
 */

import {
  IncomingWebhookStrategy,
  BotFrameworkStrategy,
  createTeamsModeStrategy,
  buildAdaptiveTextCard,
  buildAdaptiveRichCard,
} from '../teams-mode.strategy.js'

const FAKE_WEBHOOK_URL = 'https://company.webhook.office.com/webhookb2/fake'
const FAKE_APP_ID      = 'fake-app-id-001'
const FAKE_APP_PWD     = 'fake-app-password-001'
const FAKE_SERVICE_URL = 'https://smba.trafficmanager.net/teams'
const FAKE_CONV_ID     = 'a:1FAKE_CONVERSATION_ID'
const FAKE_TOKEN       = 'fake_bearer_token_xyz'

function mockFetchSuccess(body: unknown, status = 200) {
  return jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

// ── IncomingWebhookStrategy ───────────────────────────────────────────────────

describe('IncomingWebhookStrategy', () => {
  afterEach(() => jest.restoreAllMocks())

  it('lanza error si webhookUrl no es HTTPS', () => {
    expect(() =>
      new IncomingWebhookStrategy({ webhookUrl: 'http://not-secure.com' })
    ).toThrow('HTTPS')
  })

  it('send() hace POST al webhookUrl con Adaptive Card', async () => {
    const fetchSpy = mockFetchSuccess('1')
    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })

    const result = await strategy.send(
      { type: 'message', text: 'Hola desde el agente' },
      'any-conv-id',
    )

    expect(result.ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith(
      FAKE_WEBHOOK_URL,
      expect.objectContaining({ method: 'POST' }),
    )

    const callArgs = fetchSpy.mock.calls[0]
    const body = JSON.parse((callArgs![1] as RequestInit).body as string)
    expect(body.type).toBe('message')
    expect(body.attachments).toHaveLength(1)
    expect(body.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive')
  })

  it('send() con attachments los pasa directamente sin envolver en otro card', async () => {
    const fetchSpy = mockFetchSuccess('1')
    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })
    const card     = buildAdaptiveTextCard('texto')

    await strategy.send({ type: 'message', attachments: [card] }, 'conv-id')

    const callArgs = fetchSpy.mock.calls[0]
    const body = JSON.parse((callArgs![1] as RequestInit).body as string)
    expect(body.attachments).toHaveLength(1)
    expect(body.attachments[0]).toEqual(card)
  })

  it('send() devuelve { ok: false } cuando Teams API devuelve error', async () => {
    mockFetchSuccess({ error: 'Webhook not found' }, 404)
    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })

    const result = await strategy.send({ type: 'message', text: 'test' }, 'conv-id')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('404')
  })

  it('verify() envía mensaje de prueba y retorna ok: true', async () => {
    mockFetchSuccess('1')
    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })

    const result = await strategy.verify()
    expect(result.ok).toBe(true)
  })

  it('buildTextCard() retorna Adaptive Card válida', () => {
    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })
    const card     = strategy.buildTextCard('Mensaje de prueba')

    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive')
    expect((card.content as any).type).toBe('AdaptiveCard')
    expect((card.content as any).body[0].text).toBe('Mensaje de prueba')
  })
})

// ── BotFrameworkStrategy ──────────────────────────────────────────────────────

describe('BotFrameworkStrategy', () => {
  afterEach(() => jest.restoreAllMocks())

  it('lanza error si appId está vacío', () => {
    expect(() =>
      new BotFrameworkStrategy({ appId: '', appPassword: FAKE_APP_PWD })
    ).toThrow('appId')
  })

  it('lanza error si appPassword está vacío', () => {
    expect(() =>
      new BotFrameworkStrategy({ appId: FAKE_APP_ID, appPassword: '' })
    ).toThrow('appPassword')
  })

  it('getBearerToken() hace POST al endpoint de token de Microsoft', async () => {
    const fetchSpy = mockFetchSuccess({
      access_token: FAKE_TOKEN,
      expires_in:   3600,
      token_type:   'Bearer',
    })

    const strategy = new BotFrameworkStrategy({
      appId:       FAKE_APP_ID,
      appPassword: FAKE_APP_PWD,
    })

    const token = await strategy.getBearerToken()
    expect(token).toBe(FAKE_TOKEN)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('getBearerToken() usa caché si el token no ha expirado', async () => {
    const fetchSpy = mockFetchSuccess({
      access_token: FAKE_TOKEN,
      expires_in:   3600,
      token_type:   'Bearer',
    })

    const strategy = new BotFrameworkStrategy({
      appId:       FAKE_APP_ID,
      appPassword: FAKE_APP_PWD,
    })

    // Primer llamado — obtiene token
    await strategy.getBearerToken()
    // Segundo llamado — debe usar caché
    await strategy.getBearerToken()

    // Solo debe haber llamado fetch una vez
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('send() devuelve error si serviceUrl no se pasa', async () => {
    const strategy = new BotFrameworkStrategy({
      appId:       FAKE_APP_ID,
      appPassword: FAKE_APP_PWD,
    })

    const result = await strategy.send(
      { type: 'message', text: 'hola' },
      FAKE_CONV_ID,
      undefined,  // sin serviceUrl
    )

    expect(result.ok).toBe(false)
    expect(result.error).toContain('serviceUrl')
  })

  it('send() hace POST a {serviceUrl}/v3/conversations/{id}/activities', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: FAKE_TOKEN,
        expires_in:   3600,
        token_type:   'Bearer',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'new-activity-id-001',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const strategy = new BotFrameworkStrategy({
      appId:       FAKE_APP_ID,
      appPassword: FAKE_APP_PWD,
    })

    const result = await strategy.send(
      { type: 'message', text: 'Respuesta del agente' },
      FAKE_CONV_ID,
      FAKE_SERVICE_URL,
    )

    expect(result.ok).toBe(true)
    expect(result.activityId).toBe('new-activity-id-001')

    const sendCall = fetchSpy.mock.calls[1]
    expect(sendCall![0]).toBe(
      `${FAKE_SERVICE_URL}/v3/conversations/${FAKE_CONV_ID}/activities`
    )
    const sendHeaders = (sendCall![1] as RequestInit).headers as Record<string, string>
    expect(sendHeaders['Authorization']).toBe(`Bearer ${FAKE_TOKEN}`)
  })

  it('send() con replyToId incluye replyToId en el Activity', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: FAKE_TOKEN, expires_in: 3600, token_type: 'Bearer',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'act-002' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }))

    const strategy = new BotFrameworkStrategy({
      appId: FAKE_APP_ID, appPassword: FAKE_APP_PWD,
    })

    await strategy.send(
      { type: 'message', text: 'respuesta en hilo', replyToId: 'original-act-id' },
      FAKE_CONV_ID,
      FAKE_SERVICE_URL,
    )

    const sendCall = fetchSpy.mock.calls[1]
    const body = JSON.parse((sendCall![1] as RequestInit).body as string)
    expect(body.replyToId).toBe('original-act-id')
  })

  it('verify() devuelve ok: true si el token se obtiene correctamente', async () => {
    mockFetchSuccess({
      access_token: FAKE_TOKEN,
      expires_in:   3600,
      token_type:   'Bearer',
    })

    const strategy = new BotFrameworkStrategy({
      appId:       FAKE_APP_ID,
      appPassword: FAKE_APP_PWD,
    })

    const result = await strategy.verify()
    expect(result.ok).toBe(true)
  })

  it('verify() devuelve ok: false si las credenciales son incorrectas', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{"error":"invalid_client"}', {
        status:  401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const strategy = new BotFrameworkStrategy({
      appId:       'wrong-id',
      appPassword: 'wrong-pwd',
    })

    const result = await strategy.verify()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Token acquisition failed')
  })
})

// ── createTeamsModeStrategy (factory) ────────────────────────────────────────

describe('createTeamsModeStrategy', () => {
  it('detecta incoming_webhook por presencia de webhookUrl', () => {
    const strategy = createTeamsModeStrategy(
      {},
      { webhookUrl: FAKE_WEBHOOK_URL },
    )
    expect(strategy.mode).toBe('incoming_webhook')
    expect(strategy).toBeInstanceOf(IncomingWebhookStrategy)
  })

  it('detecta bot_framework por presencia de appId + appPassword', () => {
    const strategy = createTeamsModeStrategy(
      {},
      { appId: FAKE_APP_ID, appPassword: FAKE_APP_PWD },
    )
    expect(strategy.mode).toBe('bot_framework')
    expect(strategy).toBeInstanceOf(BotFrameworkStrategy)
  })

  it('config.mode tiene prioridad sobre detección automática', () => {
    expect(() =>
      createTeamsModeStrategy(
        { mode: 'bot_framework' },
        { webhookUrl: FAKE_WEBHOOK_URL },  // tiene webhookUrl pero config dice bot_framework
      )
    ).toThrow('appId')  // falta appId → lanza error correcto
  })

  it('lanza error claro si incoming_webhook sin webhookUrl', () => {
    expect(() =>
      createTeamsModeStrategy({ mode: 'incoming_webhook' }, {})
    ).toThrow('webhookUrl')
  })

  it('lanza error claro si bot_framework sin appId', () => {
    expect(() =>
      createTeamsModeStrategy({ mode: 'bot_framework' }, { appPassword: FAKE_APP_PWD })
    ).toThrow('appId')
  })
})

// ── buildAdaptiveRichCard ─────────────────────────────────────────────────────

describe('buildAdaptiveRichCard', () => {
  it('incluye título en el body del card', () => {
    const card = buildAdaptiveRichCard({ title: 'Estado del sistema' })
    const body = (card.content as any).body as any[]
    const titleBlock = body.find((b: any) => b.weight === 'Bolder')
    expect(titleBlock?.text).toBe('Estado del sistema')
  })

  it('incluye FactSet cuando hay fields', () => {
    const card = buildAdaptiveRichCard({
      fields: [{ label: 'Agente', value: 'SupportBot' }],
    })
    const body    = (card.content as any).body as any[]
    const factSet = body.find((b: any) => b.type === 'FactSet')
    expect(factSet?.facts[0]).toEqual({ title: 'Agente', value: 'SupportBot' })
  })

  it('incluye Action.Submit por cada botón', () => {
    const card    = buildAdaptiveRichCard({
      buttons: [{ label: 'Confirmar', value: 'confirm' }],
    })
    const actions = (card.content as any).actions as any[]
    expect(actions).toHaveLength(1)
    expect(actions[0].type).toBe('Action.Submit')
    expect(actions[0].data.actionValue).toBe('confirm')
  })

  it('no incluye actions si no hay buttons', () => {
    const card    = buildAdaptiveRichCard({ title: 'Solo título' })
    const content = card.content as any
    expect(content.actions).toBeUndefined()
  })
})
