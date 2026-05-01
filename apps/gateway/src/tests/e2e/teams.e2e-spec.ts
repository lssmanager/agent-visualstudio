/**
 * teams.e2e-spec.ts — [F3a-27] Tests E2E del canal Microsoft Teams
 *
 * Valida:
 *   ✅ Actividad 'message' con bot_framework → emit() llamado → respuesta enviada
 *   ✅ Actividad 'message' en modo incoming_webhook → responde 400 informativo
 *   ✅ Actividad tipo 'invoke' (Teams health check) → responde 200 {}
 *   ✅ Actividad 'conversationUpdate' → responde 200 sin emitir al agente
 *   ✅ Actividad sin 'type' → responde 400
 *   ✅ Autenticación Bot Framework: Bearer token con appId incorrecto → 401
 *   ✅ Autenticación Bot Framework: Bearer token malformado → 401
 *   ✅ Autenticación Bot Framework: sin Bearer → 401
 *   ✅ Token válido (appId correcto) → procesa actividad normalmente
 *   ✅ send() con serviceUrl → delega a strategy.send()
 *   ✅ send() sin serviceUrl → error controlado (no lanza excepción)
 *   ✅ GET /health → status ok + mode + channelConfigId
 *   ✅ POST /messages en modo incoming_webhook → 400 con mensaje explicativo
 *   ✅ Error en emit() → strategy.send() llamado con mensaje de error (no crash)
 */

import express, { Application } from 'express'
import request from 'supertest'
import { TeamsAdapter } from '../../channels/teams/teams-bot.adapter.js'
import type {
  ITeamsModeStrategy,
  TeamsActivity,
  TeamsOutgoingPayload,
  TeamsSendResult,
} from '../../channels/teams/teams-mode.strategy.js'
import type { OutgoingMessage } from '../../channels/channel-adapter.interface.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Construye un JWT mínimo (sin firma real) con el appId indicado.
 * Solo para tests de la verificación _verifyBotFrameworkAuth.
 */
function buildFakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const body   = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig    = Buffer.from('fakesignature').toString('base64url')
  return `${header}.${body}.${sig}`
}

function makeActivity(overrides: Partial<TeamsActivity> = {}): TeamsActivity {
  return {
    type:       'message',
    id:         'act-001',
    timestamp:  new Date().toISOString(),
    serviceUrl: 'https://smba.trafficmanager.net/amer/',
    channelId:  'msteams',
    from: {
      id:          'user-aad-001',
      name:        'Test User',
      aadObjectId: 'aad-001',
    },
    conversation: {
      id:       'conv-001',
      tenantId: 'tenant-001',
      isGroup:  false,
    },
    recipient: {
      id:   'bot-app-id',
      name: 'TestBot',
    },
    text: 'Hola agente',
    channelData: {
      tenant:  { id: 'tenant-001' },
      team:    { id: 'team-001', name: 'Dev Team' },
      channel: { id: 'ch-001',   name: 'general' },
    },
    ...overrides,
  }
}

// ── Mock strategy factory ─────────────────────────────────────────────────────

function makeMockStrategy(
  mode:  'bot_framework' | 'incoming_webhook' = 'bot_framework',
  appId = 'test-app-id',
): { strategy: ITeamsModeStrategy; sendMock: jest.Mock } {
  const sendMock = jest
    .fn<Promise<TeamsSendResult>, [TeamsOutgoingPayload, string, string?]>()
    .mockResolvedValue({ ok: true, activityId: 'sent-act-001' })

  const strategy: ITeamsModeStrategy = {
    mode,
    send:   sendMock,
    verify: jest.fn().mockResolvedValue({ ok: true }),
    buildTextCard: jest.fn().mockImplementation((text: string) => ({
      contentType: 'application/vnd.microsoft.card.adaptive',
      content:     { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text }] },
    })),
    ...(mode === 'bot_framework'
      ? { getBearerToken: jest.fn().mockResolvedValue('fake-bearer-token') }
      : {}),
  }

  // Exponer appId para referencia interna en tests
  ;(strategy as unknown as Record<string, unknown>)['_appId'] = appId

  return { strategy, sendMock }
}

// ── App factory para tests ────────────────────────────────────────────────────

