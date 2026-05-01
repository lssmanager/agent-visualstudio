/**
 * [F3a-10] telegram-flow.e2e.test.ts
 *
 * Test E2E de integración de la cadena completa del gateway de Telegram.
 *
 * Cadena verificada:
 *   POST /webhook → auth → handleUpdate → handleIncoming
 *     → SessionManager (prismaMock)
 *     → AgentExecutor stub
 *     → TelegramAdapter.send() → global.fetch (interceptado)
 *
 * Sin llamadas reales a Telegram, sin BD real, sin LLM real.
 * Servidor en puerto 0 (efímero) — nunca hardcodear un puerto.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest'

import { startTestApp, type TestApp }  from './helpers/app.helper.js'
import { prismaMock }                  from './helpers/prisma.mock.js'
import {
  agentExecutorStub,
  agentExecutorTimeoutStub,
  agentExecutorTransientStub,
  resetTransientStub,
  AGENT_REPLY,
  TIMEOUT_REPLY,
} from './helpers/agent-executor.stub.js'
import {
  makeTelegramTextUpdate,
  makeTelegramCommandUpdate,
  makeTelegramCallbackQuery,
  makeTelegramPhotoUpdate,
  TELEGRAM_CHAT_ID,
  TELEGRAM_BOT_TOKEN,
  CHANNEL_CONFIG_ID,
  WEBHOOK_SECRET,
} from './helpers/telegram.fixtures.js'

// ── Intercepción global de fetch() ────────────────────────────────────────────
// Se configura UNA VEZ antes de todos los tests para evitar race conditions.
// El fetchSpy captura todas las llamadas a la Telegram Bot API.

let fetchSpy: ReturnType<typeof vi.fn>

beforeAll(() => {
  fetchSpy = vi.fn((url: string, _init?: RequestInit) => {
    if (
      typeof url === 'string' &&
      (url.includes('/sendMessage') || url.includes('/answerCallbackQuery'))
    ) {
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status:  200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }
    // Peticiones hacia localhost (el server de test)
    if (typeof url === 'string' && url.startsWith('http://127.0.0.1')) {
      // Dejar pasar peticiones internas — usar fetch real de node
      return import('node:http').then(({ request }) =>
        new Promise<Response>((resolve, reject) => {
          const u = new URL(url)
          const opts = {
            hostname: u.hostname,
            port:     u.port,
            path:     u.pathname + u.search,
            method:   (_init as RequestInit & { method?: string })?.method ?? 'GET',
            headers:  (_init as RequestInit & { headers?: Record<string, string> })?.headers ?? {},
          }
          const req = request(opts, (res) => {
            const chunks: Buffer[] = []
            res.on('data', (c: Buffer) => chunks.push(c))
            res.on('end', () => {
              const body = Buffer.concat(chunks).toString()
              resolve(new Response(body, { status: res.statusCode ?? 200 }))
            })
          })
          req.on('error', reject)
          if ((_init as RequestInit & { body?: string })?.body) {
            req.write((_init as RequestInit & { body: string }).body)
          }
          req.end()
        })
      )
    }
    return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
  })
  global.fetch = fetchSpy as unknown as typeof fetch
})

// ── App principal (agentExecutorStub) ───────────────────────────────────────────

let app: TestApp

beforeAll(async () => {
  app = await startTestApp(prismaMock, agentExecutorStub)
})

afterAll(async () => {
  await app.cleanup()
})

beforeEach(() => {
  prismaMock._reset()
  agentExecutorStub.run.mockClear()
  // Limpiar llamadas a fetchSpy excepto las de la propia infra
  fetchSpy.mockClear()
})

// ── Helper: POST al webhook ─────────────────────────────────────────────────────

function postWebhook(
  body:    unknown,
  secret = WEBHOOK_SECRET,
  baseUrl = app.baseUrl,
): Promise<Response> {
  return fetch(
    `${baseUrl}/gateway/telegram/${CHANNEL_CONFIG_ID}/webhook`,
    {
      method:  'POST',
      headers: {
        'content-type':                    'application/json',
        'x-telegram-bot-api-secret-token': secret,
      },
      body: JSON.stringify(body),
    },
  )
}

async function postWebhookJson(
  body: unknown,
  secret = WEBHOOK_SECRET,
) {
  const res = await postWebhook(body, secret)
  return { res, json: await res.json() as Record<string, unknown> }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESCRIBE 1 — Autenticación del webhook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Webhook auth', () => {
  it('secret correcto → 200 { ok: true }', async () => {
    const { res, json } = await postWebhookJson(
      makeTelegramTextUpdate('hello'),
      WEBHOOK_SECRET,
    )
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
  })

  it('secret incorrecto → 403 { ok: false }', async () => {
    const { res, json } = await postWebhookJson(
      makeTelegramTextUpdate('hello'),
      'wrong-secret',
    )
    expect(res.status).toBe(403)
    expect(json.ok).toBe(false)
  })

  it('sin header secret → 403', async () => {
    const res = await fetch(
      `${app.baseUrl}/gateway/telegram/${CHANNEL_CONFIG_ID}/webhook`,
      {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(makeTelegramTextUpdate('hello')),
      },
    )
    expect(res.status).toBe(403)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESCRIBE 2 — Flujo completo: texto normal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Flujo completo: texto normal', () => {
  it('POST payload texto → respuesta 200 ok', async () => {
    const { res, json } = await postWebhookJson(makeTelegramTextUpdate('Hola agente'))
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
  })

  it('AgentExecutor.run() fue llamado exactamente 1 vez', async () => {
    await postWebhook(makeTelegramTextUpdate('Una pregunta'))
    expect(agentExecutorStub.run).toHaveBeenCalledTimes(1)
  })

  it('AgentExecutor.run() recibió agentId correcto', async () => {
    await postWebhook(makeTelegramTextUpdate('Test agentId'))
    const [calledAgentId] = agentExecutorStub.run.mock.calls[0] as [string, unknown[]]
    expect(calledAgentId).toBe('agent-test-001')
  })

  it('AgentExecutor.run() recibió history con entry role=user y content del mensaje', async () => {
    const text = 'Mi mensaje único'
    await postWebhook(makeTelegramTextUpdate(text))
    const [, history] = agentExecutorStub.run.mock.calls[0] as [string, Array<{ role: string; content: string }>]
    expect(Array.isArray(history)).toBe(true)
    expect(history.length).toBeGreaterThanOrEqual(1)
    const userEntry = history.find((h) => h.role === 'user')
    expect(userEntry?.content).toBe(text)
  })

  it('fetch() fue llamado con URL que contiene /sendMessage', async () => {
    await postWebhook(makeTelegramTextUpdate('Test send'))
    const telegramCalls = (fetchSpy.mock.calls as Array<[string, unknown]>)
      .filter(([url]) => typeof url === 'string' && url.includes('/sendMessage'))
    expect(telegramCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('fetch() llamado con body que contiene chat_id del TELEGRAM_CHAT_ID', async () => {
    await postWebhook(makeTelegramTextUpdate('Chat id test'))
    const sendCall = (fetchSpy.mock.calls as Array<[string, { body: string }]>)
      .find(([url]) => typeof url === 'string' && url.includes('/sendMessage'))
    expect(sendCall).toBeDefined()
    const bodyParsed = JSON.parse(sendCall![1].body) as Record<string, unknown>
    expect(String(bodyParsed.chat_id)).toBe(String(TELEGRAM_CHAT_ID))
  })

  it('fetch() llamado con body que contiene text = AGENT_REPLY', async () => {
    await postWebhook(makeTelegramTextUpdate('Reply test'))
    const sendCall = (fetchSpy.mock.calls as Array<[string, { body: string }]>)
      .find(([url]) => typeof url === 'string' && url.includes('/sendMessage'))
    expect(sendCall).toBeDefined()
    const bodyParsed = JSON.parse(sendCall![1].body) as Record<string, unknown>
    expect(bodyParsed.text).toBe(AGENT_REPLY)
  })

  it('GatewaySession fue creada/actualizada (upsert llamado)', async () => {
    await postWebhook(makeTelegramTextUpdate('Session test'))
    expect(prismaMock.gatewaySession.upsert).toHaveBeenCalled()
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESCRIBE 3 — Flujo: comando /start
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Flujo: comando /start', () => {
  it('/start → AgentExecutor llamado con history[0].content === "/start"', async () => {
    await postWebhook(makeTelegramCommandUpdate('/start'))
    expect(agentExecutorStub.run).toHaveBeenCalledTimes(1)
    const [, history] = agentExecutorStub.run.mock.calls[0] as [string, Array<{ role: string; content: string }>]
    const userEntry = history.find((h) => h.role === 'user')
    expect(userEntry?.content).toBe('/start')
  })

  it('/help → history[0].content === "/help"', async () => {
    await postWebhook(makeTelegramCommandUpdate('/help'))
    const [, history] = agentExecutorStub.run.mock.calls[0] as [string, Array<{ role: string; content: string }>]
    const userEntry = history.find((h) => h.role === 'user')
    expect(userEntry?.content).toBe('/help')
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESCRIBE 4 — Flujo: callback_query
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Flujo: callback_query', () => {
  it('callback_query → AgentExecutor llamado con text = cbq.data', async () => {
    await postWebhook(makeTelegramCallbackQuery('action:confirm'))
    expect(agentExecutorStub.run).toHaveBeenCalledTimes(1)
    const [, history] = agentExecutorStub.run.mock.calls[0] as [string, Array<{ role: string; content: string }>]
    const userEntry = history.find((h) => h.role === 'user')
    expect(userEntry?.content).toBe('action:confirm')
  })

  it('callback_query → answerCallbackQuery fue llamado', async () => {
    await postWebhook(makeTelegramCallbackQuery('action:cancel'))
    const cbqCalls = (fetchSpy.mock.calls as Array<[string, unknown]>)
      .filter(([url]) => typeof url === 'string' && url.includes('/answerCallbackQuery'))
    expect(cbqCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('callback_query → sendMessage también fue llamado con AGENT_REPLY', async () => {
    await postWebhook(makeTelegramCallbackQuery('action:ok'))
    const sendCalls = (fetchSpy.mock.calls as Array<[string, { body: string }]>)
      .filter(([url]) => typeof url === 'string' && url.includes('/sendMessage'))
    expect(sendCalls.length).toBeGreaterThanOrEqual(1)
    const body = JSON.parse(sendCalls[0]![1].body) as { text: string }
    expect(body.text).toBe(AGENT_REPLY)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESCRIBE 5 — Mensajes sin texto
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Flujo: mensajes sin texto (foto)', () => {
  it('payload foto → 200 pero AgentExecutor NO llamado', async () => {
    const { res, json } = await postWebhookJson(makeTelegramPhotoUpdate())
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(agentExecutorStub.run).not.toHaveBeenCalled()
  })

  it('payload foto → sendMessage NO llamado', async () => {
    await postWebhook(makeTelegramPhotoUpdate())
    const sendCalls = (fetchSpy.mock.calls as Array<[string, unknown]>)
      .filter(([url]) => typeof url === 'string' && url.includes('/sendMessage'))
    expect(sendCalls.length).toBe(0)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESCRIBE 6 — Comportamiento bajo errores
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Comportamiento bajo errores', () => {
  it('AgentExecutor timeout → webhook responde 200 con fallback reply', async () => {
    // App separada con timeout muy corto (100ms)
    const timeoutApp = await startTestApp(
      prismaMock,
      agentExecutorTimeoutStub,
      { timeoutMs: 100 },
    )
    try {
      fetchSpy.mockClear()
      const { res, json } = await postWebhookJson(
        makeTelegramTextUpdate('Lento'),
        WEBHOOK_SECRET,
        timeoutApp.baseUrl,
      )
      expect(res.status).toBe(200)
      expect(json.ok).toBe(true)

      const sendCalls = (fetchSpy.mock.calls as Array<[string, { body: string }]>)
        .filter(([url]) => typeof url === 'string' && url.includes('/sendMessage'))
      expect(sendCalls.length).toBeGreaterThanOrEqual(1)
      const body = JSON.parse(sendCalls[0]![1].body) as { text: string }
      expect(body.text).toBe(TIMEOUT_REPLY)
    } finally {
      await timeoutApp.cleanup()
    }
  })

  it('AgentExecutor error transitorio → reintento → éxito ("Recovered reply")', async () => {
    resetTransientStub()
    const transientApp = await startTestApp(
      prismaMock,
      agentExecutorTransientStub,
      { maxAttempts: 2, retryDelayMs: 10 },
    )
    try {
      fetchSpy.mockClear()
      const { res } = await postWebhookJson(
        makeTelegramTextUpdate('Retry test'),
        WEBHOOK_SECRET,
        transientApp.baseUrl,
      )
      expect(res.status).toBe(200)

      const sendCalls = (fetchSpy.mock.calls as Array<[string, { body: string }]>)
        .filter(([url]) => typeof url === 'string' && url.includes('/sendMessage'))
      expect(sendCalls.length).toBeGreaterThanOrEqual(1)
      const body = JSON.parse(sendCalls[0]![1].body) as { text: string }
      expect(body.text).toBe('Recovered reply')
    } finally {
      await transientApp.cleanup()
    }
  })

  it('segundo mensaje del mismo usuario → history tiene 2 entries', async () => {
    // Primer mensaje
    agentExecutorStub.run.mockResolvedValueOnce({ reply: 'Hola reply' })
    await postWebhook(makeTelegramTextUpdate('Hola'))

    agentExecutorStub.run.mockClear()

    // Segundo mensaje — el mismo chat_id
    await postWebhook(makeTelegramTextUpdate('Adiós'))

    expect(agentExecutorStub.run).toHaveBeenCalledTimes(1)
    const [, history] = agentExecutorStub.run.mock.calls[0] as [string, Array<{ role: string; content: string }>]
    expect(history.length).toBe(3) // user:"Hola", assistant:"Hola reply", user:"Adiós"
    expect(history[0].content).toBe('Hola')
    expect(history[1].role).toBe('assistant')
    expect(history[2].content).toBe('Adiós')
  })

  it('mismo chatId en dos mensajes → gatewaySession.upsert llamado 2 veces', async () => {
    await postWebhook(makeTelegramTextUpdate('Msg 1'))
    await postWebhook(makeTelegramTextUpdate('Msg 2'))
    expect(prismaMock.gatewaySession.upsert).toHaveBeenCalledTimes(2)
    // Ambas llamadas deben tener el mismo externalUserId
    const calls = prismaMock.gatewaySession.upsert.mock.calls as Array<[
      { where: { externalUserId: string } }
    ]>
    expect(calls[0][0].where.externalUserId).toBe(calls[1][0].where.externalUserId)
  })
})
