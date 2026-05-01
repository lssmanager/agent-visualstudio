/**
 * discord.e2e-spec.ts — [F3a-30]
 *
 * Tests E2E del flujo Discord:
 *   Webhook HTTP → DiscordAdapter → IncomingMessage
 *   → MessageDispatcher → AgentExecutor (mock)
 *   → sendFollowup / sendToChannel → respuesta Discord API (fetch mock)
 *
 * Estrategia de mocking:
 *   - fetch global: mockeado con jest.spyOn para capturar llamadas a Discord API
 *   - IAgentExecutor: jest.fn() que devuelve respuesta configurable
 *   - Ed25519 signature: DiscordAdapter._verifySignature mockeado a true
 *   - Prisma: NO se usa en estos tests (no hay BD)
 *
 * Estructura de suites:
 *   1. Ping de Discord (type=1)
 *   2. Slash command /ask (http mode — webhook type=2)
 *   3. Slash command /status (http mode — webhook type=2)
 *   4. Componente interactivo — botón (http mode — webhook type=3)
 *   5. sendToChannel — respuesta proactiva
 *   6. MessageDispatcher — errores y edge cases
 *   7. Edge cases de DiscordAdapter
 */

import { EventEmitter }      from 'node:events'
import express               from 'express'
import request               from 'supertest'

import { DiscordAdapter }    from '../../channels/discord.adapter.js'
import { MessageDispatcher } from '../../message-dispatcher.service.js'
import type {
  IAgentExecutor,
  DispatchInput,
  DispatchSuccess,
  DispatchFailure,
}                            from '../../message-dispatcher.types.js'
import type { IncomingMessage } from '../../channels/channel-adapter.interface.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_BOT_TOKEN   = 'Bot_fake_token_for_tests'
const FAKE_APP_ID      = '111111111111111111'
const FAKE_GUILD_ID    = '222222222222222222'
const FAKE_CHANNEL_ID  = '333333333333333333'
const FAKE_USER_ID     = '444444444444444444'
const FAKE_INT_TOKEN   = 'fake_interaction_token_xyz'
const FAKE_CHANNEL_CFG = 'channel-config-uuid-test'
const FAKE_AGENT_ID    = 'agent-uuid-test'
const FAKE_SESSION_ID  = 'session-test-001'

/** Crea un body de interacción tipo APPLICATION_COMMAND (type=2) */
function makeSlashInteraction(commandName: string, optionValue?: string) {
  return {
    id:             '555555555555555555',
    type:           2,
    token:          FAKE_INT_TOKEN,
    application_id: FAKE_APP_ID,
    guild_id:       FAKE_GUILD_ID,
    channel_id:     FAKE_CHANNEL_ID,
    member: {
      user: {
        id:            FAKE_USER_ID,
        username:      'testuser',
        discriminator: '0001',
        global_name:   'Test User',
      },
    },
    data: {
      id:      '666666666666666666',
      name:    commandName,
      options: optionValue
        ? [{ name: 'question', type: 3, value: optionValue }]
        : [],
    },
  }
}

/** Crea un body de interacción tipo MESSAGE_COMPONENT (type=3) — botón */
function makeButtonInteraction(customId: string) {
  return {
    id:             '777777777777777777',
    type:           3,
    token:          FAKE_INT_TOKEN,
    application_id: FAKE_APP_ID,
    guild_id:       FAKE_GUILD_ID,
    channel_id:     FAKE_CHANNEL_ID,
    member: {
      user: {
        id:            FAKE_USER_ID,
        username:      'testuser',
        discriminator: '0001',
        global_name:   'Test User',
      },
    },
    data: {
      custom_id:      customId,
      component_type: 2,  // BUTTON
    },
  }
}

/** Crea un DispatchInput válido con la firma real del tipo */
function makeDispatchInput(overrides: Partial<DispatchInput> = {}): DispatchInput {
  return {
    sessionId:       FAKE_SESSION_ID,
    agentId:         FAKE_AGENT_ID,
    channelConfigId: FAKE_CHANNEL_CFG,
    externalUserId:  FAKE_USER_ID,
    history: [
      { role: 'user', content: '¿Cuál es el estado del proyecto?' },
    ],
    ...overrides,
  }
}

// ── Harness compartido ───────────────────────────────────────────────────────────

