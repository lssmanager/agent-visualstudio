/**
 * teams-bot.adapter.spec.ts — [F3a-32]
 * Tests del TeamsAdapter con mocks de express Request/Response.
 */

import { Request, Response } from 'express'
import { TeamsAdapter } from '../teams-bot.adapter.js'
import type { TeamsActivity } from '../teams-mode.strategy.js'

// ── Mock de la estrategia ────────────────────────────────────────────────────

const mockStrategy = {
  mode:           'bot_framework' as const,
  send:           jest.fn().mockResolvedValue({ ok: true, activityId: 'act-001' }),
  verify:         jest.fn().mockResolvedValue({ ok: true }),
  buildTextCard:  jest.fn().mockReturnValue({
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {},
  }),
  getBearerToken: jest.fn().mockResolvedValue('fake-token'),
}

jest.mock('../index.js', () => ({
  ...jest.requireActual('../index.js'),
  createTeamsModeStrategy: jest.fn().mockReturnValue(mockStrategy),
}))

// ── Helpers de test ──────────────────────────────────────────────────────────

function makeActivity(overrides: Partial<TeamsActivity> = {}): TeamsActivity {
  return {
    type:        'message',
    id:          'act-test-001',
    timestamp:   '2026-05-01T20:00:00Z',
    serviceUrl:  'https://smba.trafficmanager.net/teams',
    channelId:   'msteams',
    from: {
      id:          'user-aad-001',
      name:        'Test User',
      aadObjectId: 'aad-obj-001',
    },
    conversation: {
      id:       'conv-001',
      tenantId: 'tenant-001',
      isGroup:  false,
    },
    recipient: { id: 'bot-id-001', name: 'TestBot' },
    text:       'Hola agente',
    ...overrides,
  }
}

