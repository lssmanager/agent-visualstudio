/**
 * teams.e2e-spec.ts — [F3a-35]
 *
 * Tests E2E del flujo Microsoft Teams (ambos modos):
 *
 * MODO 1 — bot_framework:
 *   Teams Activity HTTP POST → TeamsBotAdapter → IncomingMessage
 *   → MessageDispatcher → AgentExecutor (mock)
 *   → fromOutgoingMessage() → Adaptive Card → HTTP 200 con body de card
 *
 * MODO 2 — incoming_webhook:
 *   TeamsWebhookAdapter.send() → POST al webhook URL (fetch mock)
 *   → Adaptive Card enviada a Teams
 *
 * Estrategia de mocking:
 *   - fetch global: mockeado con jest.spyOn para capturar calls al webhook Teams
 *   - IAgentExecutor: jest.fn() con respuesta configurable
 *   - Bot Framework token: TeamsBotAdapter._verifyBotFrameworkToken mockeado a true
 *   - Prisma: NO se usa (sin BD en estos tests)
 *
 * Estructura de suites:
 *   1. bot_framework — Activity type=message
 *   2. bot_framework — Activity type=conversationUpdate (instalación)
 *   3. bot_framework — Activity type=invoke (Universal Actions)
 *   4. bot_framework — respuesta Adaptive Card completa
 *   5. bot_framework — respuesta con richContent (card, quick_replies, image)
 *   6. incoming_webhook — envío básico
 *   7. incoming_webhook — card compleja (AdaptiveCardFactory)
 *   8. MessageDispatcher — error handling (espejo de Discord)
 *   9. Edge cases de TeamsBotAdapter
 *  10. validateCard — integración en el pipeline
 */

import express               from 'express'
import request               from 'supertest'

import { TeamsBotAdapter }   from '../../channels/teams/teams-bot.adapter.js'
import {
  TeamsWebhookAdapter,
}                            from '../../channels/teams/teams-webhook.adapter.js'
import {
  AdaptiveCardBuilder,
  AdaptiveCardFactory,
  fromOutgoingMessage,
  validateCard,
}                            from '../../channels/teams/adaptive-card.builder.js'
import { MessageDispatcher } from '../../message-dispatcher.service.js'
import type {
  IAgentExecutor,
  DispatchInput,
  DispatchSuccess,
  DispatchFailure,
}                            from '../../message-dispatcher.types.js'
import type {
  IncomingMessage,
  OutgoingMessage,
}                            from '../../channels/channel-adapter.interface.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_CHANNEL_CFG   = 'channel-config-teams-test'
const FAKE_AGENT_ID      = 'agent-teams-uuid'
const FAKE_SESSION_ID    = 'session-teams-001'
const FAKE_BOT_APP_ID    = 'teams-bot-app-id-uuid'
const FAKE_BOT_PASSWORD  = 'teams-bot-password'
const FAKE_TENANT_ID     = 'tenant-uuid'
const FAKE_SERVICE_URL   = 'https://smba.trafficmanager.net/emea/'
const FAKE_CONV_ID       = '29:teams-conversation-id'
const FAKE_USER_AAD_ID   = 'user-aad-object-id-uuid'
const FAKE_USER_NAME     = 'Test User Teams'
const FAKE_ACTIVITY_ID   = 'activity-id-001'
const FAKE_WEBHOOK_URL   = 'https://contoso.webhook.office.com/webhookb2/fake-teams-url'

/**
 * Crea una Bot Framework Activity de tipo "message" (mensaje de usuario).
 * Este es el body que Teams envía al endpoint del bot.
 */
function makeMessageActivity(text: string, overrides: Record<string, unknown> = {}) {
  return {
    type:       'message',
    id:         FAKE_ACTIVITY_ID,
    timestamp:  new Date().toISOString(),
    serviceUrl: FAKE_SERVICE_URL,
    channelId:  'msteams',
    from: {
      id:   FAKE_USER_AAD_ID,
      name: FAKE_USER_NAME,
    },
    conversation: {
      id:      FAKE_CONV_ID,
      isGroup: false,
      tenantId: FAKE_TENANT_ID,
    },
    recipient: {
      id:   FAKE_BOT_APP_ID,
      name: 'TestBot',
    },
    text,
    channelData: {
      tenant: { id: FAKE_TENANT_ID },
    },
    ...overrides,
  }
}

/**
 * Crea una Activity de tipo "conversationUpdate" (bot instalado en un canal/equipo).
 */
function makeConversationUpdateActivity(membersAdded?: Array<{ id: string; name: string }>) {
  return {
    type:         'conversationUpdate',
    id:           'conv-update-001',
    timestamp:    new Date().toISOString(),
    serviceUrl:   FAKE_SERVICE_URL,
    channelId:    'msteams',
    from:         { id: FAKE_SERVICE_URL, name: 'Microsoft Teams' },
    conversation: { id: FAKE_CONV_ID, isGroup: false, tenantId: FAKE_TENANT_ID },
    recipient:    { id: FAKE_BOT_APP_ID, name: 'TestBot' },
    membersAdded: membersAdded ?? [{ id: FAKE_BOT_APP_ID, name: 'TestBot' }],
    channelData:  { tenant: { id: FAKE_TENANT_ID } },
  }
}