async function buildTestHarness(agentReply = 'Respuesta del agente de prueba') {
  // Mock global de fetch — simula Discord API respondiendo OK
  const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
    async (url: RequestInfo | URL) => {
      const urlStr = typeof url === 'string' ? url : (url as URL).toString()
      if (urlStr.includes('discord.com/api')) {
        return new Response(JSON.stringify({ id: 'mock_message_id' }), {
          status:  200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`fetch no mockeada para URL: ${urlStr}`)
    },
  )

  // AgentExecutor mock
  const mockExecutor: IAgentExecutor = {
    run: jest.fn().mockResolvedValue({ reply: agentReply }),
  }

  // DiscordAdapter en modo http
  const adapter = new DiscordAdapter()
  adapter.initialize(FAKE_CHANNEL_CFG)

  // Mockear verificación de firma para que siempre pase
  jest.spyOn(adapter as any, '_verifySignature').mockReturnValue(true)

  await adapter.setup(
    { applicationId: FAKE_APP_ID, guildId: FAKE_GUILD_ID },
    { botToken: FAKE_BOT_TOKEN, publicKey: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899' },
    'http',
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
  app.use('/discord', adapter.buildHttpRouter())

  // Capturar IncomingMessages
  const capturedMessages: IncomingMessage[] = []
  adapter.onMessage((msg) => capturedMessages.push(msg))

  return { adapter, dispatcher, mockExecutor, fetchSpy, app, capturedMessages }
}

// ── Suite 1: Ping de Discord ─────────────────────────────────────────────────

describe('Discord E2E — Ping (type=1)', () => {
  let harness: Awaited<ReturnType<typeof buildTestHarness>>

  beforeEach(async () => { harness = await buildTestHarness() })
  afterEach(async () => { jest.restoreAllMocks(); await harness.adapter.dispose() })

  it('responde { type: 1 } al ping de verificación de Discord', async () => {
    const res = await request(harness.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send({ type: 1 })
      .expect(200)

    expect(res.body).toEqual({ type: 1 })
  })

  it('no emite IncomingMessage en un ping (type=1)', async () => {
    await request(harness.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send({ type: 1 })

    expect(harness.capturedMessages).toHaveLength(0)
  })
})

// ── Suite 2: Slash command /ask ───────────────────────────────────────────────

describe('Discord E2E — Slash command /ask', () => {
  let harness: Awaited<ReturnType<typeof buildTestHarness>>

  beforeEach(async () => { harness = await buildTestHarness('El proyecto está en fase F3a.') })
  afterEach(async () => { jest.restoreAllMocks(); await harness.adapter.dispose() })

  it('emite IncomingMessage con type=command y text correcto', async () => {
    const body = makeSlashInteraction('ask', '¿cuál es el estado?')

    await request(harness.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(body)
      .expect(200)

    expect(harness.capturedMessages).toHaveLength(1)
    const msg = harness.capturedMessages[0]!
    expect(msg.channelType).toBe('discord')
    expect(msg.channelConfigId).toBe(FAKE_CHANNEL_CFG)
    expect(msg.externalId).toBe(FAKE_CHANNEL_ID)
    expect(msg.senderId).toBe(FAKE_USER_ID)
    expect(msg.type).toBe('command')
    expect(msg.text).toContain('¿cuál es el estado?')
    expect(msg.metadata?.['interactionToken']).toBe(FAKE_INT_TOKEN)
    expect(msg.metadata?.['guildId']).toBe(FAKE_GUILD_ID)
  })

  it('responde inmediatamente con ACK type=5 (DEFERRED_CHANNEL_MESSAGE)', async () => {
    const body = makeSlashInteraction('ask', 'pregunta de prueba')

    const res = await request(harness.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(body)
      .expect(200)

    expect(res.body).toEqual({ type: 5 })
  })

  it('dispatcher.dispatch() retorna ok:true con la respuesta del agente', async () => {
    const result = await harness.dispatcher.dispatch(
      makeDispatchInput({ history: [{ role: 'user', content: '¿cuántas fases hay?' }] }),
    )

    expect(result.ok).toBe(true)
    const success = result as DispatchSuccess
    expect(success.reply).toBe('El proyecto está en fase F3a.')
    expect(success.attempts).toBe(1)
    expect(typeof success.durationMs).toBe('number')
  })

  it('AgentExecutor recibe agentId y history correctos', async () => {
    await harness.dispatcher.dispatch(
      makeDispatchInput({ history: [{ role: 'user', content: '¿cuántas fases hay?' }] }),
    )

    expect(harness.mockExecutor.run).toHaveBeenCalledWith(
      FAKE_AGENT_ID,
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: '¿cuántas fases hay?' }),
      ]),
    )
  })

  it('sendFollowup llama PATCH al endpoint correcto de Discord', async () => {
    const { sendFollowup } = await import('../../channels/discord.reply.js')

    const result = await sendFollowup({
      botToken:         FAKE_BOT_TOKEN,
      applicationId:    FAKE_APP_ID,
      interactionToken: FAKE_INT_TOKEN,
      text:             'Respuesta del agente',
    })

    expect(result.ok).toBe(true)
    expect(harness.fetchSpy).toHaveBeenCalledWith(
      `https://discord.com/api/v10/webhooks/${FAKE_APP_ID}/${FAKE_INT_TOKEN}/messages/@original`,
      expect.objectContaining({
        method:  'PATCH',
        headers: expect.objectContaining({
          Authorization: `Bot ${FAKE_BOT_TOKEN}`,
        }),
      }),
    )
  })

  it('sendFollowup con richContent incluye embed en el body', async () => {
    const { sendFollowup } = await import('../../channels/discord.reply.js')

    const spy = harness.fetchSpy
    spy.mockClear()

    await sendFollowup({
      botToken:         FAKE_BOT_TOKEN,
      applicationId:    FAKE_APP_ID,
      interactionToken: FAKE_INT_TOKEN,
      text:             'Resultado del análisis',
      richContent: {
        title:       'Estado del sistema',
        description: 'Todo funciona correctamente',
        color:       0x57F287,
      },
    })

    const patchCall = spy.mock.calls.find(([url]) =>
      url.toString().includes('/messages/@original')
    )
    expect(patchCall).toBeDefined()
    const sentBody = JSON.parse((patchCall![1] as RequestInit).body as string)
    expect(sentBody.embeds).toHaveLength(1)
    expect(sentBody.embeds[0].title).toBe('Estado del sistema')
    expect(sentBody.embeds[0].description).toBe('Todo funciona correctamente')
    expect(sentBody.embeds[0].color).toBe(0x57F287)
  })
})

// ── Suite 3: Slash command /status ─────────────────────────────────────────────

describe('Discord E2E — Slash command /status', () => {
  let harness: Awaited<ReturnType<typeof buildTestHarness>>

  beforeEach(async () => { harness = await buildTestHarness() })
  afterEach(async () => { jest.restoreAllMocks(); await harness.adapter.dispose() })

  it('emite IncomingMessage con text que contiene "status"', async () => {
    const body = makeSlashInteraction('status')

    await request(harness.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(body)
      .expect(200)

    expect(harness.capturedMessages).toHaveLength(1)
    const msg = harness.capturedMessages[0]!
    expect(msg.text.toLowerCase()).toContain('status')
    expect(msg.type).toBe('command')
    expect(msg.channelType).toBe('discord')
  })

  it('responde ACK type=5 inmediatamente para /status', async () => {
    const body = makeSlashInteraction('status')

    const res = await request(harness.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(body)
      .expect(200)

    expect(res.body).toEqual({ type: 5 })
  })

  it('incluye interactionToken en metadata del IncomingMessage', async () => {
    const body = makeSlashInteraction('status')
    await request(harness.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(body)

    const msg = harness.capturedMessages[0]!
    expect(msg.metadata?.['interactionToken']).toBe(FAKE_INT_TOKEN)
  })
})

// ── Suite 4: Componente interactivo — botón ───────────────────────────────────

describe('Discord E2E — Componente interactivo (botón)', () => {
  let harness: Awaited<ReturnType<typeof buildTestHarness>>

  beforeEach(async () => { harness = await buildTestHarness('Acción ejecutada correctamente') })
  afterEach(async () => { jest.restoreAllMocks(); await harness.adapter.dispose() })

  it('emite IncomingMessage con text = custom_id del botón', async () => {
    const body = makeButtonInteraction('action:confirm:run-123')

    await request(harness.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(body)
      .expect(200)

    expect(harness.capturedMessages).toHaveLength(1)
    const msg = harness.capturedMessages[0]!
    expect(msg.text).toBe('action:confirm:run-123')
    expect(msg.type).toBe('command')
    expect(msg.metadata?.['subtype']).toBe('button_click')
    expect(msg.metadata?.['interactionToken']).toBe(FAKE_INT_TOKEN)
  })

  it('responde ACK type=6 (DEFERRED_UPDATE_MESSAGE) para componentes', async () => {
    const body = makeButtonInteraction('action:cancel')

    const res = await request(harness.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(body)
      .expect(200)

    expect(res.body).toEqual({ type: 6 })
  })

  it('registra senderId y channelId correctamente para botón', async () => {
    const body = makeButtonInteraction('btn:ok')
    await request(harness.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(body)

    const msg = harness.capturedMessages[0]!
    expect(msg.senderId).toBe(FAKE_USER_ID)
    expect(msg.externalId).toBe(FAKE_CHANNEL_ID)
  })
})

// ── Suite 5: sendToChannel — respuesta proactiva ────────────────────────────

describe('Discord E2E — sendToChannel (respuesta proactiva)', () => {
  let fetchSpy: jest.SpyInstance

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'new_message_id' }), {
        status:  200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  afterEach(() => jest.restoreAllMocks())

  it('llama POST /channels/:id/messages con el texto correcto', async () => {
    const { sendToChannel } = await import('../../channels/discord.reply.js')

    const result = await sendToChannel({
      botToken:  FAKE_BOT_TOKEN,
      channelId: FAKE_CHANNEL_ID,
      text:      'Notificación proactiva del agente',
    })

    expect(result.ok).toBe(true)
    expect(result.chunks).toBe(1)
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://discord.com/api/v10/channels/${FAKE_CHANNEL_ID}/messages`,
      expect.objectContaining({ method: 'POST' }),
    )

    const sentBody = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string)
    expect(sentBody.content).toBe('Notificación proactiva del agente')
  })

  it('hace chunking correcto para mensajes > 2000 chars', async () => {
    const { sendToChannel } = await import('../../channels/discord.reply.js')
    const longText = 'a'.repeat(2200)

    const result = await sendToChannel({
      botToken:  FAKE_BOT_TOKEN,
      channelId: FAKE_CHANNEL_ID,
      text:      longText,
    })

    expect(result.ok).toBe(true)
    expect(result.chunks).toBeGreaterThan(1)
    for (const call of fetchSpy.mock.calls) {
      const body = JSON.parse((call[1] as RequestInit).body as string)
      if (body.content) {
        expect(body.content.length).toBeLessThanOrEqual(2000)
      }
    }
  })

  it('adjunta embed solo al último chunk cuando hay richContent', async () => {
    const { sendToChannel } = await import('../../channels/discord.reply.js')
    const longText = 'palabra '.repeat(300)  // ~2400 chars → 2 chunks

    await sendToChannel({
      botToken:    FAKE_BOT_TOKEN,
      channelId:   FAKE_CHANNEL_ID,
      text:        longText,
      richContent: { title: 'Resumen', description: 'Análisis completado' },
    })

    const calls = fetchSpy.mock.calls
    expect(calls.length).toBeGreaterThan(1)

    // Solo el último chunk tiene embeds
    const lastBody = JSON.parse((calls[calls.length - 1]![1] as RequestInit).body as string)
    expect(lastBody.embeds).toBeDefined()
    expect(lastBody.embeds[0].title).toBe('Resumen')

    // Los chunks anteriores NO tienen embeds
    for (let i = 0; i < calls.length - 1; i++) {
      const body = JSON.parse((calls[i]![1] as RequestInit).body as string)
      expect(body.embeds).toBeUndefined()
    }
  })

  it('devuelve { ok: false, error } cuando Discord API responde 403', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('{"message": "Missing Access"}', {
        status:  403,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const { sendToChannel } = await import('../../channels/discord.reply.js')
    const result = await sendToChannel({
      botToken:  FAKE_BOT_TOKEN,
      channelId: FAKE_CHANNEL_ID,
      text:      'Mensaje que fallará',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('403')
  })

  it('devuelve { ok: false } en error de red', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const { sendToChannel } = await import('../../channels/discord.reply.js')
    const result = await sendToChannel({
      botToken:  FAKE_BOT_TOKEN,
      channelId: FAKE_CHANNEL_ID,
      text:      'Hi',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('ECONNREFUSED')
  })
})

// ── Suite 6: MessageDispatcher — errores y edge cases ───────────────────────

describe('Discord E2E — MessageDispatcher error handling', () => {
  afterEach(() => jest.restoreAllMocks())

  it('devuelve { ok:false, errorKind:"timeout" } cuando AgentExecutor se demora', async () => {
    const slowExecutor: IAgentExecutor = {
      run: jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ reply: 'tarde' }), 10_000)),
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
    const notFoundExecutor: IAgentExecutor = {
      run: jest.fn().mockRejectedValue(new Error('Agent not found — 404')),
    }
    const dispatcher = new MessageDispatcher(notFoundExecutor, {
      timeoutMs:   5_000,
      maxAttempts: 1,
    })

    const result = await dispatcher.dispatch(
      makeDispatchInput({ agentId: 'nonexistent-agent' }),
    )

    expect(result.ok).toBe(false)
    const fail = result as DispatchFailure
    expect(['agent_error', 'transient', 'unknown']).toContain(fail.errorKind)
  })

  it('reintenta en errores transitorios hasta maxAttempts y tiene éxito', async () => {
    const flakyExecutor: IAgentExecutor = {
      run: jest.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED — network error'))
        .mockResolvedValueOnce({ reply: 'segundo intento exitoso' }),
    }
    const dispatcher = new MessageDispatcher(flakyExecutor, {
      timeoutMs:    5_000,
      maxAttempts:  2,
      retryDelayMs: 50,
    })

    const result = await dispatcher.dispatch(makeDispatchInput())

    expect(result.ok).toBe(true)
    const success = result as DispatchSuccess
    expect(success.reply).toBe('segundo intento exitoso')
    expect(success.attempts).toBe(2)
    expect(flakyExecutor.run).toHaveBeenCalledTimes(2)
  })

  it('emite evento dispatch:success con metadata correcta', async () => {
    const executor: IAgentExecutor = {
      run: jest.fn().mockResolvedValue({ reply: 'ok' }),
    }
    const dispatcher = new MessageDispatcher(executor)
    const successEvents: unknown[] = []
    dispatcher.on('dispatch:success', (e) => successEvents.push(e))

    await dispatcher.dispatch(makeDispatchInput({ sessionId: 'session-events' }))

    expect(successEvents).toHaveLength(1)
    const ev = successEvents[0] as Record<string, unknown>
    expect(ev['sessionId']).toBe('session-events')
    expect(ev['agentId']).toBe(FAKE_AGENT_ID)
    expect(ev['channelConfigId']).toBe(FAKE_CHANNEL_CFG)
    expect(ev['attempts']).toBe(1)
  })

  it('emite evento dispatch:error cuando falla definitivamente', async () => {
    const executor: IAgentExecutor = {
      run: jest.fn().mockRejectedValue(new Error('fatal error')),
    }
    const dispatcher = new MessageDispatcher(executor, { maxAttempts: 1 })
    const errorEvents: unknown[] = []
    dispatcher.on('dispatch:error', (e) => errorEvents.push(e))

    await dispatcher.dispatch(makeDispatchInput({ sessionId: 'session-error-event' }))

    expect(errorEvents).toHaveLength(1)
    const ev = errorEvents[0] as Record<string, unknown>
    expect(typeof ev['errorKind']).toBe('string')
    expect(ev['attempts']).toBe(1)
  })
})

// ── Suite 7: Edge cases de DiscordAdapter ────────────────────────────────────────

describe('Discord E2E — DiscordAdapter edge cases', () => {
  let harness: Awaited<ReturnType<typeof buildTestHarness>>

  beforeEach(async () => { harness = await buildTestHarness() })
  afterEach(async () => { jest.restoreAllMocks(); await harness.adapter.dispose() })

  it('retorna 401 cuando la firma Ed25519 es inválida', async () => {
    // Usar un adapter con _verifySignature real (no mockeada)
    jest.restoreAllMocks()

    const adapter2 = new DiscordAdapter()
    adapter2.initialize(FAKE_CHANNEL_CFG)
    await adapter2.setup(
      { applicationId: FAKE_APP_ID },
      { botToken: FAKE_BOT_TOKEN, publicKey: 'aabbccdd' },  // clave falsa
      'http',
    )

    const app2 = express()
    app2.use(express.json())
    app2.use('/discord', adapter2.buildHttpRouter())

    const res = await request(app2)
      .post('/discord')
      .set('x-signature-ed25519',  'invalidsignature')
      .set('x-signature-timestamp', '1234567890')
      .send({ type: 1 })
      .expect(401)

    expect(res.body.error).toContain('signature')
    await adapter2.dispose()
  })

  it('retorna 400 para tipos de interacción desconocidos', async () => {
    const res = await request(harness.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send({ type: 99 })
      .expect(400)

    expect(res.body.error).toBeDefined()
  })

  it('no emite IncomingMessage si falta channel_id en la interacción', async () => {
    const bodyWithoutChannel = {
      id:    '888888888888888888',
      type:  2,
      token: FAKE_INT_TOKEN,
      member: { user: { id: FAKE_USER_ID, username: 'test' } },
      data:  { name: 'ask', options: [] },
      // channel_id: OMITIDO — el adapter no puede enrutar
    }

    await request(harness.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(bodyWithoutChannel)
      .expect(200)

    expect(harness.capturedMessages).toHaveLength(0)
  })

  it('dispose() limpia el adapter sin errores', async () => {
    await expect(harness.adapter.dispose()).resolves.not.toThrow()
  })

  it('onError() registra el handler de errores sin lanzar', () => {
    const errorHandler = jest.fn()
    expect(() => harness.adapter.onError(errorHandler)).not.toThrow()
  })
})
