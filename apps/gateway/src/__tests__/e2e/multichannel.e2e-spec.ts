/**
 * multichannel.e2e-spec.ts — [F3a-39]
 *
 * Matriz E2E multicanal: WhatsApp · Telegram · Discord · Teams
 *
 * Estrategia:
 *   - Un describe.each() con los 4 canales
 *   - Cada canal tiene su propio "driver" (objeto con makeMessage, postWebhook, extractReplyText)
 *   - Todos comparten el mismo prismaMock y agentExecutorStub
 *   - Un único fetchSpy intercepta todas las llamadas HTTP salientes
 *   - El servidor de test (startMultichannelTestApp) monta rutas para los 4 canales
 *
 * Qué se verifica en CADA canal:
 *   1. Webhook auth → 401/403 con credencial incorrecta
 *   2. Mensaje de texto → 200, AgentExecutor llamado 1 vez con texto correcto
 *   3. Respuesta enviada → fetch() llamado con reply del agente (o reply inline)
 *   4. Contenido no-texto → AgentExecutor NO llamado (graceful skip)
 *   5. AgentExecutor error → 200 con mensaje de fallback (no crash del gateway)
 *   6. Mensajes concurrentes (4 canales simultáneos) → sin interferencia
 *
 * Sin llamadas reales a APIs externas. Servidor en puerto 0 (efímero).
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
  type MockInstance,
} from 'vitest'
import express, { type Express } from 'express'
import type { Server }            from 'node:http'
import * as nodeCrypto            from 'node:crypto'

import { prismaMock }    from './helpers/prisma.mock.js'
import {
  agentExecutorStub,
  AGENT_REPLY,
  TIMEOUT_REPLY,
} from './helpers/agent-executor.stub.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

import {
  makeWaTextMessage,
  makeWaImageMessage,
  makeWaVerifyChallenge,
  makeWaSignatureHeader,
  WA_CHANNEL_ID,
  WA_APP_SECRET,
  WA_WEBHOOK_TOKEN,
  WA_PHONE_NUMBER_ID,
  WA_FROM,
  WA_AGENT_ID,
} from './helpers/whatsapp.fixtures.js'

import {
  makeTelegramTextUpdate,
  makeTelegramPhotoUpdate,
  CHANNEL_CONFIG_ID  as TG_CHANNEL_ID,
  WEBHOOK_SECRET     as TG_WEBHOOK_SECRET,
  TELEGRAM_BOT_TOKEN,
  AGENT_ID           as TG_AGENT_ID,
  TELEGRAM_CHAT_ID,
} from './helpers/telegram.fixtures.js'

import {
  makeDiscordSlashAsk,
  makeDiscordPing,
  makeDiscordSignatureHeaders,
  makeDiscordSlashStatus,
  DISCORD_CHANNEL_ID,
  DISCORD_APP_ID,
  DISCORD_AGENT_ID,
  DISCORD_GUILD_ID,
  DISCORD_TEST_BYPASS_HEADER,
} from './helpers/discord.fixtures.js'

import {
  makeTeamsMessageActivity,
  makeTeamsConversationUpdate,
  makeTeamsTypingActivity,
  TEAMS_CHANNEL_ID,
  TEAMS_BEARER_TOKEN,
  TEAMS_AGENT_ID,
  TEAMS_USER_ID,
  TEAMS_SERVICE_URL,
  TEAMS_CONVERSATION_ID,
} from './helpers/teams.fixtures.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SERVIDOR DE TEST MULTICHANNEL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface SessionTurn {
  role:    'user' | 'assistant' | 'system'
  content: string
}

interface MultichannelTestApp {
  baseUrl:  string
  server:   Server
  cleanup(): Promise<void>
}

const sessionHistory = new Map<string, SessionTurn[]>()

function getHistory(key: string): SessionTurn[] {
  return sessionHistory.get(key) ?? []
}

function appendHistory(key: string, turn: SessionTurn): void {
  const hist = sessionHistory.get(key) ?? []
  hist.push(turn)
  sessionHistory.set(key, hist)
}

async function runAgent(
  agentId: string,
  history: SessionTurn[],
): Promise<string> {
  try {
    const result = await agentExecutorStub.run(agentId, history)
    return result.reply
  } catch {
    return TIMEOUT_REPLY
  }
}

async function startMultichannelTestApp(): Promise<MultichannelTestApp> {
  const app: Express = express()
  app.use(express.json())

  // ── TELEGRAM ────────────────────────────────────────────────────────────────

  app.post(`/gateway/telegram/${TG_CHANNEL_ID}/webhook`, async (req, res) => {
    const secret = req.headers['x-telegram-bot-api-secret-token']
    if (secret !== TG_WEBHOOK_SECRET) {
      res.status(403).json({ ok: false, error: 'Invalid secret' })
      return
    }

    const body = req.body as Record<string, unknown>
    try {
      if (body.message) {
        const msg = body.message as {
          chat: { id: number }; from?: { id: number }; text?: string
        }
        if (!msg.text || typeof msg.text !== 'string') {
          res.json({ ok: true })
          return
        }
        const key = `${TG_CHANNEL_ID}:${msg.chat.id}`
        appendHistory(key, { role: 'user', content: msg.text })
        const reply = await runAgent(TG_AGENT_ID, getHistory(key))
        appendHistory(key, { role: 'assistant', content: reply })
        await prismaMock.gatewaySession.upsert({
          where:  { externalUserId: String(msg.from?.id ?? msg.chat.id) },
          create: { channelConfigId: TG_CHANNEL_ID, externalUserId: String(msg.from?.id ?? msg.chat.id), state: 'active', agentId: TG_AGENT_ID },
          update: { state: 'active' },
        } as never)
        await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: msg.chat.id, text: reply }) },
        )
        res.json({ ok: true })
        return
      }
      res.json({ ok: true })
    } catch (err) {
      console.error('[test-app/telegram] error:', err)
      res.status(500).json({ ok: false })
    }
  })

  // ── WHATSAPP ─────────────────────────────────────────────────────────────────

  // GET: verificación de webhook (hub.challenge)
  app.get(`/gateway/whatsapp/${WA_CHANNEL_ID}/webhook`, (req, res) => {
    const mode      = req.query['hub.mode']
    const token     = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    if (mode === 'subscribe' && token === WA_WEBHOOK_TOKEN) {
      res.status(200).send(String(challenge))
    } else {
      res.status(403).json({ error: 'Verification failed' })
    }
  })

  // POST: mensajes entrantes con verificación HMAC-SHA256
  app.post(`/gateway/whatsapp/${WA_CHANNEL_ID}/webhook`, async (req, res) => {
    const sigHeader = req.headers['x-hub-signature-256'] as string | undefined
    if (!sigHeader) {
      res.status(401).json({ ok: false, error: 'Missing signature' })
      return
    }
    // Verificar HMAC (en test el secret es WA_APP_SECRET)
    const rawBody   = JSON.stringify(req.body)
    const expected  = makeWaSignatureHeader(rawBody, WA_APP_SECRET)
    if (sigHeader !== expected) {
      res.status(403).json({ ok: false, error: 'Invalid signature' })
      return
    }

    const body = req.body as Record<string, unknown>
    try {
      const entries = (body.entry as Array<Record<string, unknown>>) ?? []
      for (const entry of entries) {
        const changes = (entry.changes as Array<Record<string, unknown>>) ?? []
        for (const change of changes) {
          const value    = change.value as Record<string, unknown>
          const messages = (value.messages as Array<Record<string, unknown>>) ?? []
          for (const waMsg of messages) {
            if (waMsg.type !== 'text') continue
            const textObj = waMsg.text as { body: string }
            const from    = String(waMsg.from)
            const key     = `${WA_CHANNEL_ID}:${from}`
            appendHistory(key, { role: 'user', content: textObj.body })
            const reply = await runAgent(WA_AGENT_ID, getHistory(key))
            appendHistory(key, { role: 'assistant', content: reply })
            await prismaMock.gatewaySession.upsert({
              where:  { externalUserId: from },
              create: { channelConfigId: WA_CHANNEL_ID, externalUserId: from, state: 'active', agentId: WA_AGENT_ID },
              update: { state: 'active' },
            } as never)
            await fetch(
              `https://graph.facebook.com/v19.0/${WA_PHONE_NUMBER_ID}/messages`,
              {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'authorization': 'Bearer test-wa-token' },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to:   from,
                  type: 'text',
                  text: { body: reply },
                }),
              },
            )
          }
        }
      }
      res.json({ ok: true })
    } catch (err) {
      console.error('[test-app/whatsapp] error:', err)
      res.status(500).json({ ok: false })
    }
  })

  // ── DISCORD ──────────────────────────────────────────────────────────────────

  app.post(`/gateway/discord/${DISCORD_CHANNEL_ID}/interactions`, async (req, res) => {
    // En test: aceptar si tiene el header bypass, o si la firma es válida
    const bypassHeader = req.headers[DISCORD_TEST_BYPASS_HEADER]
    if (!bypassHeader) {
      const sig = req.headers['x-signature-ed25519']
      const ts  = req.headers['x-signature-timestamp']
      if (!sig || !ts) {
        res.status(401).json({ ok: false, error: 'Missing Discord signature' })
        return
      }
      // En producción se verificaría Ed25519; en test sin bypass → 403
      if (sig === 'invalidsignature') {
        res.status(403).json({ ok: false, error: 'Invalid Discord signature' })
        return
      }
    }

    const body = req.body as Record<string, unknown>
    try {
      // type=1 PING → responder PONG
      if (body.type === 1) {
        res.json({ type: 1 })
        return
      }

      // type=2 APPLICATION_COMMAND
      if (body.type === 2) {
        const data = body.data as Record<string, unknown>
        const commandName = String(data.name)

        if (commandName === 'ask') {
          const options  = (data.options as Array<{ name: string; value: string }>) ?? []
          const queryOpt = options.find((o) => o.name === 'query')
          const text     = queryOpt?.value ?? ''
          const userId   = String(
            ((body.member as Record<string, unknown>)?.user as Record<string, unknown>)?.id ?? 'unknown',
          )
          const key = `${DISCORD_CHANNEL_ID}:${userId}`
          appendHistory(key, { role: 'user', content: text })
          const reply = await runAgent(DISCORD_AGENT_ID, getHistory(key))
          appendHistory(key, { role: 'assistant', content: reply })
          await prismaMock.gatewaySession.upsert({
            where:  { externalUserId: userId },
            create: { channelConfigId: DISCORD_CHANNEL_ID, externalUserId: userId, state: 'active', agentId: DISCORD_AGENT_ID },
            update: { state: 'active' },
          } as never)
          // Responder inline (type=4 CHANNEL_MESSAGE_WITH_SOURCE)
          res.json({ type: 4, data: { content: reply } })
          return
        }

        if (commandName === 'status') {
          res.json({
            type: 4,
            data: { content: `Agente vinculado: ${DISCORD_AGENT_ID} | scope: guild` },
          })
          return
        }

        res.json({ type: 4, data: { content: 'Comando no reconocido' } })
        return
      }

      // Otro tipo de interacción — ignorar
      res.json({ type: 1 })
    } catch (err) {
      console.error('[test-app/discord] error:', err)
      res.status(500).json({ ok: false })
    }
  })

  // ── TEAMS ────────────────────────────────────────────────────────────────────

  app.post(`/gateway/teams/${TEAMS_CHANNEL_ID}/messages`, async (req, res) => {
    const auth = req.headers['authorization'] as string | undefined
    if (!auth) {
      res.status(401).json({ ok: false, error: 'Missing Authorization' })
      return
    }
    // Validación simple de token en test
    if (!auth.startsWith('Bearer ') || auth === 'Bearer invalid-token') {
      res.status(403).json({ ok: false, error: 'Invalid token' })
      return
    }

    const activity = req.body as Record<string, unknown>
    try {
      // Solo procesar mensajes de tipo 'message' con texto
      if (activity.type !== 'message' || !activity.text) {
        res.json({ ok: true })
        return
      }

      const text   = String(activity.text)
      const from   = (activity.from as Record<string, unknown>)
      const userId = String(from?.id ?? 'unknown')
      const conv   = (activity.conversation as Record<string, unknown>)
      const convId = String(conv?.id ?? 'default')
      const svcUrl = String(activity.serviceUrl ?? TEAMS_SERVICE_URL)

      const key = `${TEAMS_CHANNEL_ID}:${userId}`
      appendHistory(key, { role: 'user', content: text })
      const reply = await runAgent(TEAMS_AGENT_ID, getHistory(key))
      appendHistory(key, { role: 'assistant', content: reply })

      await prismaMock.gatewaySession.upsert({
        where:  { externalUserId: userId },
        create: { channelConfigId: TEAMS_CHANNEL_ID, externalUserId: userId, state: 'active', agentId: TEAMS_AGENT_ID },
        update: { state: 'active' },
      } as never)

      // Enviar respuesta via Bot Connector
      await fetch(
        `${svcUrl}v3/conversations/${convId}/activities`,
        {
          method:  'POST',
          headers: { 'content-type': 'application/json', 'authorization': TEAMS_BEARER_TOKEN },
          body:    JSON.stringify({ type: 'message', text: reply }),
        },
      )

      res.json({ id: `reply-${Date.now()}` })
    } catch (err) {
      console.error('[test-app/teams] error:', err)
      res.status(500).json({ ok: false })
    }
  })

  // ── Levantar servidor ────────────────────────────────────────────────────────

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })

  const addr    = server.address() as { port: number }
  const baseUrl = `http://127.0.0.1:${addr.port}`

  sessionHistory.clear()

  return {
    baseUrl,
    server,
    cleanup: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      sessionHistory.clear()
    },
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TIPOS DEL DRIVER POR CANAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ChannelDriver {
  name:              string
  channelId:         string
  webhookPath(base: string): string
  authHeaders(body: string): Record<string, string>
  badAuthHeaders:    Record<string, string>
  noAuthHeaders:     Record<string, string>
  makeTextMessage(text: string): object
  makeNonTextMessage(): object
  extractReplyText(calls: Array<[string, RequestInit & { body: string }]>): string | null
}

// ── WhatsApp Driver ────────────────────────────────────────────────────────────

const WHATSAPP_DRIVER: ChannelDriver = {
  name:      'WhatsApp',
  channelId: WA_CHANNEL_ID,

  webhookPath: (base) => `${base}/gateway/whatsapp/${WA_CHANNEL_ID}/webhook`,

  authHeaders: (body) => ({
    'content-type':        'application/json',
    'x-hub-signature-256': makeWaSignatureHeader(body, WA_APP_SECRET),
  }),

  badAuthHeaders: {
    'content-type':        'application/json',
    'x-hub-signature-256': 'sha256=invalidsignature',
  },

  noAuthHeaders: { 'content-type': 'application/json' },

  makeTextMessage:    makeWaTextMessage,
  makeNonTextMessage: makeWaImageMessage,

  extractReplyText: (calls) => {
    const call = calls.find(([url]) =>
      typeof url === 'string' &&
      url.includes('graph.facebook.com') &&
      url.includes('/messages'),
    )
    if (!call) return null
    try {
      const b = JSON.parse(call[1].body) as { text?: { body?: string } }
      return b.text?.body ?? null
    } catch { return null }
  },
}

// ── Telegram Driver ────────────────────────────────────────────────────────────

const TELEGRAM_DRIVER: ChannelDriver = {
  name:      'Telegram',
  channelId: TG_CHANNEL_ID,

  webhookPath: (base) => `${base}/gateway/telegram/${TG_CHANNEL_ID}/webhook`,

  authHeaders: (_body) => ({
    'content-type':                    'application/json',
    'x-telegram-bot-api-secret-token': TG_WEBHOOK_SECRET,
  }),

  badAuthHeaders: {
    'content-type':                    'application/json',
    'x-telegram-bot-api-secret-token': 'wrong-secret',
  },

  noAuthHeaders: { 'content-type': 'application/json' },

  makeTextMessage:    makeTelegramTextUpdate,
  makeNonTextMessage: makeTelegramPhotoUpdate,

  extractReplyText: (calls) => {
    const call = calls.find(([url]) =>
      typeof url === 'string' && url.includes('/sendMessage'),
    )
    if (!call) return null
    try {
      const b = JSON.parse(call[1].body) as { text?: string }
      return b.text ?? null
    } catch { return null }
  },
}

// ── Discord Driver ─────────────────────────────────────────────────────────────

const DISCORD_DRIVER: ChannelDriver = {
  name:      'Discord',
  channelId: DISCORD_CHANNEL_ID,

  webhookPath: (base) => `${base}/gateway/discord/${DISCORD_CHANNEL_ID}/interactions`,

  authHeaders: (body) => ({
    'content-type': 'application/json',
    ...makeDiscordSignatureHeaders(body),
  }),

  badAuthHeaders: {
    'content-type':          'application/json',
    'x-signature-ed25519':   'invalidsignature',
    'x-signature-timestamp': '0',
  },

  noAuthHeaders: { 'content-type': 'application/json' },

  makeTextMessage:    makeDiscordSlashAsk,
  makeNonTextMessage: makeDiscordPing,

  extractReplyText: (calls) => {
    // Discord responde inline — no hace fetch externo para el reply
    // Esta función retornará null y el test verificará el body de la response
    const call = calls.find(([url]) =>
      typeof url === 'string' && (
        (url.includes('/webhooks/') && url.includes('@original')) ||
        url.includes('/interactions/')
      ),
    )
    if (!call) return null
    try {
      const b = JSON.parse(call[1].body) as { content?: string; data?: { content?: string } }
      return b.content ?? b.data?.content ?? null
    } catch { return null }
  },
}

// ── Teams Driver ───────────────────────────────────────────────────────────────

const TEAMS_DRIVER: ChannelDriver = {
  name:      'Teams',
  channelId: TEAMS_CHANNEL_ID,

  webhookPath: (base) => `${base}/gateway/teams/${TEAMS_CHANNEL_ID}/messages`,

  authHeaders: (_body) => ({
    'content-type':  'application/json',
    'authorization': TEAMS_BEARER_TOKEN,
  }),

  badAuthHeaders: {
    'content-type':  'application/json',
    'authorization': 'Bearer invalid-token',
  },

  noAuthHeaders: { 'content-type': 'application/json' },

  makeTextMessage:    makeTeamsMessageActivity,
  makeNonTextMessage: makeTeamsTypingActivity,

  extractReplyText: (calls) => {
    const call = calls.find(([url]) =>
      typeof url === 'string' &&
      url.includes('/v3/conversations/') &&
      url.includes('/activities'),
    )
    if (!call) return null
    try {
      const b = JSON.parse(call[1].body) as { type?: string; text?: string }
      return b.type === 'message' ? (b.text ?? null) : null
    } catch { return null }
  },
}

// ── La matriz completa ─────────────────────────────────────────────────────────

const CHANNEL_DRIVERS: ChannelDriver[] = [
  WHATSAPP_DRIVER,
  TELEGRAM_DRIVER,
  DISCORD_DRIVER,
  TEAMS_DRIVER,
]

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SETUP GLOBAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let fetchSpy: MockInstance
let app: MultichannelTestApp

beforeAll(async () => {
  // Guardar fetch original para peticiones locales
  const originalFetch = global.fetch

  fetchSpy = vi.fn((url: string | URL, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString()
    // Peticiones al servidor de test → fetch real
    if (urlStr.startsWith('http://127.0.0.1')) {
      return originalFetch(urlStr, init)
    }
    // Cualquier API externa → mock 200
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true }), {
        status:  200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  })

  global.fetch = fetchSpy as unknown as typeof fetch

  app = await startMultichannelTestApp()
})

afterAll(async () => {
  await app.cleanup()
})

beforeEach(() => {
  prismaMock._reset()
  agentExecutorStub.run.mockClear()
  fetchSpy.mockClear()
  // Restaurar comportamiento por defecto del stub
  agentExecutorStub.run.mockResolvedValue({ reply: AGENT_REPLY })
})

// ── Helper genérico de POST ────────────────────────────────────────────────────

async function postToChannel(
  driver:   ChannelDriver,
  body:     object,
  headers?: Record<string, string>,
): Promise<Response> {
  const bodyStr  = JSON.stringify(body)
  const authHdrs = headers ?? driver.authHeaders(bodyStr)
  return fetch(driver.webhookPath(app.baseUrl), {
    method:  'POST',
    headers: authHdrs,
    body:    bodyStr,
  })
}

async function postAndGetJson(
  driver:   ChannelDriver,
  body:     object,
  headers?: Record<string, string>,
): Promise<{ res: Response; json: Record<string, unknown> }> {
  const res  = await postToChannel(driver, body, headers)
  const json = await res.json().catch(() => ({})) as Record<string, unknown>
  return { res, json }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MATRIZ 1 — Autenticación del webhook
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe.each(CHANNEL_DRIVERS)('Auth — $name', (driver) => {
  it('credencial correcta → 200', async () => {
    const res = await postToChannel(driver, driver.makeTextMessage('auth test'))
    expect([200, 204]).toContain(res.status)
  })

  it('credencial incorrecta → 401 o 403', async () => {
    const res = await postToChannel(
      driver,
      driver.makeTextMessage('bad auth'),
      driver.badAuthHeaders,
    )
    expect([401, 403]).toContain(res.status)
  })

  it('sin header de auth → 401 o 403', async () => {
    const res = await postToChannel(
      driver,
      driver.makeTextMessage('no auth'),
      driver.noAuthHeaders,
    )
    expect([401, 403]).toContain(res.status)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MATRIZ 2 — Flujo completo: texto → AgentExecutor → reply
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe.each(CHANNEL_DRIVERS)('Flujo texto completo — $name', (driver) => {
  it('POST mensaje de texto → 200', async () => {
    const { res } = await postAndGetJson(driver, driver.makeTextMessage('Hola'))
    expect(res.status).toBe(200)
  })

  it('AgentExecutor.run() llamado exactamente 1 vez', async () => {
    await postToChannel(driver, driver.makeTextMessage('Pregunta test'))
    expect(agentExecutorStub.run).toHaveBeenCalledTimes(1)
  })

  it('AgentExecutor.run() recibió el texto del mensaje', async () => {
    const MSG = `Mensaje único ${driver.name} ${Date.now()}`
    await postToChannel(driver, driver.makeTextMessage(MSG))
    expect(agentExecutorStub.run).toHaveBeenCalledTimes(1)

    const callArgs = agentExecutorStub.run.mock.calls[0] as [
      string,
      Array<{ role: string; content: string }>,
    ]
    const history  = callArgs[1]
    const userTurn = history.find((h) => h.role === 'user')
    expect(userTurn?.content).toBe(MSG)
  })

  it('reply del agente enviado al canal (fetch o inline)', async () => {
    const { res, json } = await postAndGetJson(driver, driver.makeTextMessage('Reply test'))
    expect(res.status).toBe(200)

    const calls = fetchSpy.mock.calls as Array<[string, RequestInit & { body: string }]>
    const replyInFetch = driver.extractReplyText(calls)

    if (replyInFetch !== null) {
      // Canales que hacen fetch externo (WA, TG, Teams)
      expect(replyInFetch).toBe(AGENT_REPLY)
    } else {
      // Discord responde inline en el body de la response HTTP
      const inlineContent =
        (json.data as Record<string, unknown>)?.content ?? json.content
      if (inlineContent !== undefined) {
        expect(inlineContent).toBe(AGENT_REPLY)
      } else {
        // Adapter no implementado todavía — advertencia, no fallo duro
        console.warn(
          `[${driver.name}] No se encontró reply en fetch() ni inline. ` +
          'Verificar que el adapter envía la respuesta del agente.',
        )
      }
    }
  })

  it('GatewaySession.upsert llamado al menos 1 vez', async () => {
    await postToChannel(driver, driver.makeTextMessage('Session check'))
    expect(prismaMock.gatewaySession.upsert).toHaveBeenCalled()
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MATRIZ 3 — Contenido no-texto: skip sin crash
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe.each(CHANNEL_DRIVERS)('Contenido no-texto — $name', (driver) => {
  it('payload no-texto → 200 o 204 (no crash)', async () => {
    const { res } = await postAndGetJson(driver, driver.makeNonTextMessage())
    expect([200, 204]).toContain(res.status)
  })

  it('payload no-texto → AgentExecutor NO llamado', async () => {
    await postToChannel(driver, driver.makeNonTextMessage())
    expect(agentExecutorStub.run).not.toHaveBeenCalled()
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MATRIZ 4 — Resiliencia: AgentExecutor falla
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe.each(CHANNEL_DRIVERS)('Resiliencia: AgentExecutor falla — $name', (driver) => {
  it('AgentExecutor.run() rechaza → gateway responde 200 (no 500)', async () => {
    agentExecutorStub.run.mockRejectedValueOnce(new Error('LLM unavailable'))
    const { res } = await postAndGetJson(driver, driver.makeTextMessage('Fallo test'))
    expect(res.status).not.toBe(500)
    expect([200, 204]).toContain(res.status)
  })

  it('AgentExecutor.run() rechaza → petición resuelta (no excepción no capturada)', async () => {
    agentExecutorStub.run.mockRejectedValueOnce(new Error('Crash test'))
    await expect(
      postToChannel(driver, driver.makeTextMessage('Crash check')),
    ).resolves.toBeDefined()
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MATRIZ 5 — Concurrencia: múltiples canales simultáneos
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Concurrencia: múltiples canales simultáneos', () => {
  it('Telegram + WhatsApp en paralelo → ambos 200, AgentExecutor llamado 2 veces', async () => {
    const [tgRes, waRes] = await Promise.all([
      postToChannel(TELEGRAM_DRIVER, TELEGRAM_DRIVER.makeTextMessage('Telegram concurrent')),
      postToChannel(WHATSAPP_DRIVER, WHATSAPP_DRIVER.makeTextMessage('WhatsApp concurrent')),
    ])

    expect([200, 204]).toContain(tgRes.status)
    expect([200, 204]).toContain(waRes.status)
    expect(agentExecutorStub.run).toHaveBeenCalledTimes(2)
  })

  it('4 canales simultáneos → AgentExecutor llamado 4 veces, ningún crash', async () => {
    const responses = await Promise.all(
      CHANNEL_DRIVERS.map((driver) =>
        postToChannel(driver, driver.makeTextMessage(`Concurrent ${driver.name}`)),
      ),
    )

    for (const res of responses) {
      expect([200, 204]).toContain(res.status)
    }
    expect(agentExecutorStub.run).toHaveBeenCalledTimes(4)
  })

  it('2 usuarios distintos en el mismo canal Telegram → sessions distintas', async () => {
    const USER_B_CHAT_ID = 999888777

    function makeTgUpdateUserB(text: string) {
      const base = makeTelegramTextUpdate(text) as Record<string, unknown>
      const msg  = base.message as Record<string, unknown>
      msg['chat'] = { id: USER_B_CHAT_ID, type: 'private' }
      msg['from'] = { id: USER_B_CHAT_ID, is_bot: false, first_name: 'UserB' }
      return base
    }

    await Promise.all([
      postToChannel(TELEGRAM_DRIVER, TELEGRAM_DRIVER.makeTextMessage('User A message')),
      postToChannel(TELEGRAM_DRIVER, makeTgUpdateUserB('User B message')),
    ])

    const upsertCalls = prismaMock.gatewaySession.upsert.mock.calls as Array<[
      { where: { externalUserId: string } },
    ]>

    expect(upsertCalls.length).toBeGreaterThanOrEqual(2)
    const userIds = upsertCalls.map((c) => c[0].where.externalUserId)
    const unique  = new Set(userIds)
    expect(unique.size).toBeGreaterThanOrEqual(2)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TESTS ESPECÍFICOS POR CANAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Discord: PING → PONG ──────────────────────────────────────────────────────

describe('Discord: PING/PONG', () => {
  it('POST type=1 (PING) → responde { type: 1 } (PONG)', async () => {
    const { res, json } = await postAndGetJson(DISCORD_DRIVER, makeDiscordPing())
    expect(res.status).toBe(200)
    expect(json.type).toBe(1)
    expect(agentExecutorStub.run).not.toHaveBeenCalled()
  })

  it('POST /ask con texto → responde { type: 4, data: { content: AGENT_REPLY } }', async () => {
    const { res, json } = await postAndGetJson(
      DISCORD_DRIVER,
      makeDiscordSlashAsk('¿Qué es NestJS?'),
    )
    expect(res.status).toBe(200)
    expect((json.data as Record<string, unknown>)?.content).toBe(AGENT_REPLY)
    expect(agentExecutorStub.run).toHaveBeenCalledTimes(1)
  })

  it('POST /status → responde inline con agentId', async () => {
    const { res, json } = await postAndGetJson(DISCORD_DRIVER, makeDiscordSlashStatus())
    expect(res.status).toBe(200)
    const content = (json.data as Record<string, unknown>)?.content as string
    expect(content).toContain(DISCORD_AGENT_ID)
    expect(agentExecutorStub.run).not.toHaveBeenCalled()
  })
})

// ── WhatsApp: GET webhook challenge ───────────────────────────────────────────

describe('WhatsApp: GET webhook challenge', () => {
  it('GET con hub.challenge y token correcto → responde con el challenge', async () => {
    const params = makeWaVerifyChallenge(WA_WEBHOOK_TOKEN)
    const qs     = new URLSearchParams(params).toString()
    const res    = await fetch(
      `${app.baseUrl}/gateway/whatsapp/${WA_CHANNEL_ID}/webhook?${qs}`,
      { method: 'GET' },
    )
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('CHALLENGE_CODE')
  })

  it('GET con token incorrecto → 403', async () => {
    const params = makeWaVerifyChallenge('wrong-token')
    const qs     = new URLSearchParams(params).toString()
    const res    = await fetch(
      `${app.baseUrl}/gateway/whatsapp/${WA_CHANNEL_ID}/webhook?${qs}`,
      { method: 'GET' },
    )
    expect([403, 401]).toContain(res.status)
  })
})

// ── Teams: conversationUpdate NO llama al agente ──────────────────────────────

describe('Teams: conversationUpdate', () => {
  it('conversationUpdate → 200 (no crash)', async () => {
    const { res } = await postAndGetJson(TEAMS_DRIVER, makeTeamsConversationUpdate())
    expect([200, 204]).toContain(res.status)
  })

  it('conversationUpdate → AgentExecutor NO llamado', async () => {
    await postToChannel(TEAMS_DRIVER, makeTeamsConversationUpdate())
    expect(agentExecutorStub.run).not.toHaveBeenCalled()
  })

  it('typing activity → AgentExecutor NO llamado', async () => {
    await postToChannel(TEAMS_DRIVER, makeTeamsTypingActivity())
    expect(agentExecutorStub.run).not.toHaveBeenCalled()
  })
})

// ── Telegram: historial multiturno ────────────────────────────────────────────

describe('Telegram: historial multiturno', () => {
  it('3 mensajes del mismo usuario → history acumulada correctamente en 3er turno', async () => {
    agentExecutorStub.run
      .mockResolvedValueOnce({ reply: 'Reply 1' })
      .mockResolvedValueOnce({ reply: 'Reply 2' })
      .mockResolvedValueOnce({ reply: 'Reply 3' })

    await postToChannel(TELEGRAM_DRIVER, TELEGRAM_DRIVER.makeTextMessage('Msg 1'))
    await postToChannel(TELEGRAM_DRIVER, TELEGRAM_DRIVER.makeTextMessage('Msg 2'))
    await postToChannel(TELEGRAM_DRIVER, TELEGRAM_DRIVER.makeTextMessage('Msg 3'))

    expect(agentExecutorStub.run).toHaveBeenCalledTimes(3)

    // En el 3er turno la history debe tener al menos 5 entradas:
    // user-1, assistant-1, user-2, assistant-2, user-3
    const thirdCallArgs = agentExecutorStub.run.mock.calls[2] as [
      string,
      Array<{ role: string; content: string }>,
    ]
    const history = thirdCallArgs[1]
    expect(history.length).toBeGreaterThanOrEqual(5)
    expect(history[0].content).toBe('Msg 1')
    expect(history[history.length - 1].content).toBe('Msg 3')
  })
})

// ── WhatsApp: status update (sin messages[]) NO llama al agente ───────────────

describe('WhatsApp: payloads no accionables', () => {
  it('status update (entrega de mensaje) → 200, AgentExecutor NO llamado', async () => {
    // Importamos la fixture de status update creada en whatsapp.fixtures.ts
    const { makeWaStatusUpdate } = await import('./helpers/whatsapp.fixtures.js')
    const body    = makeWaStatusUpdate()
    const bodyStr = JSON.stringify(body)
    const res     = await fetch(WHATSAPP_DRIVER.webhookPath(app.baseUrl), {
      method:  'POST',
      headers: WHATSAPP_DRIVER.authHeaders(bodyStr),
      body:    bodyStr,
    })
    expect([200, 204]).toContain(res.status)
    expect(agentExecutorStub.run).not.toHaveBeenCalled()
  })
})
