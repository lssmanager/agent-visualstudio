/**
 * teams-mode.strategy.spec.ts — [F3a-31]
 *
 * Tests unitarios de las estrategias de modo Teams.
 * Usa jest.spyOn(global, 'fetch') — sin red real, sin Azure AD real.
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

function makeOkResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(body: unknown, status = 200) {
  return jest.spyOn(global, 'fetch').mockResolvedValue(makeOkResponse(body, status))
}

function mockTokenResponse() {
  return makeOkResponse({
    access_token: FAKE_TOKEN,
    expires_in:   3600,
    token_type:   'Bearer',
  })
}

// ── IncomingWebhookStrategy ────────────────────────────────────────────────

describe('IncomingWebhookStrategy', () => {
  afterEach(() => jest.restoreAllMocks())

  it('lanza error si webhookUrl no es HTTPS', () => {
    expect(() =>
      new IncomingWebhookStrategy({ webhookUrl: 'http://not-secure.com' })
    ).toThrow('HTTPS')
  })

  it('send() hace POST al webhookUrl con Adaptive Card cuando hay text', async () => {
    const fetchSpy = mockFetch('1')
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

    const sentBody = JSON.parse(
      (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
    )
    expect(sentBody.type).toBe('message')
    expect(sentBody.attachments).toHaveLength(1)
    expect(sentBody.attachments[0].contentType).toBe(
      'application/vnd.microsoft.card.adaptive',
    )
  })

  it('send() con attachments los pasa directamente sin envolver', async () => {
    const fetchSpy = mockFetch('1')
    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })
    const card     = buildAdaptiveTextCard('texto')

    await strategy.send({ type: 'message', attachments: [card] }, 'conv-id')

    const sentBody = JSON.parse(
      (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
    )
    expect(sentBody.attachments).toHaveLength(1)
    expect(sentBody.attachments[0]).toEqual(card)
  })

  it('send() devuelve { ok: false } cuando Teams API devuelve 404', async () => {
    mockFetch({ error: 'Webhook not found' }, 404)
    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })

    const result = await strategy.send({ type: 'message', text: 'test' }, 'conv-id')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('404')
  })

  it('send() devuelve { ok: false } en error de red', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })

    const result = await strategy.send({ type: 'message', text: 'test' }, 'conv-id')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ECONNREFUSED')
  })

  it('verify() envía mensaje de prueba y retorna ok: true', async () => {
    mockFetch('1')
    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })
    const result   = await strategy.verify()
    expect(result.ok).toBe(true)
  })

  it('buildTextCard() retorna Adaptive Card válida con el texto', () => {
    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })
    const card     = strategy.buildTextCard('Mensaje de prueba')

    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive')
    const content = card.content as Record<string, unknown>
    expect(content['type']).toBe('AdaptiveCard')
    const bodyBlocks = content['body'] as Array<Record<string, unknown>>
    expect(bodyBlocks[0]!['text']).toBe('Mensaje de prueba')
  })
})

// ── BotFrameworkStrategy ──────────────────────────────────────────────────

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
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(mockTokenResponse())

    const strategy = new BotFrameworkStrategy({
      appId: FAKE_APP_ID, appPassword: FAKE_APP_PWD,
    })
    const token = await strategy.getBearerToken()

    expect(token).toBe(FAKE_TOKEN)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('getBearerToken() usa caché y no llama fetch dos veces', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(mockTokenResponse())

    const strategy = new BotFrameworkStrategy({
      appId: FAKE_APP_ID, appPassword: FAKE_APP_PWD,
    })
    await strategy.getBearerToken()
    await strategy.getBearerToken()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('getBearerToken() renueva si el token expiró', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValue(makeOkResponse({
        access_token: FAKE_TOKEN,
        expires_in:   0,  // expira inmediatamente
        token_type:   'Bearer',
      }))

    const strategy = new BotFrameworkStrategy({
      appId: FAKE_APP_ID, appPassword: FAKE_APP_PWD,
    })
    await strategy.getBearerToken()
    await strategy.getBearerToken()  // debe renovar

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('send() devuelve error si serviceUrl no se pasa', async () => {
    const strategy = new BotFrameworkStrategy({
      appId: FAKE_APP_ID, appPassword: FAKE_APP_PWD,
    })
    const result = await strategy.send(
      { type: 'message', text: 'hola' },
      FAKE_CONV_ID,
      undefined,
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain('serviceUrl')
  })

  it('send() hace POST a {serviceUrl}/v3/conversations/{id}/activities', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(makeOkResponse({ id: 'new-activity-id-001' }))

    const strategy = new BotFrameworkStrategy({
      appId: FAKE_APP_ID, appPassword: FAKE_APP_PWD,
    })
    const result = await strategy.send(
      { type: 'message', text: 'Respuesta del agente' },
      FAKE_CONV_ID,
      FAKE_SERVICE_URL,
    )

    expect(result.ok).toBe(true)
    expect(result.activityId).toBe('new-activity-id-001')

    const [sendUrl, sendInit] = fetchSpy.mock.calls[1]! as [string, RequestInit]
    expect(sendUrl).toBe(
      `${FAKE_SERVICE_URL}/v3/conversations/${FAKE_CONV_ID}/activities`,
    )
    const headers = sendInit.headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Bearer ${FAKE_TOKEN}`)
  })

  it('send() con replyToId incluye replyToId en el Activity body', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(makeOkResponse({ id: 'act-002' }))

    const strategy = new BotFrameworkStrategy({
      appId: FAKE_APP_ID, appPassword: FAKE_APP_PWD,
    })
    await strategy.send(
      { type: 'message', text: 'respuesta en hilo', replyToId: 'original-act-id' },
      FAKE_CONV_ID,
      FAKE_SERVICE_URL,
    )

    const [, sendInit] = fetchSpy.mock.calls[1]! as [string, RequestInit]
    const sentBody = JSON.parse(sendInit.body as string) as Record<string, unknown>
    expect(sentBody['replyToId']).toBe('original-act-id')
  })

  it('send() incluye attachments en el Activity body', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(makeOkResponse({ id: 'act-003' }))

    const strategy = new BotFrameworkStrategy({
      appId: FAKE_APP_ID, appPassword: FAKE_APP_PWD,
    })
    const card = buildAdaptiveTextCard('contenido del card')
    const spy  = jest.spyOn(global, 'fetch')

    await strategy.send(
      { type: 'message', attachments: [card] },
      FAKE_CONV_ID,
      FAKE_SERVICE_URL,
    )

    const calls = spy.mock.calls
    const lastCall = calls[calls.length - 1]! as [string, RequestInit]
    const sentBody = JSON.parse(lastCall[1].body as string) as Record<string, unknown>
    expect(sentBody['attachments']).toHaveLength(1)
  })

  it('verify() devuelve ok: true si el token se obtiene correctamente', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(mockTokenResponse())
    const strategy = new BotFrameworkStrategy({
      appId: FAKE_APP_ID, appPassword: FAKE_APP_PWD,
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
      appId: 'wrong-id', appPassword: 'wrong-pwd',
    })
    const result = await strategy.verify()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Token acquisition failed')
  })
})

// ── createTeamsModeStrategy (factory) ─────────────────────────────────────

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
    // Tiene webhookUrl pero config.mode fuerza bot_framework → lanza error por falta de appId
    expect(() =>
      createTeamsModeStrategy(
        { mode: 'bot_framework' },
        { webhookUrl: FAKE_WEBHOOK_URL },
      )
    ).toThrow('appId')
  })

  it('lanza error claro si incoming_webhook sin webhookUrl', () => {
    expect(() =>
      createTeamsModeStrategy({ mode: 'incoming_webhook' }, {})
    ).toThrow('webhookUrl')
  })

  it('lanza error claro si bot_framework sin appId', () => {
    expect(() =>
      createTeamsModeStrategy(
        { mode: 'bot_framework' },
        { appPassword: FAKE_APP_PWD },
      )
    ).toThrow('appId')
  })

  it('lanza error claro si bot_framework sin appPassword', () => {
    expect(() =>
      createTeamsModeStrategy(
        { mode: 'bot_framework' },
        { appId: FAKE_APP_ID },
      )
    ).toThrow('appPassword')
  })
})

// ── buildAdaptiveTextCard ──────────────────────────────────────────────────

describe('buildAdaptiveTextCard', () => {
  it('genera un Adaptive Card schema v1.5 con el texto', () => {
    const card    = buildAdaptiveTextCard('Hola mundo')
    const content = card.content as Record<string, unknown>

    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive')
    expect(content['type']).toBe('AdaptiveCard')
    expect(content['version']).toBe('1.5')
    const blocks = content['body'] as Array<Record<string, unknown>>
    expect(blocks[0]!['text']).toBe('Hola mundo')
    expect(blocks[0]!['wrap']).toBe(true)
    expect(blocks[0]!['markdown']).toBe(true)
  })
})

// ── buildAdaptiveRichCard ──────────────────────────────────────────────────

describe('buildAdaptiveRichCard', () => {
  it('incluye título en el body del card', () => {
    const card   = buildAdaptiveRichCard({ title: 'Estado del sistema' })
    const blocks = (card.content as Record<string, unknown>)['body'] as Array<Record<string, unknown>>
    const titleBlock = blocks.find((b) => b['weight'] === 'Bolder')
    expect(titleBlock?.['text']).toBe('Estado del sistema')
  })

  it('incluye descripción como TextBlock con markdown', () => {
    const card   = buildAdaptiveRichCard({ description: 'Todo OK' })
    const blocks = (card.content as Record<string, unknown>)['body'] as Array<Record<string, unknown>>
    const descBlock = blocks.find((b) => b['markdown'] === true)
    expect(descBlock?.['text']).toBe('Todo OK')
  })

  it('incluye FactSet cuando hay fields', () => {
    const card   = buildAdaptiveRichCard({
      fields: [{ label: 'Agente', value: 'SupportBot' }],
    })
    const blocks  = (card.content as Record<string, unknown>)['body'] as Array<Record<string, unknown>>
    const factSet = blocks.find((b) => b['type'] === 'FactSet') as Record<string, unknown> | undefined
    expect(factSet).toBeDefined()
    const facts = factSet!['facts'] as Array<Record<string, unknown>>
    expect(facts[0]!['title']).toBe('Agente')
    expect(facts[0]!['value']).toBe('SupportBot')
  })

  it('incluye Action.Submit por cada botón', () => {
    const card    = buildAdaptiveRichCard({
      buttons: [{ label: 'Confirmar', value: 'confirm' }],
    })
    const actions = (card.content as Record<string, unknown>)['actions'] as Array<Record<string, unknown>>
    expect(actions).toHaveLength(1)
    expect(actions[0]!['type']).toBe('Action.Submit')
    expect((actions[0]!['data'] as Record<string, unknown>)['actionValue']).toBe('confirm')
  })

  it('no incluye actions si no hay buttons', () => {
    const card    = buildAdaptiveRichCard({ title: 'Solo título' })
    const content = card.content as Record<string, unknown>
    expect(content['actions']).toBeUndefined()
  })

  it('incluye Image block cuando hay imageUrl', () => {
    const card   = buildAdaptiveRichCard({ imageUrl: 'https://example.com/img.png' })
    const blocks = (card.content as Record<string, unknown>)['body'] as Array<Record<string, unknown>>
    const imgBlock = blocks.find((b) => b['type'] === 'Image')
    expect(imgBlock?.['url']).toBe('https://example.com/img.png')
  })
})
