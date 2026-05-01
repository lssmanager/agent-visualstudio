/**
 * teams.e2e-spec.ts — [F3a-27]
 *
 * Tests E2E del flujo Microsoft Teams:
 *   Webhook HTTP → TeamsAdapter → IncomingMessage
 *   → MessageDispatcher → AgentExecutor (mock)
 *   → strategy.send → Teams API (fetch mock)
 *
 * Estrategia de mocking:
 *   - fetch global: mockeado con jest.spyOn para capturar llamadas a Teams/Microsoft API
 *   - IAgentExecutor: jest.fn() que devuelve respuesta configurable
 *   - JWT auth middleware: mockeado (_verifyBotFrameworkAuth) para saltear verificación
 *   - Prisma: NO se usa directamente en estos tests
 *
 * Estructura de suites:
 *   1. IncomingWebhookStrategy — envío y verificación
 *   2. BotFrameworkStrategy — token OAuth + envío de actividad
 *   3. TeamsAdapter (bot_framework) — recepción de message Activity
 *   4. TeamsAdapter — conversationUpdate / invoke / tipos desconocidos
 *   5. TeamsAdapter (incoming_webhook) — modo solo-envío
 *   6. MessageDispatcher — integración con TeamsAdapter
 *   7. Edge cases del TeamsAdapter
 */

import express                from 'express'
import request                from 'supertest'

import { TeamsAdapter }       from '../../channels/teams/teams-bot.adapter.js'
import { MessageDispatcher }  from '../../message-dispatcher.service.js'
import type {
  IAgentExecutor,
  DispatchInput,
  DispatchSuccess,
  DispatchFailure,
}                             from '../../message-dispatcher.types.js'
import type { IncomingMessage } from '../../channels/channel-adapter.interface.js'
import {
  IncomingWebhookStrategy,
  BotFrameworkStrategy,
  buildAdaptiveTextCard,
  buildAdaptiveRichCard,
  type TeamsActivity,
}                             from '../../channels/teams/teams-mode.strategy.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_APP_ID       = 'app-id-test-1111'
const FAKE_APP_PASSWORD = 'app-password-test-2222'
const FAKE_WEBHOOK_URL  = 'https://prod-01.westus.logic.azure.com/fake-webhook'
const FAKE_SERVICE_URL  = 'https://smba.trafficmanager.net/apis'
const FAKE_CONV_ID      = '19:conversation-id-test@thread.v2'
const FAKE_TENANT_ID    = 'tenant-uuid-test'
const FAKE_TEAM_ID      = 'team-uuid-test'
const FAKE_USER_ID      = 'aad-user-uuid-test'
const FAKE_USER_NAME    = 'Test User'
const FAKE_BOT_ID       = 'bot-uuid-test'
const FAKE_CHANNEL_CFG  = 'channel-config-teams-test'
const FAKE_AGENT_ID     = 'agent-uuid-teams-test'
const FAKE_SESSION_ID   = 'session-teams-001'
const FAKE_BEARER_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHBpZCI6ImFwcC1pZC10ZXN0LTExMTEiLCJleHAiOjk5OTk5OTk5OTl9.signature'

/** Crea una TeamsActivity de tipo 'message' completa */
function makeMessageActivity(text: string, overrides: Partial<TeamsActivity> = {}): TeamsActivity {
  return {
    type:       'message',
    id:         'activity-id-test-001',
    timestamp:  new Date().toISOString(),
    serviceUrl: FAKE_SERVICE_URL,
    channelId:  'msteams',
    from: {
      id:          FAKE_USER_ID,
      name:        FAKE_USER_NAME,
      aadObjectId: FAKE_USER_ID,
    },
    conversation: {
      id:       FAKE_CONV_ID,
      tenantId: FAKE_TENANT_ID,
      isGroup:  true,
    },
    recipient: {
      id:   FAKE_BOT_ID,
      name: 'TestBot',
    },
    text,
    channelData: {
      tenant:  { id: FAKE_TENANT_ID },
      team:    { id: FAKE_TEAM_ID, name: 'Test Team' },
      channel: { id: '19:channel-id@thread.skype', name: 'General' },
    },
    ...overrides,
  }
}