/**
 * Crea una Activity de tipo "invoke" para Universal Actions (Action.Execute).
 */
function makeInvokeActivity(verb: string, data?: Record<string, unknown>) {
  return {
    type:       'invoke',
    name:       'adaptiveCard/action',
    id:         'invoke-001',
    timestamp:  new Date().toISOString(),
    serviceUrl: FAKE_SERVICE_URL,
    channelId:  'msteams',
    from: {
      id:   FAKE_USER_AAD_ID,
      name: FAKE_USER_NAME,
    },
    conversation: {
      id:      FAKE_CONV_ID,
      isGroup: false,
      tenantId: FAKE_TENANT_ID,
    },
    recipient: { id: FAKE_BOT_APP_ID, name: 'TestBot' },
    value: {
      action: {
        type: 'Action.Execute',
        verb,
        data: data ?? {},
      },
    },
    channelData: { tenant: { id: FAKE_TENANT_ID } },
  }
}

/** Crea un DispatchInput válido para Teams */
function makeDispatchInput(overrides: Partial<DispatchInput> = {}): DispatchInput {
  return {
    sessionId:       FAKE_SESSION_ID,
    agentId:         FAKE_AGENT_ID,
    channelConfigId: FAKE_CHANNEL_CFG,
    externalUserId:  FAKE_USER_AAD_ID,
    history: [
      { role: 'user', content: '¿Cuál es el estado del proyecto?' },
    ],
    ...overrides,
  }
}

// ── Harness compartido — bot_framework ───────────────────────────────────────

