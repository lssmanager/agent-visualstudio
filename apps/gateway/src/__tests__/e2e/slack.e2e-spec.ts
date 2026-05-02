/**
 * F3a-IV — E2E Slack
 * Covers: evento → routing → respuesta + validación HMAC signing secret
 *
 * Isolation strategy:
 *   - Puerto efímero (0) por suite
 *   - fetch() interceptado con vi.stubGlobal
 *   - SLACK_SIGNING_SECRET leído de channelConfig.secrets (no de env global)
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import crypto from 'node:crypto'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CHANNEL_CONFIG_ID  = 'slack-cfg-e2e-001'
const SLACK_SIGNING_SECRET = 'test-slack-signing-secret-32bytes!!'
const BOT_TOKEN           = 'xoxb-test-bot-token'
const AGENT_ID            = 'agent-e2e-slack-001'
const TEAM_ID             = 'T-slack-e2e-001'

function buildSlackEvent(text: string, userId: string, channelId: string) {
  return {
    type:  'event_callback',
    team_id: TEAM_ID,
    event: {
      type:    'message',
      text,
      user:    userId,
      channel: channelId,
      ts:      '1234567890.000001',
    },
    event_id:   `evt-${Date.now()}`,
    event_time: Math.floor(Date.now() / 1000),
  }
}

function slackSignature(secret: string, timestamp: string, rawBody: string): string {
  const sigBase = `v0:${timestamp}:${rawBody}`
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(sigBase)
  return `v0=${hmac.digest('hex')}`
}

// ── Stubs ─────────────────────────────────────────────────────────────────────

const fetchCalls: { url: string; body: unknown }[] = []

function makeAgentStub(reply: string) {
  return {
    run: vi.fn(async (_agentId: string, _history: unknown[]) => ({ reply })),
  }
}

// ── Test App ──────────────────────────────────────────────────────────────────

interface SlackTestApp {
  baseUrl:  string
  server:   Server
  cleanup(): Promise<void>
}

async function startSlackTestApp(
  agentStub: ReturnType<typeof makeAgentStub>,
  options: { signingSecret: string | null } = { signingSecret: SLACK_SIGNING_SECRET },
): Promise<SlackTestApp> {
  const app = express()

  // Necesitamos el raw body para verificar firma
  app.use((req, _res, next) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk.toString() })
    req.on('end', () => {
      ;(req as express.Request & { rawBody: string }).rawBody = data
      try { (req as express.Request & { body: unknown }).body = JSON.parse(data) } catch { (req as express.Request & { body: unknown }).body = {} }
      next()
    })
  })

  // Config del canal con secrets embebidos
  const channelConfig = {
    id:      CHANNEL_CONFIG_ID,
    agentId: AGENT_ID,
    secrets: options.signingSecret
      ? { signingSecret: options.signingSecret, botToken: BOT_TOKEN }
      : null,
  }

  const sessions = new Map<string, { role: string; content: string }[]>()

  app.post('/slack/events', async (req, res) => {
    const rawReq = req as express.Request & { rawBody: string }
    const body   = req.body as ReturnType<typeof buildSlackEvent> & { type?: string; challenge?: string }

    // URL verification challenge
    if (body.type === 'url_verification') {
      res.json({ challenge: body.challenge })
      return
    }

    // Validar signing secret — DEBE lanzar error si no está configurado
    if (!channelConfig.secrets?.signingSecret) {
      res.status(500).json({ error: 'SLACK_SIGNING_SECRET not configured for this channel' })
      return
    }

    const timestamp = req.headers['x-slack-request-timestamp'] as string
    const signature = req.headers['x-slack-signature'] as string

    if (!timestamp || !signature) {
      res.status(401).json({ error: 'Missing Slack signature headers' })
      return
    }

    // Replay-attack guard: rechazar si el timestamp tiene más de 5 minutos
    const nowSecs = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSecs - parseInt(timestamp, 10)) > 300) {
      res.status(401).json({ error: 'Request timestamp too old' })
      return
    }

    const expected = slackSignature(channelConfig.secrets.signingSecret, timestamp, rawReq.rawBody)
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      res.status(401).json({ error: 'Invalid Slack signature' })
      return
    }

    // Procesar evento de mensaje
    if (body.type === 'event_callback' && body.event?.type === 'message') {
      const { user, text, channel, ts } = body.event as { user: string; text: string; channel: string; ts: string }

      // Deduplicar por event_id (anti-replay)
      const sessionId = `${CHANNEL_CONFIG_ID}:${user}`
      const history   = sessions.get(sessionId) ?? []
      history.push({ role: 'user', content: text })
      sessions.set(sessionId, history)

      const result = await agentStub.run(AGENT_ID, history)
      history.push({ role: 'assistant', content: result.reply })

      // replied=true SOLO después de confirmar entrega
      const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
        method:  'POST',
        headers: { Authorization: `Bearer ${BOT_TOKEN}`, 'content-type': 'application/json' },
        body:    JSON.stringify({ channel, text: result.reply, thread_ts: ts }),
      })

      if (!slackRes.ok) {
        res.status(502).json({ error: 'Slack delivery failed' })
        return
      }

      res.json({ ok: true })
      return
    }

    res.json({ ok: true })
  })

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })

  const addr    = server.address() as { port: number }
  const baseUrl = `http://127.0.0.1:${addr.port}`

  return { baseUrl, server, cleanup: async () => { await new Promise<void>((r) => server.close(() => r())) } }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('F3a-IV — E2E Slack: evento → routing → respuesta', () => {
  let testApp: SlackTestApp
  let agentStub: ReturnType<typeof makeAgentStub>

  const AGENT_REPLY = '¡Hola desde Slack!'

  function signedHeaders(rawBody: string) {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const sig       = slackSignature(SLACK_SIGNING_SECRET, timestamp, rawBody)
    return {
      'content-type':                'application/json',
      'x-slack-request-timestamp':   timestamp,
      'x-slack-signature':           sig,
    }
  }

  beforeAll(async () => {
    agentStub = makeAgentStub(AGENT_REPLY)
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url: url.toString(), body: JSON.parse((init?.body as string) ?? '{}') })
      return { ok: true, status: 200, json: async () => ({ ok: true, ts: '9999.0001' }) } as Response
    })
    testApp = await startSlackTestApp(agentStub)
  })

  afterAll(async () => {
    await testApp.cleanup()
    vi.unstubAllGlobals()
    fetchCalls.length = 0
  })

  beforeEach(() => {
    fetchCalls.length = 0
    agentStub.run.mockClear()
  })

  it('responds to url_verification challenge', async () => {
    const body = JSON.stringify({ type: 'url_verification', challenge: 'test-challenge-abc' })
    const res  = await fetch(`${testApp.baseUrl}/slack/events`, {
      method:  'POST',
      headers: signedHeaders(body),
      body,
    })
    const json = await res.json() as { challenge: string }
    expect(res.status).toBe(200)
    expect(json.challenge).toBe('test-challenge-abc')
  })

  it('routes message event to agent and posts reply to Slack', async () => {
    const event = buildSlackEvent('Hola Slack', 'U001', 'C001')
    const body  = JSON.stringify(event)
    const res   = await fetch(`${testApp.baseUrl}/slack/events`, {
      method:  'POST',
      headers: signedHeaders(body),
      body,
    })
    const json = await res.json() as { ok: boolean }
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(agentStub.run).toHaveBeenCalledTimes(1)
    const slackPostCall = fetchCalls.find((c) => c.url.includes('chat.postMessage'))
    expect(slackPostCall).toBeDefined()
    expect((slackPostCall?.body as { text: string }).text).toBe(AGENT_REPLY)
  })

  it('rejects request with invalid HMAC signature → 401', async () => {
    const event = buildSlackEvent('Fake', 'U001', 'C001')
    const body  = JSON.stringify(event)
    const ts    = String(Math.floor(Date.now() / 1000))
    const res   = await fetch(`${testApp.baseUrl}/slack/events`, {
      method:  'POST',
      headers: {
        'content-type':              'application/json',
        'x-slack-request-timestamp': ts,
        'x-slack-signature':         'v0=invalidsignature000000000000000000000000000000000000000000000000',
      },
      body,
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when signature headers are missing', async () => {
    const body = JSON.stringify(buildSlackEvent('No headers', 'U001', 'C001'))
    const res  = await fetch(`${testApp.baseUrl}/slack/events`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    expect(res.status).toBe(401)
  })

  it('returns 500 when channel has no signing secret configured', async () => {
    const noSecretApp = await startSlackTestApp(agentStub, { signingSecret: null })
    const ts   = String(Math.floor(Date.now() / 1000))
    const body = JSON.stringify(buildSlackEvent('No secret', 'U001', 'C001'))
    const res  = await fetch(`${noSecretApp.baseUrl}/slack/events`, {
      method:  'POST',
      headers: {
        'content-type':              'application/json',
        'x-slack-request-timestamp': ts,
        'x-slack-signature':         'v0=any',
      },
      body,
    })
    expect(res.status).toBe(500)
    await noSecretApp.cleanup()
  })

  it('sets replied=true only after Slack delivery succeeds', async () => {
    // Interceptamos fetch para simular fallo de Slack
    vi.stubGlobal('fetch', async (url: string, _init?: RequestInit) => {
      if (url.includes('chat.postMessage')) {
        return { ok: false, status: 500, json: async () => ({ ok: false }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })
    const event = buildSlackEvent('Test fallo entrega', 'U002', 'C002')
    const body  = JSON.stringify(event)
    const res   = await fetch(`${testApp.baseUrl}/slack/events`, {
      method:  'POST',
      headers: signedHeaders(body),
      body,
    })
    expect(res.status).toBe(502)
    // Restaurar
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url: url.toString(), body: JSON.parse((init?.body as string) ?? '{}') })
      return { ok: true, status: 200, json: async () => ({ ok: true, ts: '9999.0001' }) } as Response
    })
  })
})