async function buildTestApp(
  mode:  'bot_framework' | 'incoming_webhook' = 'bot_framework',
  appId = 'test-app-id',
): Promise<{
  app:        Application
  adapter:    TeamsAdapter
  sendMock:   jest.Mock
  emitEvents: TeamsActivity[]
}> {
  const { strategy, sendMock } = makeMockStrategy(mode, appId)
  const emitEvents: TeamsActivity[] = []

  const adapter = new TeamsAdapter({ routePrefix: '/teams' })
  await adapter.initialize('channel-config-001')

  // Inyectar dependencias mock sin pasar por setup() que haría fetch a Azure
  const adapterAny = adapter as unknown as Record<string, unknown>
  adapterAny['strategy'] = strategy
  adapterAny['config']   = { mode, agentTimeoutMs: 5_000 }
  adapterAny['secrets']  = { appId, appPassword: 'test-password' }
  adapterAny['router']   =
    (adapter as unknown as { _buildRouter(): unknown })['_buildRouter']()

  // Capturar IncomingMessages emitidos al agente
  adapter.on('message', (msg: unknown) => {
    emitEvents.push(
      (msg as { rawPayload: TeamsActivity }).rawPayload,
    )
  })

  const app = express()
  app.use(express.json())
  app.use('/teams', adapter.getRouter())

  return { app, adapter, sendMock, emitEvents }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

describe('TeamsAdapter — E2E', () => {

  // ── Healthcheck ──────────────────────────────────────────────────────────────

  describe('GET /teams/health', () => {
    it('devuelve status ok, channel, mode y channelConfigId', async () => {
      const { app } = await buildTestApp('bot_framework')

      const res = await request(app).get('/teams/health')

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({
        status:          'ok',
        channel:         'teams',
        mode:            'bot_framework',
        channelConfigId: 'channel-config-001',
      })
      expect(res.body.timestamp).toBeDefined()
    })

    it('refleja mode incoming_webhook cuando está configurado así', async () => {
      const { app } = await buildTestApp('incoming_webhook')

      const res = await request(app).get('/teams/health')

      expect(res.status).toBe(200)
      expect(res.body.mode).toBe('incoming_webhook')
    })
  })

  // ── Modo incoming_webhook: POST /messages ─────────────────────────────────────

  describe('POST /teams/messages — modo incoming_webhook', () => {
    it('responde 400 con mensaje explicativo (canal de solo envío)', async () => {
      const { app } = await buildTestApp('incoming_webhook')

      const res = await request(app)
        .post('/teams/messages')
        .send(makeActivity())

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/incoming.webhook/i)
      expect(res.body.error).toMatch(/bot_framework/i)
    })
  })

  // ── Autenticación Bot Framework ───────────────────────────────────────────────

  describe('POST /teams/messages — autenticación JWT Bot Framework', () => {
    it('rechaza petición sin header Authorization → 401', async () => {
      const { app } = await buildTestApp('bot_framework', 'test-app-id')

      const res = await request(app)
        .post('/teams/messages')
        .send(makeActivity())

      expect(res.status).toBe(401)
      expect(res.body.error).toMatch(/bearer/i)
    })

    it('rechaza JWT con appId incorrecto → 401', async () => {
      const { app } = await buildTestApp('bot_framework', 'test-app-id')
      const jwt = buildFakeJwt({ appid: 'wrong-app-id', iat: Date.now() })

      const res = await request(app)
        .post('/teams/messages')
        .set('Authorization', `Bearer ${jwt}`)
        .send(makeActivity())

      expect(res.status).toBe(401)
      expect(res.body.error).toMatch(/appid/i)
    })

    it('rechaza JWT con formato inválido (no 3 partes) → 401', async () => {
      const { app } = await buildTestApp('bot_framework', 'test-app-id')

      const res = await request(app)
        .post('/teams/messages')
        .set('Authorization', 'Bearer solamente.dos')
        .send(makeActivity())

      expect(res.status).toBe(401)
      expect(res.body.error).toMatch(/invalid jwt/i)
    })

    it('acepta JWT con appId correcto → procesa actividad y emite al agente', async () => {
      const { app, emitEvents } = await buildTestApp('bot_framework', 'test-app-id')
      const jwt = buildFakeJwt({ appid: 'test-app-id', iat: Date.now() })

      const res = await request(app)
        .post('/teams/messages')
        .set('Authorization', `Bearer ${jwt}`)
        .send(makeActivity({ text: 'mensaje válido' }))

      // Teams responde 200 inmediatamente; el agente se procesa en background
      expect(res.status).toBe(200)

      // Esperar procesamiento asíncrono
      await new Promise((r) => setTimeout(r, 80))
      expect(emitEvents.length).toBeGreaterThan(0)
      expect(emitEvents[0]!.text).toBe('mensaje válido')
    })
  })

  // ── Procesamiento de Activities ───────────────────────────────────────────────

  describe('POST /teams/messages — routing de Activity types', () => {
    async function postWithAuth(
      app:      Application,
      activity: Partial<TeamsActivity>,
      appId   = 'test-app-id',
    ) {
      const jwt = buildFakeJwt({ appid: appId })
      return request(app)
        .post('/teams/messages')
        .set('Authorization', `Bearer ${jwt}`)
        .send(makeActivity(activity))
    }

    it('type=message con texto → 200 + emit IncomingMessage al agente', async () => {
      const { app, emitEvents } = await buildTestApp()

      await postWithAuth(app, { type: 'message', text: 'Consulta importante' })
      await new Promise((r) => setTimeout(r, 80))

      expect(emitEvents.length).toBe(1)
      expect(emitEvents[0]!.text).toBe('Consulta importante')
    })

    it('type=conversationUpdate → 200, no emite al agente', async () => {
      const { app, emitEvents } = await buildTestApp()

      const res = await postWithAuth(app, { type: 'conversationUpdate', text: undefined })

      expect(res.status).toBe(200)
      await new Promise((r) => setTimeout(r, 80))
      expect(emitEvents.length).toBe(0)
    })

    it('type=invoke (Teams health check) → 200 con body {}', async () => {
      const { app } = await buildTestApp()

      const res = await postWithAuth(app, { type: 'invoke', text: undefined })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({})
    })

    it('sin type en body → 400', async () => {
      const { app } = await buildTestApp()
      const jwt = buildFakeJwt({ appid: 'test-app-id' })

      const res = await request(app)
        .post('/teams/messages')
        .set('Authorization', `Bearer ${jwt}`)
        .send({}) // body vacío, sin type

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/activity type/i)
    })

    it('type=message con texto solo espacios → 200, no emite', async () => {
      const { app, emitEvents } = await buildTestApp()

      await postWithAuth(app, { type: 'message', text: '   ' })
      await new Promise((r) => setTimeout(r, 80))

      expect(emitEvents.length).toBe(0)
    })

    it('type desconocido → 200 sin error ni crash', async () => {
      const { app } = await buildTestApp()

      const res = await postWithAuth(app, {
        type: 'unknown_custom_type' as TeamsActivity['type'],
      })

      expect(res.status).toBe(200)
    })
  })

  // ── Normalización IncomingMessage ─────────────────────────────────────────────

  describe('Normalización IncomingMessage', () => {
    it('incluye metadata correcta: serviceUrl, tenantId, teamId, channelId, senderId', async () => {
      const { app, adapter } = await buildTestApp()
      const jwt = buildFakeJwt({ appid: 'test-app-id' })

      const captured: unknown[] = []
      adapter.on('message', (msg) => captured.push(msg))

      await request(app)
        .post('/teams/messages')
        .set('Authorization', `Bearer ${jwt}`)
        .send(
          makeActivity({
            text:       'test metadata',
            serviceUrl: 'https://smba.trafficmanager.net/amer/',
            from: {
              id:          'user-raw-id',
              name:        'Test User',
              aadObjectId: 'aad-xyz',
            },
            conversation: { id: 'conv-meta-001', tenantId: 'tenant-xyz' },
            channelData: {
              tenant:  { id: 'tenant-xyz' },
              team:    { id: 'team-xyz', name: 'Engineering' },
              channel: { id: 'ch-xyz',   name: 'backend' },
            },
          }),
        )

      await new Promise((r) => setTimeout(r, 80))

      expect(captured.length).toBeGreaterThan(0)

      const msg = captured[0] as {
        channelType: string
        externalId:  string
        senderId:    string
        metadata:    Record<string, unknown>
      }

      expect(msg.channelType).toBe('teams')
      expect(msg.externalId).toBe('conv-meta-001')
      expect(msg.senderId).toBe('aad-xyz')           // aadObjectId tiene prioridad sobre id
      expect(msg.metadata.serviceUrl).toBe('https://smba.trafficmanager.net/amer/')
      expect(msg.metadata.tenantId).toBe('tenant-xyz')
      expect(msg.metadata.teamId).toBe('team-xyz')
      expect(msg.metadata.channelId).toBe('ch-xyz')
    })
  })

  // ── adapter.send() ────────────────────────────────────────────────────────────

  describe('adapter.send() — envío de respuestas al canal', () => {
    it('con serviceUrl en metadata → delega a strategy.send() con parámetros correctos', async () => {
      const { adapter, sendMock } = await buildTestApp()

      const outgoing: OutgoingMessage = {
        channelConfigId: 'channel-config-001',
        channelType:     'teams',
        externalId:      'conv-outgoing-001',
        text:            'Respuesta del agente',
        metadata: {
          serviceUrl: 'https://smba.trafficmanager.net/amer/',
          activityId: 'act-to-reply',
        },
      }

      await adapter.send(outgoing)

      expect(sendMock).toHaveBeenCalledTimes(1)
      const [payload, convId, serviceUrl] = sendMock.mock.calls[0]!
      expect(payload.type).toBe('message')
      expect(payload.attachments).toBeDefined()
      expect(convId).toBe('conv-outgoing-001')
      expect(serviceUrl).toBe('https://smba.trafficmanager.net/amer/')
    })

    it('sin serviceUrl → no lanza excepción (error manejado internamente)', async () => {
      const { adapter, sendMock } = await buildTestApp()
      sendMock.mockResolvedValueOnce({ ok: false, error: 'serviceUrl requerido' })

      const outgoing: OutgoingMessage = {
        channelConfigId: 'channel-config-001',
        channelType:     'teams',
        externalId:      'conv-001',
        text:            'Respuesta sin serviceUrl',
        metadata:        {},
      }

      await expect(adapter.send(outgoing)).resolves.toBeUndefined()
    })

    it('con richContent tipo card → Adaptive Card en attachments', async () => {
      const { adapter, sendMock } = await buildTestApp()

      await adapter.send({
        channelConfigId: 'channel-config-001',
        channelType:     'teams',
        externalId:      'conv-001',
        text:            'fallback',
        richContent: {
          type: 'card',
          card: {
            title:    'Título',
            subtitle: 'Descripción',
            buttons:  [{ label: 'Ver más', payload: 'action_ver' }],
          },
        },
        metadata: {
          serviceUrl: 'https://smba.trafficmanager.net/amer/',
        },
      })

      expect(sendMock).toHaveBeenCalledTimes(1)
      const [payload] = sendMock.mock.calls[0]!
      expect(payload.attachments).toBeDefined()
      expect(payload.attachments!.length).toBeGreaterThan(0)
      expect(payload.attachments![0]!.contentType).toBe(
        'application/vnd.microsoft.card.adaptive',
      )
    })

    it('con richContent tipo quick_replies → Adaptive Card con botones', async () => {
      const { adapter, sendMock } = await buildTestApp()

      await adapter.send({
        channelConfigId: 'channel-config-001',
        channelType:     'teams',
        externalId:      'conv-001',
        text:            'fallback',
        richContent: {
          type:    'quick_replies',
          replies: [
            { label: 'Sí', payload: 'yes' },
            { label: 'No', payload: 'no' },
          ],
        },
        metadata: { serviceUrl: 'https://smba.trafficmanager.net/amer/' },
      })

      expect(sendMock).toHaveBeenCalledTimes(1)
      const [payload] = sendMock.mock.calls[0]!
      expect(payload.attachments).toBeDefined()
    })
  })

  // ── Recuperación ante errores en emit() ───────────────────────────────────────

  describe('Recuperación ante errores en emit()', () => {
    it('si emit() lanza → strategy.send() envía mensaje de error (sin crash)', async () => {
      const { app, adapter, sendMock } = await buildTestApp()
      const jwt = buildFakeJwt({ appid: 'test-app-id' })

      // Forzar que el listener del agente lance una excepción
      adapter.removeAllListeners('message')
      adapter.on('message', () => {
        throw new Error('AgentExecutor simulado fallando')
      })

      const res = await request(app)
        .post('/teams/messages')
        .set('Authorization', `Bearer ${jwt}`)
        .send(makeActivity({ text: 'trigger error' }))

      // 200 inmediato (antes del procesamiento asíncrono)
      expect(res.status).toBe(200)

      // Dar tiempo al catch del _handleMessageActivity
      await new Promise((r) => setTimeout(r, 150))

      // strategy.send() debe haberse llamado con el mensaje de error
      expect(sendMock).toHaveBeenCalled()
      const [errorPayload] = sendMock.mock.calls[0]!
      expect(JSON.stringify(errorPayload.attachments)).toMatch(/error/i)
    })
  })

  // ── dispose() ─────────────────────────────────────────────────────────────────

  describe('dispose()', () => {
    it('resuelve sin lanzar excepción', async () => {
      const { adapter } = await buildTestApp()
      await expect(adapter.dispose()).resolves.toBeUndefined()
    })
  })
})