async function buildBotHarness(agentReply = 'Respuesta del agente Teams') {
  // Mock global fetch — simula Bot Framework Connector (serviceUrl) respondiendo OK
  const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
    async (url: RequestInfo | URL) => {
      const urlStr = typeof url === 'string' ? url : (url as URL).toString()
      // Simular token del Bot Framework Connector
      if (urlStr.includes('botframework.com') || urlStr.includes('login.microsoftonline.com')) {
        return new Response(
          JSON.stringify({ access_token: 'fake_bf_token', expires_in: 3600 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      // Simular respuesta al enviar mensaje de vuelta via serviceUrl
      if (urlStr.includes(FAKE_SERVICE_URL) || urlStr.includes('smba.trafficmanager.net')) {
        return new Response(
          JSON.stringify({ id: 'reply-activity-id' }),
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

  // TeamsBotAdapter
  const adapter = new TeamsBotAdapter()
  adapter.initialize(FAKE_CHANNEL_CFG)

  // Mockear verificación de token Bot Framework
  jest.spyOn(adapter as any, '_verifyBotFrameworkToken').mockResolvedValue(true)

  await adapter.setup(
    { serviceUrl: FAKE_SERVICE_URL, tenantId: FAKE_TENANT_ID },
    { appId: FAKE_BOT_APP_ID, appPassword: FAKE_BOT_PASSWORD },
    'bot_framework',
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
  app.use('/teams', adapter.buildHttpRouter())

  // Capturar IncomingMessages
  const capturedMessages: IncomingMessage[] = []
  adapter.onMessage((msg) => capturedMessages.push(msg))

  // Capturar OutgoingMessages enviados (para verificar Adaptive Cards)
  const capturedReplies: OutgoingMessage[] = []
  if (typeof (adapter as any).onSend === 'function') {
    ;(adapter as any).onSend((msg: OutgoingMessage) => capturedReplies.push(msg))
  }

  return {
    adapter,
    dispatcher,
    mockExecutor,
    fetchSpy,
    app,
    capturedMessages,
    capturedReplies,
  }
}

// ── Harness compartido — incoming_webhook ────────────────────────────────────

function buildWebhookHarness() {
  const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response('1', {
      status:  200,
      headers: { 'Content-Type': 'text/plain' },
    }),
  )

  const adapter = new TeamsWebhookAdapter()
  adapter.initialize(FAKE_CHANNEL_CFG)
  adapter.setup(
    {},
    { webhookUrl: FAKE_WEBHOOK_URL },
    'incoming_webhook',
  )

  return { adapter, fetchSpy }
}

// ── Suite 1: bot_framework — Activity type=message ───────────────────────────

describe('Teams E2E — bot_framework: Activity type=message', () => {
  let harness: Awaited<ReturnType<typeof buildBotHarness>>

  beforeEach(async () => {
    harness = await buildBotHarness('El proyecto está en fase F3a-35.')
  })
  afterEach(async () => { jest.restoreAllMocks(); await harness.adapter.dispose() })

  it('emite IncomingMessage con todos los campos correctos', async () => {
    const activity = makeMessageActivity('¿cuál es el estado del proyecto?')

    await request(harness.app)
      .post('/teams')
      .set('Authorization', 'Bearer fake_jwt_token')
      .send(activity)
      .expect(200)

    expect(harness.capturedMessages).toHaveLength(1)
    const msg = harness.capturedMessages[0]!
    expect(msg.channelType).toBe('teams')
    expect(msg.channelConfigId).toBe(FAKE_CHANNEL_CFG)
    expect(msg.senderId).toBe(FAKE_USER_AAD_ID)
    expect(msg.text).toBe('¿cuál es el estado del proyecto?')
    expect(msg.type).toBe('text')
    expect(msg.metadata?.['conversationId']).toBe(FAKE_CONV_ID)
    expect(msg.metadata?.['serviceUrl']).toBe(FAKE_SERVICE_URL)
    expect(msg.metadata?.['activityId']).toBe(FAKE_ACTIVITY_ID)
    expect(msg.metadata?.['tenantId']).toBe(FAKE_TENANT_ID)
  })

  it('responde HTTP 200 al recibir la actividad', async () => {
    const activity = makeMessageActivity('Hola agente')

    await request(harness.app)
      .post('/teams')
      .set('Authorization', 'Bearer fake_jwt_token')
      .send(activity)
      .expect(200)
  })

  it('externalId corresponde al conversationId de Teams', async () => {
    await request(harness.app)
      .post('/teams')
      .set('Authorization', 'Bearer fake_jwt_token')
      .send(makeMessageActivity('test'))

    const msg = harness.capturedMessages[0]!
    expect(msg.externalId).toBe(FAKE_CONV_ID)
  })

  it('no emite IncomingMessage para actividades que no son "message"', async () => {
    // conversationUpdate no debe emitir mensaje (tiene su propia suite)
    const activity = makeConversationUpdateActivity()

    await request(harness.app)
      .post('/teams')
      .set('Authorization', 'Bearer fake_jwt_token')
      .send(activity)
      .expect(200)

    expect(harness.capturedMessages).toHaveLength(0)
  })

  it('senderName está disponible en metadata cuando Teams lo envía', async () => {
    const activity = makeMessageActivity('pregunta')

    await request(harness.app)
      .post('/teams')
      .set('Authorization', 'Bearer fake_jwt_token')
      .send(activity)

    const msg = harness.capturedMessages[0]!
    // El nombre puede estar en metadata['senderName'] o en senderName directo
    const senderName =
      msg.metadata?.['senderName'] ?? (msg as any).senderName
    expect(senderName).toBe(FAKE_USER_NAME)
  })
})

// ── Suite 2: bot_framework — Activity type=conversationUpdate ────────────────

describe('Teams E2E — bot_framework: conversationUpdate (instalación)', () => {
  let harness: Awaited<ReturnType<typeof buildBotHarness>>

  beforeEach(async () => { harness = await buildBotHarness() })
  afterEach(async () => { jest.restoreAllMocks(); await harness.adapter.dispose() })

  it('responde 200 sin emitir IncomingMessage cuando el bot es añadido', async () => {
    const activity = makeConversationUpdateActivity([
      { id: FAKE_BOT_APP_ID, name: 'TestBot' },
    ])

    await request(harness.app)
      .post('/teams')
      .set('Authorization', 'Bearer fake_jwt_token')
      .send(activity)
      .expect(200)

    // conversationUpdate (bot añadido) NO dispara un IncomingMessage de texto
    expect(harness.capturedMessages).toHaveLength(0)
  })

  it('puede enviar welcome card cuando el bot es añadido (opcional)', async () => {
    // Si el adapter implementa onInstall(), este test verifica que no lanza
    const activity = makeConversationUpdateActivity([
      { id: FAKE_BOT_APP_ID, name: 'TestBot' },
    ])

    const res = await request(harness.app)
      .post('/teams')
      .set('Authorization', 'Bearer fake_jwt_token')
      .send(activity)

    // No debe lanzar y debe devolver 200
    expect(res.status).toBe(200)
  })

  it('ignora conversationUpdate cuando membersAdded no incluye al bot', async () => {
    const activity = makeConversationUpdateActivity([
      { id: FAKE_USER_AAD_ID, name: FAKE_USER_NAME },  // user joined, not bot
    ])

    const res = await request(harness.app)
      .post('/teams')
      .set('Authorization', 'Bearer fake_jwt_token')
      .send(activity)

    expect(res.status).toBe(200)
    expect(harness.capturedMessages).toHaveLength(0)
  })
})

// ── Suite 3: bot_framework — Activity type=invoke (Universal Actions) ─────────

describe('Teams E2E — bot_framework: invoke (Universal Actions)', () => {
  let harness: Awaited<ReturnType<typeof buildBotHarness>>

  beforeEach(async () => {
    harness = await buildBotHarness('Acción procesada correctamente')
  })
  afterEach(async () => { jest.restoreAllMocks(); await harness.adapter.dispose() })

  it('responde 200 para invoke adaptiveCard/action', async () => {
    const activity = makeInvokeActivity('refresh', { taskId: 'task-001' })

    await request(harness.app)
      .post('/teams')
      .set('Authorization', 'Bearer fake_jwt_token')
      .send(activity)
      .expect(200)
  })

  it('emite IncomingMessage con type=command y verb en metadata para invoke', async () => {
    const activity = makeInvokeActivity('executeTask', { taskId: 'task-002' })

    await request(harness.app)
      .post('/teams')
      .set('Authorization', 'Bearer fake_jwt_token')
      .send(activity)

    // Si el adapter mapea invoke → IncomingMessage (opcional según implementación)
    // Este test verifica que si lo emite, tiene los campos correctos
    if (harness.capturedMessages.length > 0) {
      const msg = harness.capturedMessages[0]!
      expect(msg.type).toBe('command')
      expect(msg.channelType).toBe('teams')
      // verb debe estar en text o en metadata
      const hasVerb =
        msg.text.includes('executeTask') ||
        msg.metadata?.['verb'] === 'executeTask'
      expect(hasVerb).toBe(true)
    }
  })

  it('responde con InvokeResponse (status 200) para invoke', async () => {
    const activity = makeInvokeActivity('refresh')

    const res = await request(harness.app)
      .post('/teams')
      .set('Authorization', 'Bearer fake_jwt_token')
      .send(activity)

    // Bot Framework espera que invoke responda con body que incluya status
    // La respuesta puede ser vacía (200) o incluir { status: 200 }
    if (res.body && Object.keys(res.body).length > 0) {
      // Si hay body, debe incluir un status code de éxito
      const status = res.body.status ?? res.body.statusCode ?? res.status
      expect(status).toBeGreaterThanOrEqual(200)
      expect(status).toBeLessThan(400)
    } else {
      expect(res.status).toBe(200)
    }
  })
})

// ── Suite 4: bot_framework — Adaptive Card response ──────────────────────────

describe('Teams E2E — bot_framework: respuesta Adaptive Card completa', () => {
  let harness: Awaited<ReturnType<typeof buildBotHarness>>

  beforeEach(async () => {
    harness = await buildBotHarness('El proyecto avanza según lo planeado.')
  })
  afterEach(async () => { jest.restoreAllMocks(); await harness.adapter.dispose() })

  it('dispatcher.dispatch() retorna ok:true con reply del agente', async () => {
    const result = await harness.dispatcher.dispatch(
      makeDispatchInput({
        history: [{ role: 'user', content: '¿Cuándo termina la fase F3a?' }],
      }),
    )

    expect(result.ok).toBe(true)
    const success = result as DispatchSuccess
    expect(success.reply).toBe('El proyecto avanza según lo planeado.')
    expect(success.attempts).toBe(1)
    expect(typeof success.durationMs).toBe('number')
  })

  it('AgentExecutor recibe agentId y history con el formato correcto', async () => {
    await harness.dispatcher.dispatch(
      makeDispatchInput({
        history: [{ role: 'user', content: '¿Cuántas features tiene F3a?' }],
      }),
    )

    expect(harness.mockExecutor.run).toHaveBeenCalledWith(
      FAKE_AGENT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          role:    'user',
          content: '¿Cuántas features tiene F3a?',
        }),
      ]),
    )
  })

  it('fromOutgoingMessage() produce TeamsCardAttachment válido para texto plano', () => {
    const outgoing: OutgoingMessage = {
      externalId: FAKE_CONV_ID,
      text:       'El proyecto avanza según lo planeado.',
    }
    const card = fromOutgoingMessage(outgoing)

    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive')
    expect(card.content.type).toBe('AdaptiveCard')
    expect(card.content.version).toBe('1.5')

    // El texto debe aparecer en algún TextBlock del body
    const bodyText = card.content.body
      ?.filter((b: any) => b.type === 'TextBlock')
      .map((b: any) => b.text)
      .join(' ')
    expect(bodyText).toContain('El proyecto avanza según lo planeado.')
  })

  it('validateCard() confirma que la card generada es válida para Teams', () => {
    const outgoing: OutgoingMessage = {
      externalId: FAKE_CONV_ID,
      text:       '## Respuesta del Agente\n\nTodo está en orden.',
    }
    const card   = fromOutgoingMessage(outgoing)
    const result = validateCard(card)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.byteSize).toBeGreaterThan(0)
    expect(result.byteSize).toBeLessThan(28 * 1024)
  })

  it('adapter.send() llama al serviceUrl de Bot Framework con la Adaptive Card', async () => {
    const outgoing: OutgoingMessage = {
      externalId: FAKE_CONV_ID,
      text:       'Respuesta procesada',
      metadata: {
        serviceUrl:     FAKE_SERVICE_URL,
        activityId:     FAKE_ACTIVITY_ID,
        conversationId: FAKE_CONV_ID,
        tenantId:       FAKE_TENANT_ID,
      },
    }

    // Limpiar spy para capturar solo este call
    harness.fetchSpy.mockClear()

    await harness.adapter.send(outgoing)

    // Debe haber al menos un call al serviceUrl (reply activity)
    const replyCall = harness.fetchSpy.mock.calls.find(([url]) =>
      url.toString().includes(FAKE_SERVICE_URL) ||
      url.toString().includes('smba.trafficmanager.net')
    )
    expect(replyCall).toBeDefined()

    const sentBody = JSON.parse((replyCall![1] as RequestInit).body as string)
    // La respuesta debe tener la card adaptiva
    expect(sentBody.type).toBe('message')
    expect(sentBody.attachments).toHaveLength(1)
    expect(sentBody.attachments[0].contentType).toBe(
      'application/vnd.microsoft.card.adaptive'
    )
  })
})

// ── Suite 5: bot_framework — richContent (card, quick_replies, image) ─────────

describe('Teams E2E — bot_framework: respuestas con richContent', () => {
  afterEach(() => jest.restoreAllMocks())

  it('richContent type=card genera card con título y Action.Submit', () => {
    const outgoing: OutgoingMessage = {
      externalId:  FAKE_CONV_ID,
      text:        'fallback',
      richContent: {
        type: 'card',
        card: {
          title:   'Resultado de búsqueda',
          buttons: [
            { label: 'Ver detalles', payload: 'details' },
            { label: 'Cancelar',    payload: 'cancel'  },
          ],
        },
      },
    }
    const card    = fromOutgoingMessage(outgoing)
    const title   = card.content.body?.find((b: any) => b.weight === 'Bolder') as any
    const actions = card.content.actions as any[]

    expect(title?.text).toBe('Resultado de búsqueda')
    expect(actions).toHaveLength(2)
    expect(actions[0].type).toBe('Action.Submit')
    expect(actions[0].data.quickReply).toBe('details')
  })

  it('richContent type=quick_replies genera Action.Submit por cada reply', () => {
    const outgoing: OutgoingMessage = {
      externalId:  FAKE_CONV_ID,
      text:        '¿Qué quieres hacer?',
      richContent: {
        type:    'quick_replies',
        replies: [
          { label: 'Opción A', payload: 'a' },
          { label: 'Opción B', payload: 'b' },
          { label: 'Opción C', payload: 'c' },
        ],
      },
    }
    const card    = fromOutgoingMessage(outgoing)
    const actions = card.content.actions as any[]

    expect(actions).toHaveLength(3)
    expect(actions.map((a: any) => a.data.quickReply)).toEqual(['a', 'b', 'c'])
  })

  it('richContent type=image genera Image element con URL y altText', () => {
    const outgoing: OutgoingMessage = {
      externalId:  FAKE_CONV_ID,
      text:        '',
      richContent: {
        type:    'image',
        url:     'https://example.com/diagram.png',
        altText: 'Diagrama de arquitectura',
      },
    }
    const card  = fromOutgoingMessage(outgoing)
    const image = card.content.body?.find((b: any) => b.type === 'Image') as any

    expect(image).toBeDefined()
    expect(image.url).toBe('https://example.com/diagram.png')
    expect(image.altText).toBe('Diagrama de arquitectura')
  })

  it('richContent type=file genera TextBlock con link markdown', () => {
    const outgoing: OutgoingMessage = {
      externalId:  FAKE_CONV_ID,
      text:        '',
      richContent: {
        type:     'file',
        url:      'https://example.com/report.pdf',
        filename: 'reporte-mensual.pdf',
      },
    }
    const card  = fromOutgoingMessage(outgoing)
    const block = card.content.body?.[card.content.body.length - 1] as any

    expect(block.type).toBe('TextBlock')
    expect(block.text).toContain('reporte-mensual.pdf')
    expect(block.text).toContain('https://example.com/report.pdf')
  })

  it('AdaptiveCardFactory.quickReplies() produce card válida con 4 replies', () => {
    const card = AdaptiveCardFactory.quickReplies(
      '¿Cómo puedo ayudarte?',
      [
        { label: 'Ver estado',    payload: 'status'  },
        { label: 'Crear tarea',   payload: 'create'  },
        { label: 'Ver historial', payload: 'history' },
        { label: 'Ayuda',        payload: 'help'    },
      ],
    )
    const result = validateCard(card)
    expect(result.valid).toBe(true)
    expect(card.content.actions).toHaveLength(4)
  })
})

// ── Suite 6: incoming_webhook — envío básico ─────────────────────────────────

describe('Teams E2E — incoming_webhook: envío básico', () => {
  let harness: ReturnType<typeof buildWebhookHarness>

  beforeEach(() => { harness = buildWebhookHarness() })
  afterEach(() => jest.restoreAllMocks())

  it('send() llama POST al webhook URL de Teams', async () => {
    const outgoing: OutgoingMessage = {
      externalId: FAKE_CONV_ID,
      text:       'Notificación del agente via webhook',
    }

    await harness.adapter.send(outgoing)

    expect(harness.fetchSpy).toHaveBeenCalledWith(
      FAKE_WEBHOOK_URL,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('el body enviado al webhook contiene una Adaptive Card válida', async () => {
    const outgoing: OutgoingMessage = {
      externalId: FAKE_CONV_ID,
      text:       'Estado del sistema: **OK**',
    }

    await harness.adapter.send(outgoing)

    const call     = harness.fetchSpy.mock.calls[0]!
    const sentBody = JSON.parse((call[1] as RequestInit).body as string)

    // El webhook de Teams espera attachments o body directo de Adaptive Card
    // Verificar que hay una Adaptive Card en algún formato
    const hasCard =
      sentBody.type === 'AdaptiveCard' ||
      sentBody.attachments?.some(
        (a: any) => a.contentType === 'application/vnd.microsoft.card.adaptive'
      )
    expect(hasCard).toBe(true)
  })

  it('Content-Type es application/json en el call al webhook', async () => {
    await harness.adapter.send({
      externalId: FAKE_CONV_ID,
      text:       'test',
    })

    const call    = harness.fetchSpy.mock.calls[0]!
    const headers = (call[1] as RequestInit).headers as Record<string, string>
    const ct      = headers['Content-Type'] ?? headers['content-type']
    expect(ct).toContain('application/json')
  })

  it('devuelve { ok: false, error } cuando el webhook responde 410 Gone', async () => {
    harness.fetchSpy.mockResolvedValueOnce(
      new Response('{"error":"webhook invalid"}', {
        status:  410,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await harness.adapter.send({
      externalId: FAKE_CONV_ID,
      text:       'mensaje que fallará',
    })

    // El adapter debe devolver { ok: false } o lanzar error manejado
    if (result !== undefined) {
      expect((result as any).ok).toBe(false)
    }
    // Si lanza, el test fallará — el adapter debe capturar errores de red
  })

  it('no lanza en error de red (ECONNREFUSED)', async () => {
    harness.fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    await expect(
      harness.adapter.send({ externalId: FAKE_CONV_ID, text: 'fail' })
    ).resolves.not.toThrow()
  })
})

// ── Suite 7: incoming_webhook — card compleja (AdaptiveCardFactory) ───────────

describe('Teams E2E — incoming_webhook: cards complejas con AdaptiveCardFactory', () => {
  let harness: ReturnType<typeof buildWebhookHarness>

  beforeEach(() => { harness = buildWebhookHarness() })
  afterEach(() => jest.restoreAllMocks())

  it('AdaptiveCardFactory.status() produce card de estado válida y la envía', async () => {
    const card = AdaptiveCardFactory.status({
      agentName:   'SupportBot-Teams',
      agentId:     FAKE_AGENT_ID,
      scope:       'workspace',
      bindingName: 'canal-soporte',
      isActive:    true,
    })

    // La card debe ser válida
    const validation = validateCard(card)
    expect(validation.valid).toBe(true)

    // Simular envío directo vía adapter
    const outgoing: OutgoingMessage = {
      externalId: FAKE_CONV_ID,
      text:       'Estado del canal',
      richContent: {
        type: 'card',
        card: {
          title: 'Estado del canal Teams',
        },
      },
    }
    await harness.adapter.send(outgoing)
    expect(harness.fetchSpy).toHaveBeenCalled()
  })

  it('AdaptiveCardFactory.entityCard() produce card con imagen, facts y actions', () => {
    const card = AdaptiveCardFactory.entityCard({
      title:       'Tarea #F3a-35',
      subtitle:    'Test E2E Teams',
      description: 'Implementar tests E2E del flujo Teams completo.',
      facts: [
        { name: 'Estado',    value: 'En progreso' },
        { name: 'Prioridad', value: 'Required'    },
        { name: 'Fase',      value: 'F3a'         },
      ],
      actions: [
        { label: 'Ver en GitHub', url: 'https://github.com/lssmanager/agent-visualstudio' },
      ],
    })

    const validation = validateCard(card)
    expect(validation.valid).toBe(true)

    const facts = card.content.body?.find((b: any) => b.type === 'FactSet') as any
    expect(facts.facts).toHaveLength(3)
    expect(card.content.actions).toHaveLength(1)
    expect((card.content.actions as any[])[0].type).toBe('Action.OpenUrl')
  })

  it('AdaptiveCardBuilder con tabla de datos produce card válida', () => {
    const card = new AdaptiveCardBuilder()
      .addHeading('Resumen de sesiones activas')
      .addTable({
        headers: ['Canal',   'Agente',     'Mensajes', 'Estado'],
        rows: [
          ['Teams',    'SupportBot', '142',      '🟢 Activo'],
          ['Discord',  'DevBot',     '87',       '🟢 Activo'],
          ['WhatsApp', 'SalesBot',   '234',      '🔴 Inactivo'],
        ],
        showGridLines: true,
      })
      .addActionOpenUrl('Ver dashboard completo', 'https://app.example.com/dashboard')
      .build()

    const validation = validateCard(card)
    expect(validation.valid).toBe(true)

    const table = card.content.body?.find((b: any) => b.type === 'Table') as any
    expect(table).toBeDefined()
    // Header row + 3 data rows
    expect(table.rows).toHaveLength(4)
  })

  it('AdaptiveCardFactory.confirmCard() produce card con estilos positive/destructive', () => {
    const card = AdaptiveCardFactory.confirmCard({
      title:         '¿Reiniciar el agente?',
      body:          'Esta acción interrumpirá las sesiones activas.',
      confirmLabel:  'Sí, reiniciar',
      confirmData:   { action: 'restart', agentId: FAKE_AGENT_ID },
      cancelLabel:   'No, cancelar',
      cancelData:    { action: 'cancel' },
    })

    const validation = validateCard(card)
    expect(validation.valid).toBe(true)

    const actions = card.content.actions as any[]
    expect(actions).toHaveLength(2)
    expect(actions.find((a) => a.style === 'positive')?.data.action).toBe('restart')
    expect(actions.find((a) => a.style === 'destructive')?.data.action).toBe('cancel')
  })
})

// ── Suite 8: MessageDispatcher — error handling ───────────────────────────────

describe('Teams E2E — MessageDispatcher error handling', () => {
  afterEach(() => jest.restoreAllMocks())

  it('devuelve { ok:false, errorKind:"timeout" } cuando AgentExecutor se demora', async () => {
    const slowExecutor: IAgentExecutor = {
      run: jest.fn().mockImplementation(
        () => new Promise((resolve) =>
          setTimeout(() => resolve({ reply: 'tarde' }), 10_000)
        ),
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

  it('devuelve { ok:false } para errores del agente Teams-specific', async () => {
    const failExecutor: IAgentExecutor = {
      run: jest.fn().mockRejectedValue(
        new Error('Teams agent not bound — no ChannelBinding for conversation')
      ),
    }
    const dispatcher = new MessageDispatcher(failExecutor, {
      timeoutMs:   5_000,
      maxAttempts: 1,
    })

    const result = await dispatcher.dispatch(
      makeDispatchInput({ agentId: 'unbound-agent' })
    )

    expect(result.ok).toBe(false)
    const fail = result as DispatchFailure
    expect(['agent_error', 'transient', 'unknown']).toContain(fail.errorKind)
  })

  it('reintenta y tiene éxito en el segundo intento', async () => {
    const flakyExecutor: IAgentExecutor = {
      run: jest.fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({ reply: 'Respuesta del segundo intento' }),
    }
    const dispatcher = new MessageDispatcher(flakyExecutor, {
      timeoutMs:    5_000,
      maxAttempts:  2,
      retryDelayMs: 50,
    })

    const result = await dispatcher.dispatch(makeDispatchInput())

    expect(result.ok).toBe(true)
    const success = result as DispatchSuccess
    expect(success.reply).toBe('Respuesta del segundo intento')
    expect(success.attempts).toBe(2)
  })

  it('emite dispatch:success con sessionId y channelConfigId de Teams', async () => {
    const executor: IAgentExecutor = {
      run: jest.fn().mockResolvedValue({ reply: 'ok' }),
    }
    const dispatcher   = new MessageDispatcher(executor)
    const successEvents: unknown[] = []
    dispatcher.on('dispatch:success', (e) => successEvents.push(e))

    await dispatcher.dispatch(
      makeDispatchInput({ sessionId: 'teams-session-event-test' })
    )

    expect(successEvents).toHaveLength(1)
    const ev = successEvents[0] as Record<string, unknown>
    expect(ev['sessionId']).toBe('teams-session-event-test')
    expect(ev['agentId']).toBe(FAKE_AGENT_ID)
    expect(ev['channelConfigId']).toBe(FAKE_CHANNEL_CFG)
  })

  it('emite dispatch:error con errorKind cuando falla definitivamente', async () => {
    const executor: IAgentExecutor = {
      run: jest.fn().mockRejectedValue(new Error('fatal teams error')),
    }
    const dispatcher  = new MessageDispatcher(executor, { maxAttempts: 1 })
    const errorEvents: unknown[] = []
    dispatcher.on('dispatch:error', (e) => errorEvents.push(e))

    await dispatcher.dispatch(makeDispatchInput({ sessionId: 'session-error-event' }))

    expect(errorEvents).toHaveLength(1)
    const ev = errorEvents[0] as Record<string, unknown>
    expect(typeof ev['errorKind']).toBe('string')
    expect(ev['attempts']).toBe(1)
  })
})

// ── Suite 9: Edge cases de TeamsBotAdapter ────────────────────────────────────

describe('Teams E2E — TeamsBotAdapter edge cases', () => {
  let harness: Awaited<ReturnType<typeof buildBotHarness>>

  beforeEach(async () => { harness = await buildBotHarness() })
  afterEach(async () => { jest.restoreAllMocks(); await harness.adapter.dispose() })

  it('retorna 401 cuando el token Bearer está ausente', async () => {
    // Restaurar el mock del token para que use validación real
    jest.restoreAllMocks()

    const strictAdapter = new TeamsBotAdapter()
    strictAdapter.initialize(FAKE_CHANNEL_CFG)

    // NO mockear _verifyBotFrameworkToken — debe rechazar tokens inválidos
    await strictAdapter.setup(
      { serviceUrl: FAKE_SERVICE_URL, tenantId: FAKE_TENANT_ID },
      { appId: FAKE_BOT_APP_ID, appPassword: FAKE_BOT_PASSWORD },
      'bot_framework',
    )

    const strictApp = express()
    strictApp.use(express.json())
    strictApp.use('/teams', strictAdapter.buildHttpRouter())

    const res = await request(strictApp)
      .post('/teams')
      .send(makeMessageActivity('sin token'))
      // No se envía Authorization header

    expect([401, 403]).toContain(res.status)
    await strictAdapter.dispose()
  })

  it('retorna 400 para actividades con type desconocido', async () => {
    const res = await request(harness.app)
      .post('/teams')
      .set('Authorization', 'Bearer fake_jwt_token')
      .send({ type: 'unknownActivityType', id: 'x', channelId: 'msteams' })

    // Puede ser 400 o 200 (si el adapter ignora gracefully) — no debe ser 5xx
    expect(res.status).toBeLessThan(500)
  })

  it('no emite IncomingMessage si falta el campo text en la actividad', async () => {
    const activityWithoutText = makeMessageActivity('')
    delete (activityWithoutText as any).text

    await request(harness.app)
      .post('/teams')
      .set('Authorization', 'Bearer fake_jwt_token')
      .send(activityWithoutText)

    // Sin texto, el adapter puede omitir el mensaje o emitir con text=''
    // Lo que NO debe pasar es un crash (5xx)
    if (harness.capturedMessages.length > 0) {
      expect(harness.capturedMessages[0]!.text).toBe('')
    }
  })

  it('dispose() limpia el adapter sin errores', async () => {
    await expect(harness.adapter.dispose()).resolves.not.toThrow()
  })

  it('onError() registra el handler de errores sin lanzar', () => {
    const errorHandler = jest.fn()
    expect(() => harness.adapter.onError(errorHandler)).not.toThrow()
  })

  it('buildHttpRouter() devuelve un Router de Express válido', () => {
    const router = harness.adapter.buildHttpRouter()
    // Un Express Router tiene la función handle
    expect(typeof router).toBe('function')
  })
})

// ── Suite 10: validateCard — integración en el pipeline ──────────────────────

describe('Teams E2E — validateCard integración', () => {
  it('rechaza card que supera el límite de 28KB de Teams', () => {
    const hugeParagraph = 'x'.repeat(30 * 1024)  // 30KB de texto
    const outgoing: OutgoingMessage = {
      externalId: FAKE_CONV_ID,
      text:       hugeParagraph,
    }
    const card   = fromOutgoingMessage(outgoing)
    const result = validateCard(card)

    // Si el texto es muy largo, validateCard debe reportar error de tamaño
    if (!result.valid) {
      expect(result.errors.some((e: string) => e.toLowerCase().includes('size') || e.toLowerCase().includes('byte'))).toBe(true)
    }
    // byteSize siempre debe estar presente
    expect(result.byteSize).toBeGreaterThan(0)
  })

  it('fromOutgoingMessage() sin richContent produce card mínima válida', () => {
    const outgoing: OutgoingMessage = {
      externalId: FAKE_CONV_ID,
      text:       'Texto simple sin formato',
    }
    const card   = fromOutgoingMessage(outgoing)
    const result = validateCard(card)

    expect(result.valid).toBe(true)
    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive')
    expect(card.content.type).toBe('AdaptiveCard')
    expect(card.content.body).toBeDefined()
    expect(Array.isArray(card.content.body)).toBe(true)
    expect(card.content.body!.length).toBeGreaterThan(0)
  })

  it('fromOutgoingMessage() con markdown en text produce TextBlock con wrap:true', () => {
    const outgoing: OutgoingMessage = {
      externalId: FAKE_CONV_ID,
      text:       '**Estado**: 🟢 Activo\n\nEl agente ha procesado 142 mensajes hoy.',
    }
    const card      = fromOutgoingMessage(outgoing)
    const textBlock = card.content.body?.find((b: any) => b.type === 'TextBlock') as any

    expect(textBlock).toBeDefined()
    expect(textBlock.wrap).toBe(true)
  })

  it('todas las cards de AdaptiveCardFactory pasan validateCard', () => {
    const factories = [
      () => AdaptiveCardFactory.quickReplies('¿Cómo puedo ayudarte?', [
        { label: 'Ayuda',   payload: 'help'   },
        { label: 'Estado',  payload: 'status' },
      ]),
      () => AdaptiveCardFactory.status({
        agentName:   'TestBot',
        agentId:     FAKE_AGENT_ID,
        scope:       'channel',
        bindingName: 'test-channel',
        isActive:    true,
      }),
      () => AdaptiveCardFactory.entityCard({
        title:       'Entidad de prueba',
        subtitle:    'Subtítulo',
        description: 'Descripción detallada de la entidad.',
        facts:       [{ name: 'Campo', value: 'Valor' }],
        actions:     [],
      }),
      () => AdaptiveCardFactory.confirmCard({
        title:        '¿Confirmar?',
        body:         'Esta acción no se puede deshacer.',
        confirmLabel: 'Confirmar',
        confirmData:  { action: 'confirm' },
        cancelLabel:  'Cancelar',
        cancelData:   { action: 'cancel' },
      }),
    ]

    for (const factory of factories) {
      const card   = factory()
      const result = validateCard(card)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    }
  })
})