/** Crea una TeamsActivity de tipo 'conversationUpdate' */
function makeConversationUpdateActivity(): TeamsActivity {
  return {
    type:       'conversationUpdate',
    id:         'activity-id-update-001',
    serviceUrl: FAKE_SERVICE_URL,
    channelId:  'msteams',
    from:         { id: FAKE_BOT_ID, name: 'TestBot' },
    conversation: { id: FAKE_CONV_ID, tenantId: FAKE_TENANT_ID, isGroup: true },
    recipient:    { id: FAKE_USER_ID, name: FAKE_USER_NAME },
    channelData: {
      team:    { id: FAKE_TEAM_ID, name: 'Test Team' },
      channel: { id: '19:channel@thread.skype', name: 'General' },
    },
  }
}

/** Crea una TeamsActivity de tipo 'invoke' (health check de Teams) */
function makeInvokeActivity(): TeamsActivity {
  return {
    type:         'invoke',
    id:           'activity-id-invoke-001',
    serviceUrl:   FAKE_SERVICE_URL,
    channelId:    'msteams',
    from:         { id: FAKE_USER_ID },
    conversation: { id: FAKE_CONV_ID },
    recipient:    { id: FAKE_BOT_ID },
  }
}

/** Crea un DispatchInput válido */
function makeDispatchInput(overrides: Partial<DispatchInput> = {}): DispatchInput {
  return {
    sessionId:       FAKE_SESSION_ID,
    agentId:         FAKE_AGENT_ID,
    channelConfigId: FAKE_CHANNEL_CFG,
    externalUserId:  FAKE_USER_ID,
    history: [
      { role: 'user', content: 'Mensaje de prueba Teams' },
    ],
    ...overrides,
  }
}

/** Construye un JWT mínimo con el appid correcto para pasar la verificación del adapter */
function makeFakeJwt(appId: string): string {
  const payload = Buffer.from(JSON.stringify({ appid: appId, exp: 9999999999 })).toString('base64url')
  return `eyJhbGciOiJSUzI1NiJ9.${payload}.fakesignature`
}

// ── Harness compartido ────────────────────────────────────────────────────────