function makeReqRes(body: unknown, authHeader = '') {
  const req = {
    body,
    headers: { authorization: authHeader },
  } as unknown as Request

  const res = {
    status:  jest.fn().mockReturnThis(),
    json:    jest.fn().mockReturnThis(),
    send:    jest.fn().mockReturnThis(),
  } as unknown as Response

  return { req, res }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TeamsAdapter', () => {
  let adapter: TeamsAdapter

  beforeEach(async () => {
    jest.clearAllMocks()
    adapter = new TeamsAdapter()
    await adapter.initialize('channel-config-teams-001')
    await adapter.setup(
      { mode: 'bot_framework' },
      { appId: 'test-app-id', appPassword: 'test-app-pwd' },
    )
  })

  // ── initialize y setup ───────────────────────────────────────────────────

  it('initialize() setea channelConfigId', async () => {
    const a = new TeamsAdapter()
    await a.initialize('cfg-xyz')
    expect((a as any).channelConfigId).toBe('cfg-xyz')
  })

  it('setup() llama strategy.verify()', async () => {
    expect(mockStrategy.verify).toHaveBeenCalledTimes(1)
  })

  it('getRouter() lanza si se llama antes de setup()', () => {
    const raw = new TeamsAdapter()
    expect(() => raw.getRouter()).toThrow('setup()')
  })

  // ── GET /health ───────────────────────────────────────────────────────────

  it('GET /health devuelve status ok con modo y channelConfigId', async () => {
    const router = adapter.getRouter()
    const { req, res } = makeReqRes({})

    const layer = (router as any).stack.find((l: any) =>
      l.route?.path === '/health' && l.route?.methods?.get
    )
    expect(layer).toBeDefined()

    await layer.route.stack[0].handle(req, res, jest.fn())

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status:          'ok',
        channel:         'teams',
        mode:            'bot_framework',
        channelConfigId: 'channel-config-teams-001',
      })
    )
  })

  // ── Autenticación ─────────────────────────────────────────────────────────

  it('POST /messages sin Authorization header devuelve 401', async () => {
    const { req, res } = makeReqRes(makeActivity(), '')
    const next = jest.fn()

    await (adapter as any)._verifyBotFrameworkAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('POST /messages con JWT con appid incorrecto devuelve 401', async () => {
    const header  = Buffer.from('{"alg":"RS256"}').toString('base64url')
    const payload = Buffer.from('{"appid":"wrong-app-id"}').toString('base64url')
    const token   = `${header}.${payload}.fakesig`

    const { req, res } = makeReqRes(makeActivity(), `Bearer ${token}`)
    const next = jest.fn()

    await (adapter as any)._verifyBotFrameworkAuth(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('POST /messages con JWT correcto llama next()', async () => {
    const header  = Buffer.from('{"alg":"RS256"}').toString('base64url')
    const payload = Buffer.from('{"appid":"test-app-id"}').toString('base64url')
    const token   = `${header}.${payload}.fakesig`

    const { req, res } = makeReqRes(makeActivity(), `Bearer ${token}`)
    const next = jest.fn()

    await (adapter as any)._verifyBotFrameworkAuth(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  // ── Manejo de Activity 'message' ──────────────────────────────────────────

  it('_handleActivity message: responde 200 y emite IncomingMessage normalizado', async () => {
    const emitSpy      = jest.spyOn(adapter as any, 'emit').mockResolvedValue(undefined)
    const activity     = makeActivity()
    const { req, res } = makeReqRes(activity)

    await (adapter as any)._handleActivity(req, res)

    expect(res.status).toHaveBeenCalledWith(200)

    // Esperar el background emit
    await new Promise((r) => setTimeout(r, 50))

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        channelConfigId: 'channel-config-teams-001',
        channelType:     'teams',
        externalId:      'conv-001',
        senderId:        'aad-obj-001',
        text:            'Hola agente',
        type:            'text',
        msgId:           'act-test-001',
        metadata:        expect.objectContaining({
          serviceUrl: 'https://smba.trafficmanager.net/teams',
          tenantId:   'tenant-001',
        }),
      })
    )
  })

  it('_handleActivity message vacío: responde 200 sin llamar emit()', async () => {
    const emitSpy      = jest.spyOn(adapter as any, 'emit').mockResolvedValue(undefined)
    const activity     = makeActivity({ text: '   ' })
    const { req, res } = makeReqRes(activity)

    await (adapter as any)._handleActivity(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    await new Promise((r) => setTimeout(r, 50))
    expect(emitSpy).not.toHaveBeenCalled()
  })

  it('_handleActivity conversationUpdate: responde 200 sin emit()', async () => {
    const emitSpy      = jest.spyOn(adapter as any, 'emit').mockResolvedValue(undefined)
    const activity     = makeActivity({ type: 'conversationUpdate', text: undefined })
    const { req, res } = makeReqRes(activity)

    await (adapter as any)._handleActivity(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(emitSpy).not.toHaveBeenCalled()
  })

  it('_handleActivity invoke: responde 200 con JSON vacío', async () => {
    const activity     = makeActivity({ type: 'invoke', text: undefined })
    const { req, res } = makeReqRes(activity)

    await (adapter as any)._handleActivity(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({})
  })

  it('_handleActivity sin type: responde 400', async () => {
    const { req, res } = makeReqRes({ noType: true })

    await (adapter as any)._handleActivity(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  // ── send() ────────────────────────────────────────────────────────────────

  it('send() llama strategy.send con payload correcto', async () => {
    await adapter.send({
      externalId: 'conv-001',
      text:       'Respuesta del agente',
      metadata:   { serviceUrl: 'https://smba.trafficmanager.net/teams' },
    })

    expect(mockStrategy.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'message' }),
      'conv-001',
      'https://smba.trafficmanager.net/teams',
    )
  })

  it('send() con richContent tipo card genera Adaptive Card', async () => {
    await adapter.send({
      externalId: 'conv-001',
      text:       'Fallback',
      richContent: {
        type: 'card',
        card: {
          title:    'Tarjeta de prueba',
          subtitle: 'Subtítulo',
          buttons:  [{ label: 'OK', payload: 'ok' }],
        },
      },
      metadata: { serviceUrl: 'https://smba.trafficmanager.net/teams' },
    })

    const [payloadArg] = mockStrategy.send.mock.calls[0]!
    expect(payloadArg.attachments).toBeDefined()
    expect(payloadArg.attachments![0].contentType).toBe(
      'application/vnd.microsoft.card.adaptive'
    )
  })

  it('send() con richContent tipo quick_replies genera card con botones', async () => {
    await adapter.send({
      externalId: 'conv-001',
      text:       'Fallback',
      richContent: {
        type:    'quick_replies',
        replies: [{ label: 'Opción A', payload: 'a' }, { label: 'Opción B', payload: 'b' }],
      },
      metadata: { serviceUrl: 'https://smba.trafficmanager.net/teams' },
    })

    const [payloadArg] = mockStrategy.send.mock.calls[0]!
    expect(payloadArg.attachments).toBeDefined()
  })

  it('send() sin richContent usa buildAdaptiveTextCard', async () => {
    await adapter.send({
      externalId: 'conv-001',
      text:       'Texto plano simple',
      metadata:   { serviceUrl: 'https://smba.trafficmanager.net/teams' },
    })

    const [payloadArg] = mockStrategy.send.mock.calls[0]!
    expect(payloadArg.attachments).toHaveLength(1)
  })

  // ── dispose ───────────────────────────────────────────────────────────────

  it('dispose() resuelve sin errores', async () => {
    await expect(adapter.dispose()).resolves.toBeUndefined()
  })

  // ── mode incoming_webhook: POST /messages devuelve 400 ───────────────────

  it('incoming_webhook: POST /messages devuelve 400 con mensaje explicativo', async () => {
    jest.resetAllMocks()
    const webhookStrategy = { ...mockStrategy, mode: 'incoming_webhook' as const }
    const { createTeamsModeStrategy: mockFactory } = jest.requireMock('../index.js') as any
    mockFactory.mockReturnValue(webhookStrategy)

    const wAdapter = new TeamsAdapter()
    await wAdapter.initialize('cfg-wh-001')
    await wAdapter.setup({ mode: 'incoming_webhook' }, { webhookUrl: 'https://company.webhook.office.com/fake' })

    const router = wAdapter.getRouter()
    const postLayer = (router as any).stack.find((l: any) =>
      l.route?.path === '/messages' && l.route?.methods?.post
    )
    expect(postLayer).toBeDefined()

    const { req, res } = makeReqRes(makeActivity())
    await postLayer.route.stack[0].handle(req, res, jest.fn())

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Incoming Webhook') })
    )
  })
})