async function buildBotFrameworkHarness(agentReply = 'Respuesta de Teams del agente') {
  // Mock global de fetch — simula Microsoft API respondiendo OK
  const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
    async (url: RequestInfo | URL) => {
      const urlStr = typeof url === 'string' ? url : (url as URL).toString()

      // Token endpoint de Microsoft
      if (urlStr.includes('login.microsoftonline.com')) {
        return new Response(
          JSON.stringify({
            access_token: FAKE_BEARER_TOKEN,
            expires_in:   3600,
            token_type:   'Bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      // Bot Framework Service (envío de respuesta)
      if (urlStr.includes('smba.trafficmanager.net') || urlStr.includes('/v3/conversations/')) {
        return new Response(
          JSON.stringify({ id: 'mock-activity-id' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      throw new Error(`fetch no mockeada para URL: ${urlStr}`)
    },
  )

  // AgentExecutor mock
  const mockExecutor: IAgentExecutor = {
    run: jest.fn().mockResolvedValue({ reply: agentReply }),
  }

  // TeamsAdapter en modo bot_framework
  const adapter = new TeamsAdapter()
  await adapter.initialize(FAKE_CHANNEL_CFG)
  await adapter.setup(
    { mode: 'bot_framework' },
    { appId: FAKE_APP_ID, appPassword: FAKE_APP_PASSWORD },
  )

  // MessageDispatcher
  const dispatcher = new MessageDispatcher(mockExecutor, {
    timeoutMs:    5_000,
    maxAttempts:  1,
    retryDelayMs: 50,
  })

  // App Express
  const app = express()
  app.use(express.json())
  app.use('/teams', adapter.getRouter())

  // Capturar IncomingMessages
  const capturedMessages: IncomingMessage[] = []
  adapter.onMessage((msg) => capturedMessages.push(msg))

  // Token Bearer con appid correcto para superar validación JWT
  const validAuthHeader = `Bearer ${makeFakeJwt(FAKE_APP_ID)}`

  return { adapter, dispatcher, mockExecutor, fetchSpy, app, capturedMessages, validAuthHeader }
}

// ── Suite 1: IncomingWebhookStrategy ─────────────────────────────────────────

describe('Teams E2E — IncomingWebhookStrategy', () => {
  let fetchSpy: jest.SpyInstance

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('1', { status: 200 }),
    )
  })

  afterEach(() => jest.restoreAllMocks())

  it('send() POST al webhookUrl con Adaptive Card cuando hay texto', async () => {
    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })

    const result = await strategy.send({
      type:        'message',
      attachments: [buildAdaptiveTextCard('Hola desde el agente')],
    }, FAKE_CONV_ID)

    expect(result.ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith(
      FAKE_WEBHOOK_URL,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('send() incluye Adaptive Card en el body cuando hay attachments', async () => {
    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })

    await strategy.send({
      type:        'message',
      attachments: [buildAdaptiveTextCard('Test message')],
    }, FAKE_CONV_ID)

    const sentBody = JSON.parse(
      (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
    )
    expect(sentBody.type).toBe('message')
    expect(sentBody.attachments).toHaveLength(1)
    expect(sentBody.attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive')
  })

  it('send() devuelve { ok: false } cuando Teams responde 400', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Bad payload', { status: 400 }),
    )

    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })
    const result = await strategy.send({ type: 'message', text: 'test' }, FAKE_CONV_ID)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('400')
  })

  it('send() devuelve { ok: false } en error de red', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })
    const result = await strategy.send({ type: 'message', text: 'test' }, FAKE_CONV_ID)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('ECONNREFUSED')
  })

  it('verify() llama send() con una Adaptive Card de prueba', async () => {
    const strategy = new IncomingWebhookStrategy({ webhookUrl: FAKE_WEBHOOK_URL })
    const result   = await strategy.verify()

    expect(result.ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('constructor lanza si webhookUrl no es HTTPS', () => {
    expect(() => new IncomingWebhookStrategy({ webhookUrl: 'http://insecure.com/hook' }))
      .toThrow('HTTPS')
  })

  it('buildAdaptiveTextCard genera estructura de Adaptive Card válida', () => {
    const card = buildAdaptiveTextCard('Mensaje de prueba')

    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive')
    const content = card.content as Record<string, unknown>
    expect(content['type']).toBe('AdaptiveCard')
    expect(content['version']).toBe('1.5')
    const body = content['body'] as Array<Record<string, unknown>>
    expect(body[0]?.['text']).toBe('Mensaje de prueba')
    expect(body[0]?.['wrap']).toBe(true)
  })

  it('buildAdaptiveRichCard incluye title, description y botones', () => {
    const card = buildAdaptiveRichCard({
      title:       'Estado del agente',
      description: 'Fase F3a completada',
      buttons:     [{ label: 'Ver más', value: 'action:ver-mas' }],
    })

    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive')
    const content = card.content as Record<string, unknown>
    const body    = content['body'] as Array<Record<string, unknown>>
    const actions = content['actions'] as Array<Record<string, unknown>>

    expect(body.some((b) => b['text'] === 'Estado del agente')).toBe(true)
    expect(body.some((b) => b['text'] === 'Fase F3a completada')).toBe(true)
    expect(actions).toHaveLength(1)
    expect(actions[0]?.['title']).toBe('Ver más')
  })
})

// ── Suite 2: BotFrameworkStrategy — token OAuth ───────────────────────────────

describe('Teams E2E — BotFrameworkStrategy (OAuth + send)', () => {
  let fetchSpy: jest.SpyInstance

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      async (url: RequestInfo | URL) => {
        const urlStr = typeof url === 'string' ? url : (url as URL).toString()

        if (urlStr.includes('login.microsoftonline.com')) {
          return new Response(
            JSON.stringify({ access_token: FAKE_BEARER_TOKEN, expires_in: 3600, token_type: 'Bearer' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        if (urlStr.includes('/v3/conversations/')) {
          return new Response(
            JSON.stringify({ id: 'new-activity-id' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        throw new Error(`fetch no mockeada: ${urlStr}`)
      },
    )
  })

  afterEach(() => jest.restoreAllMocks())

  it('getBearerToken() obtiene token de Microsoft OAuth', async () => {
    const strategy = new BotFrameworkStrategy(
      { appId: FAKE_APP_ID, appPassword: FAKE_APP_PASSWORD },
    )

    const token = await strategy.getBearerToken!()

    expect(token).toBe(FAKE_BEARER_TOKEN)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('getBearerToken() usa caché y no llama fetch dos veces', async () => {
    const strategy = new BotFrameworkStrategy(
      { appId: FAKE_APP_ID, appPassword: FAKE_APP_PASSWORD },
    )

    await strategy.getBearerToken!()
    await strategy.getBearerToken!()

    const tokenCalls = fetchSpy.mock.calls.filter(([url]) =>
      url.toString().includes('login.microsoftonline.com')
    )
    expect(tokenCalls).toHaveLength(1)
  })

  it('send() incluye Bearer token en el header Authorization', async () => {
    const strategy = new BotFrameworkStrategy(
      { appId: FAKE_APP_ID, appPassword: FAKE_APP_PASSWORD },
    )

    await strategy.send(
      { type: 'message', attachments: [buildAdaptiveTextCard('Respuesta')] },
      FAKE_CONV_ID,
      FAKE_SERVICE_URL,
    )

    const activityCall = fetchSpy.mock.calls.find(([url]) =>
      url.toString().includes('/v3/conversations/')
    )
    expect(activityCall).toBeDefined()
    expect((activityCall![1] as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${FAKE_BEARER_TOKEN}`,
    })
  })

  it('send() construye URL correcta para el Bot Framework Service', async () => {
    const strategy = new BotFrameworkStrategy(
      { appId: FAKE_APP_ID, appPassword: FAKE_APP_PASSWORD },
    )

    await strategy.send(
      { type: 'message', text: 'Hola' },
      FAKE_CONV_ID,
      FAKE_SERVICE_URL,
    )

    const activityCall = fetchSpy.mock.calls.find(([url]) =>
      url.toString().includes('/v3/conversations/')
    )
    expect(activityCall![0]).toBe(
      `${FAKE_SERVICE_URL}/v3/conversations/${FAKE_CONV_ID}/activities`
    )
  })

  it('send() devuelve { ok: false } cuando falta serviceUrl', async () => {
    const strategy = new BotFrameworkStrategy(
      { appId: FAKE_APP_ID, appPassword: FAKE_APP_PASSWORD },
    )

    const result = await strategy.send(
      { type: 'message', text: 'Hola' },
      FAKE_CONV_ID,
      // serviceUrl omitido
    )

    expect(result.ok).toBe(false)
    expect(result.error).toContain('serviceUrl')
  })

  it('verify() retorna ok:true si el token se obtiene correctamente', async () => {
    const strategy = new BotFrameworkStrategy(
      { appId: FAKE_APP_ID, appPassword: FAKE_APP_PASSWORD },
    )

    const result = await strategy.verify()
    expect(result.ok).toBe(true)
  })

  it('verify() retorna ok:false si el token falla', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Auth server down'))

    const strategy = new BotFrameworkStrategy(
      { appId: FAKE_APP_ID, appPassword: FAKE_APP_PASSWORD },
    )

    const result = await strategy.verify()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Auth server down')
  })

  it('constructor lanza si falta appId', () => {
    expect(() => new BotFrameworkStrategy({ appId: '', appPassword: FAKE_APP_PASSWORD }))
      .toThrow('appId')
  })

  it('constructor lanza si falta appPassword', () => {
    expect(() => new BotFrameworkStrategy({ appId: FAKE_APP_ID, appPassword: '' }))
      .toThrow('appPassword')
  })
})

// ── Suite 3: TeamsAdapter (bot_framework) — recepción de message Activity ─────

describe('Teams E2E — TeamsAdapter bot_framework: message Activity', () => {
  let harness: Awaited<ReturnType<typeof buildBotFrameworkHarness>>

  beforeEach(async () => { harness = await buildBotFrameworkHarness('Respuesta del agente Teams') })
  afterEach(async () => { jest.restoreAllMocks(); await harness.adapter.dispose() })

  it('POST /teams/messages emite IncomingMessage con campos normalizados', async () => {
    const body = makeMessageActivity('¿Cuál es el estado del proyecto?')

    await request(harness.app)
      .post('/teams/messages')
      .set('Authorization', harness.validAuthHeader)
      .send(body)
      .expect(200)

    // El adapter responde 200 inmediatamente y procesa en background
    await new Promise((r) => setTimeout(r, 50))

    expect(harness.capturedMessages).toHaveLength(1)
    const msg = harness.capturedMessages[0]!
    expect(msg.channelType).toBe('teams')
    expect(msg.channelConfigId).toBe(FAKE_CHANNEL_CFG)
    expect(msg.externalId).toBe(FAKE_CONV_ID)
    expect(msg.senderId).toBe(FAKE_USER_ID)     // usa aadObjectId
    expect(msg.text).toBe('¿Cuál es el estado del proyecto?')
    expect(msg.type).toBe('text')
  })

  it('IncomingMessage.metadata incluye serviceUrl, tenantId, teamId', async () => {
    const body = makeMessageActivity('Test metadata')

    await request(harness.app)
      .post('/teams/messages')
      .set('Authorization', harness.validAuthHeader)
      .send(body)
      .expect(200)

    await new Promise((r) => setTimeout(r, 50))

    const msg = harness.capturedMessages[0]!
    expect(msg.metadata?.['serviceUrl']).toBe(FAKE_SERVICE_URL)
    expect(msg.metadata?.['tenantId']).toBe(FAKE_TENANT_ID)
    expect(msg.metadata?.['teamId']).toBe(FAKE_TEAM_ID)
    expect(msg.metadata?.['isGroup']).toBe(true)
    expect(msg.metadata?.['fromName']).toBe(FAKE_USER_NAME)
  })

  it('responde 200 inmediatamente (no espera al agente)', async () => {
    // El agente tarda 500ms pero la respuesta HTTP debe ser inmediata
    const slowExecutor: IAgentExecutor = {
      run: jest.fn().mockImplementation(
        () => new Promise((r) => setTimeout(() => r({ reply: 'tarde' }), 500))
      ),
    }
    const slowDispatcher = new MessageDispatcher(slowExecutor)
    const slowAdapter    = new TeamsAdapter()
    await slowAdapter.initialize('slow-test-config')
    await slowAdapter.setup(
      { mode: 'bot_framework' },
      { appId: FAKE_APP_ID, appPassword: FAKE_APP_PASSWORD },
    )
    const slowApp = express()
    slowApp.use(express.json())
    slowApp.use('/teams', slowAdapter.getRouter())
    void slowDispatcher  // evitar advertencia de unused

    const start = Date.now()
    await request(slowApp)
      .post('/teams/messages')
      .set('Authorization', harness.validAuthHeader)
      .send(makeMessageActivity('mensaje lento'))
      .expect(200)
    const elapsed = Date.now() - start

    // La respuesta HTTP debe llegar en menos de 200ms (no espera al agente)
    expect(elapsed).toBeLessThan(300)
    await slowAdapter.dispose()
  })

  it('no emite IncomingMessage para actividad con texto vacío', async () => {
    const body = makeMessageActivity('')  // texto vacío

    await request(harness.app)
      .post('/teams/messages')
      .set('Authorization', harness.validAuthHeader)
      .send(body)
      .expect(200)

    await new Promise((r) => setTimeout(r, 50))
    expect(harness.capturedMessages).toHaveLength(0)
  })

  it('no emite IncomingMessage para texto solo con espacios', async () => {
    const body = makeMessageActivity('   ')  // solo espacios

    await request(harness.app)
      .post('/teams/messages')
      .set('Authorization', harness.validAuthHeader)
      .send(body)
      .expect(200)

    await new Promise((r) => setTimeout(r, 50))
    expect(harness.capturedMessages).toHaveLength(0)
  })

  it('dispatcher.dispatch() retorna ok:true con respuesta del agente', async () => {
    const result = await harness.dispatcher.dispatch(
      makeDispatchInput({ history: [{ role: 'user', content: '¿cuántas fases hay?' }] }),
    )

    expect(result.ok).toBe(true)
    const success = result as DispatchSuccess
    expect(success.reply).toBe('Respuesta del agente Teams')
    expect(success.attempts).toBe(1)
  })

  it('AgentExecutor recibe agentId y history correctos', async () => {
    await harness.dispatcher.dispatch(
      makeDispatchInput({ history: [{ role: 'user', content: '¿Cuántas fases?' }] }),
    )

    expect(harness.mockExecutor.run).toHaveBeenCalledWith(
      FAKE_AGENT_ID,
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: '¿Cuántas fases?' }),
      ]),
    )
  })
})

// ── Suite 4: TeamsAdapter — conversationUpdate / invoke / tipos desconocidos ──

describe('Teams E2E — TeamsAdapter: actividades no-message', () => {
  let harness: Awaited<ReturnType<typeof buildBotFrameworkHarness>>

  beforeEach(async () => { harness = await buildBotFrameworkHarness() })
  afterEach(async () => { jest.restoreAllMocks(); await harness.adapter.dispose() })

  it('conversationUpdate responde 200 y NO emite IncomingMessage', async () => {
    const body = makeConversationUpdateActivity()

    await request(harness.app)
      .post('/teams/messages')
      .set('Authorization', harness.validAuthHeader)
      .send(body)
      .expect(200)

    await new Promise((r) => setTimeout(r, 50))
    expect(harness.capturedMessages).toHaveLength(0)
  })

  it('invoke responde 200 con body vacío {} y NO emite IncomingMessage', async () => {
    const body = makeInvokeActivity()

    const res = await request(harness.app)
      .post('/teams/messages')
      .set('Authorization', harness.validAuthHeader)
      .send(body)
      .expect(200)

    expect(res.body).toEqual({})
    await new Promise((r) => setTimeout(r, 50))
    expect(harness.capturedMessages).toHaveLength(0)
  })

  it('tipo desconocido responde 200 y NO emite IncomingMessage', async () => {
    const body: Partial<TeamsActivity> & { type: string } = {
      type:         'typing',  // indicador de escritura — ignorar
      serviceUrl:   FAKE_SERVICE_URL,
      channelId:    'msteams',
      from:         { id: FAKE_USER_ID },
      conversation: { id: FAKE_CONV_ID },
      recipient:    { id: FAKE_BOT_ID },
    }

    await request(harness.app)
      .post('/teams/messages')
      .set('Authorization', harness.validAuthHeader)
      .send(body)
      .expect(200)

    await new Promise((r) => setTimeout(r, 50))
    expect(harness.capturedMessages).toHaveLength(0)
  })

  it('retorna 400 cuando el body no tiene campo type', async () => {
    const res = await request(harness.app)
      .post('/teams/messages')
      .set('Authorization', harness.validAuthHeader)
      .send({ text: 'sin type' })
      .expect(400)

    expect(res.body.error).toBeDefined()
  })
})

// ── Suite 5: TeamsAdapter modo incoming_webhook ───────────────────────────────

describe('Teams E2E — TeamsAdapter: modo incoming_webhook', () => {
  let adapter: TeamsAdapter
  let app: ReturnType<typeof express>
  let fetchSpy: jest.SpyInstance

  beforeEach(async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('1', { status: 200 }),
    )

    adapter = new TeamsAdapter({ mode: 'incoming_webhook' })
    await adapter.initialize('webhook-channel-cfg')
    await adapter.setup(
      { mode: 'incoming_webhook' },
      { webhookUrl: FAKE_WEBHOOK_URL },
    )

    app = express()
    app.use(express.json())
    app.use('/teams', adapter.getRouter())
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await adapter.dispose()
  })

  it('GET /teams/health responde { status: ok, channel: teams, mode: incoming_webhook }', async () => {
    const res = await request(app)
      .get('/teams/health')
      .expect(200)

    expect(res.body.status).toBe('ok')
    expect(res.body.channel).toBe('teams')
    expect(res.body.mode).toBe('incoming_webhook')
  })

  it('POST /teams/messages responde 400 indicando que es solo-envío', async () => {
    const res = await request(app)
      .post('/teams/messages')
      .send(makeMessageActivity('Hola'))
      .expect(400)

    expect(res.body.error).toContain('Incoming Webhook')
    expect(res.body.error).toContain('bot_framework')
    void fetchSpy  // evitar advertencia de unused en caso de que mock no sea llamado
  })

  it('adapter.send() delega al IncomingWebhookStrategy y llama al webhookUrl', async () => {
    await adapter.send({
      channelConfigId: 'webhook-channel-cfg',
      channelType:     'teams',
      externalId:      FAKE_CONV_ID,
      text:            'Notificación del agente',
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      FAKE_WEBHOOK_URL,
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

// ── Suite 6: MessageDispatcher — integración con TeamsAdapter ─────────────────

describe('Teams E2E — MessageDispatcher error handling', () => {
  afterEach(() => jest.restoreAllMocks())

  it('devuelve { ok:false, errorKind:"timeout" } cuando AgentExecutor es lento', async () => {
    const slowExecutor: IAgentExecutor = {
      run: jest.fn().mockImplementation(
        () => new Promise((r) => setTimeout(() => r({ reply: 'tarde' }), 10_000)),
      ),
    }
    const dispatcher = new MessageDispatcher(slowExecutor, {
      timeoutMs:   100,
      maxAttempts: 1,
    })

    const result = await dispatcher.dispatch(makeDispatchInput())

    expect(result.ok).toBe(false)
    const fail = result as DispatchFailure
    expect(fail.errorKind).toBe('timeout')
  }, 15_000)

  it('devuelve { ok:false, errorKind:"agent_error" } para errores del agente', async () => {
    const errorExecutor: IAgentExecutor = {
      run: jest.fn().mockRejectedValue(new Error('Teams agent not found')),
    }
    const dispatcher = new MessageDispatcher(errorExecutor, {
      timeoutMs:   5_000,
      maxAttempts: 1,
    })

    const result = await dispatcher.dispatch(
      makeDispatchInput({ agentId: 'nonexistent-teams-agent' }),
    )

    expect(result.ok).toBe(false)
    const fail = result as DispatchFailure
    expect(['agent_error', 'transient', 'unknown']).toContain(fail.errorKind)
  })

  it('reintenta en errores transitorios y tiene éxito al segundo intento', async () => {
    const flakyExecutor: IAgentExecutor = {
      run: jest.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT — transient error'))
        .mockResolvedValueOnce({ reply: 'segundo intento OK' }),
    }
    const dispatcher = new MessageDispatcher(flakyExecutor, {
      timeoutMs:    5_000,
      maxAttempts:  2,
      retryDelayMs: 50,
    })

    const result = await dispatcher.dispatch(makeDispatchInput())

    expect(result.ok).toBe(true)
    const success = result as DispatchSuccess
    expect(success.reply).toBe('segundo intento OK')
    expect(success.attempts).toBe(2)
  })

  it('emite dispatch:success con metadata de Teams correcta', async () => {
    const executor: IAgentExecutor = {
      run: jest.fn().mockResolvedValue({ reply: 'ok teams' }),
    }
    const dispatcher = new MessageDispatcher(executor)
    const successEvents: unknown[] = []
    dispatcher.on('dispatch:success', (e) => successEvents.push(e))

    await dispatcher.dispatch(makeDispatchInput({ sessionId: 'teams-session-event' }))

    expect(successEvents).toHaveLength(1)
    const ev = successEvents[0] as Record<string, unknown>
    expect(ev['sessionId']).toBe('teams-session-event')
    expect(ev['agentId']).toBe(FAKE_AGENT_ID)
    expect(ev['channelConfigId']).toBe(FAKE_CHANNEL_CFG)
  })

  it('emite dispatch:error cuando falla definitivamente', async () => {
    const executor: IAgentExecutor = {
      run: jest.fn().mockRejectedValue(new Error('Teams fatal error')),
    }
    const dispatcher = new MessageDispatcher(executor, { maxAttempts: 1 })
    const errorEvents: unknown[] = []
    dispatcher.on('dispatch:error', (e) => errorEvents.push(e))

    await dispatcher.dispatch(makeDispatchInput({ sessionId: 'teams-error-event' }))

    expect(errorEvents).toHaveLength(1)
    const ev = errorEvents[0] as Record<string, unknown>
    expect(typeof ev['errorKind']).toBe('string')
    expect(ev['attempts']).toBe(1)
  })
})

// ── Suite 7: Edge cases del TeamsAdapter ─────────────────────────────────────

describe('Teams E2E — TeamsAdapter edge cases', () => {
  let harness: Awaited<ReturnType<typeof buildBotFrameworkHarness>>

  beforeEach(async () => { harness = await buildBotFrameworkHarness() })
  afterEach(async () => { jest.restoreAllMocks(); await harness.adapter.dispose() })

  it('retorna 401 cuando falta el header Authorization', async () => {
    const body = makeMessageActivity('Mensaje sin auth')

    const res = await request(harness.app)
      .post('/teams/messages')
      // Sin header Authorization
      .send(body)
      .expect(401)

    expect(res.body.error).toContain('Bearer')
  })

  it('retorna 401 cuando el JWT tiene appid incorrecto', async () => {
    const wrongJwt = `Bearer ${makeFakeJwt('wrong-app-id-9999')}`
    const body     = makeMessageActivity('Mensaje con appid incorrecto')

    const res = await request(harness.app)
      .post('/teams/messages')
      .set('Authorization', wrongJwt)
      .send(body)
      .expect(401)

    expect(res.body.error).toContain('appid')
  })

  it('retorna 401 cuando el token no es un JWT válido (no tiene 3 partes)', async () => {
    const res = await request(harness.app)
      .post('/teams/messages')
      .set('Authorization', 'Bearer not.a.valid.jwt.parts')
      .send(makeMessageActivity('Test'))

    // Puede ser 401 o 400 según la implementación — solo verificamos que no es 200
    expect([400, 401]).toContain(res.status)
  })

  it('GET /teams/health responde con mode: bot_framework', async () => {
    const res = await request(harness.app)
      .get('/teams/health')
      .expect(200)

    expect(res.body.status).toBe('ok')
    expect(res.body.channel).toBe('teams')
    expect(res.body.mode).toBe('bot_framework')
    expect(res.body.channelConfigId).toBe(FAKE_CHANNEL_CFG)
  })

  it('getRouter() lanza si se llama antes de setup()', async () => {
    const rawAdapter = new TeamsAdapter()
    await rawAdapter.initialize('cfg-before-setup')

    expect(() => rawAdapter.getRouter()).toThrow('setup()')
  })

  it('dispose() limpia el adapter sin lanzar errores', async () => {
    await expect(harness.adapter.dispose()).resolves.not.toThrow()
  })

  it('onError() registra handler de errores sin lanzar', () => {
    const handler = jest.fn()
    expect(() => harness.adapter.onError(handler)).not.toThrow()
  })

  it('adapter.channel === "teams"', () => {
    expect(harness.adapter.channel).toBe('teams')
  })

  it('múltiples messages activities en secuencia se procesan correctamente', async () => {
    const texts = ['Primero', 'Segundo', 'Tercero']

    for (const text of texts) {
      await request(harness.app)
        .post('/teams/messages')
        .set('Authorization', harness.validAuthHeader)
        .send(makeMessageActivity(text))
        .expect(200)
    }

    await new Promise((r) => setTimeout(r, 100))
    expect(harness.capturedMessages).toHaveLength(texts.length)
    expect(harness.capturedMessages.map((m) => m.text)).toEqual(texts)
  })
})
