/**
 * F3a-IV — E2E Webhook
 * Covers:
 *   1. SSRF allowlist: callbackUrl rechazada si no está en WEBHOOK_CALLBACK_ALLOWLIST
 *   2. sessionId requerido: 400 si no viene sessionId/id/chatId en el payload
 *
 * Isolation strategy:
 *   - Puerto efímero (0) por suite
 *   - WEBHOOK_CALLBACK_ALLOWLIST seteado por test via env simulado
 *   - Sin llamadas reales a URLs externas (fetch interceptado)
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CHANNEL_CONFIG_ID = 'webhook-cfg-e2e-001'
const AGENT_ID          = 'agent-e2e-webhook-001'

const ALLOWED_CALLBACK = 'https://allowed.internal.example.com/callback'
const BLOCKED_CALLBACK = 'https://evil.external.attacker.com/exfil'

const ALLOWLIST = [ALLOWED_CALLBACK, 'https://another-allowed.internal.example.com']

function buildWebhookPayload(overrides: Partial<{
  sessionId: string
  text: string
  callbackUrl: string
}> = {}) {
  return {
    sessionId:   'session-webhook-001',
    text:        'Hola webhook',
    callbackUrl: ALLOWED_CALLBACK,
    ...overrides,
  }
}

// ── Stubs ─────────────────────────────────────────────────────────────────────

const fetchCalls: { url: string; body: unknown }[] = []

function makeAgentStub(reply: string) {
  return {
    run: vi.fn(async (_agentId: string, _history: unknown[]) => ({ reply })),
  }
}

// ── Test App ──────────────────────────────────────────────────────────────────

interface WebhookTestApp {
  baseUrl:  string
  server:   Server
  cleanup(): Promise<void>
}

async function startWebhookTestApp(
  agentStub: ReturnType<typeof makeAgentStub>,
  allowlist: string[],
): Promise<WebhookTestApp> {
  const app = express()
  app.use(express.json())

  function isCallbackAllowed(callbackUrl: string): boolean {
    if (allowlist.length === 0) return false
    try {
      const url = new URL(callbackUrl)
      return allowlist.some((allowed) => {
        try {
          const a = new URL(allowed)
          return url.origin === a.origin && url.pathname.startsWith(a.pathname)
        } catch {
          return false
        }
      })
    } catch {
      return false
    }
  }

  const sessions = new Map<string, { role: string; content: string }[]>()

  app.post('/webhook/incoming', async (req, res) => {
    const body = req.body as ReturnType<typeof buildWebhookPayload>

    // sessionId requerido — #176
    const sessionId = body.sessionId
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
      res.status(400).json({ error: 'sessionId is required and must be a non-empty string' })
      return
    }

    // SSRF allowlist — #175
    const { callbackUrl } = body
    if (!callbackUrl || !isCallbackAllowed(callbackUrl)) {
      res.status(400).json({ error: `callbackUrl not in WEBHOOK_CALLBACK_ALLOWLIST: ${callbackUrl}` })
      return
    }

    const history = sessions.get(sessionId) ?? []
    history.push({ role: 'user', content: body.text ?? '' })
    sessions.set(sessionId, history)

    const result = await agentStub.run(AGENT_ID, history)
    history.push({ role: 'assistant', content: result.reply })

    // Llamar callbackUrl con la respuesta — SOLO tras verificar allowlist
    const callbackRes = await fetch(callbackUrl, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ sessionId, reply: result.reply }),
    })

    if (!callbackRes.ok) {
      res.status(502).json({ error: 'Callback delivery failed' })
      return
    }

    res.json({ ok: true, replied: true })
  })

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })

  const addr    = server.address() as { port: number }
  const baseUrl = `http://127.0.0.1:${addr.port}`

  return { baseUrl, server, cleanup: async () => { await new Promise<void>((r) => server.close(() => r())) } }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('F3a-IV — E2E Webhook: SSRF allowlist + sessionId required', () => {
  let testApp: WebhookTestApp
  let agentStub: ReturnType<typeof makeAgentStub>

  const AGENT_REPLY = 'Respuesta webhook E2E'

  beforeAll(async () => {
    agentStub = makeAgentStub(AGENT_REPLY)
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url: url.toString(), body: JSON.parse((init?.body as string) ?? '{}') })
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })
    testApp = await startWebhookTestApp(agentStub, ALLOWLIST)
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

  it('processes valid webhook payload and calls callbackUrl', async () => {
    const payload = buildWebhookPayload()
    const res = await fetch(`${testApp.baseUrl}/webhook/incoming`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const json = await res.json() as { ok: boolean; replied: boolean }
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.replied).toBe(true)
    const cbCall = fetchCalls.find((c) => c.url === ALLOWED_CALLBACK)
    expect(cbCall).toBeDefined()
    expect((cbCall?.body as { reply: string }).reply).toBe(AGENT_REPLY)
  })

  it('rejects request without sessionId → 400', async () => {
    const payload = buildWebhookPayload({ sessionId: '' })
    const res = await fetch(`${testApp.baseUrl}/webhook/incoming`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    expect(res.status).toBe(400)
  })

  it('rejects request with missing sessionId field → 400', async () => {
    const { sessionId: _, ...noSessionId } = buildWebhookPayload()
    const res = await fetch(`${testApp.baseUrl}/webhook/incoming`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(noSessionId),
    })
    expect(res.status).toBe(400)
  })

  it('blocks SSRF via non-allowlisted callbackUrl → 400', async () => {
    const payload = buildWebhookPayload({ callbackUrl: BLOCKED_CALLBACK })
    const res = await fetch(`${testApp.baseUrl}/webhook/incoming`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toContain('WEBHOOK_CALLBACK_ALLOWLIST')
  })

  it('blocks SSRF via internal IP in callbackUrl → 400', async () => {
    const internalIp = 'http://192.168.1.1/admin'
    const payload    = buildWebhookPayload({ callbackUrl: internalIp })
    const res        = await fetch(`${testApp.baseUrl}/webhook/incoming`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    expect(res.status).toBe(400)
  })

  it('blocks SSRF via localhost callbackUrl → 400', async () => {
    const localhostUrl = 'http://localhost:3000/internal'
    const payload      = buildWebhookPayload({ callbackUrl: localhostUrl })
    const res          = await fetch(`${testApp.baseUrl}/webhook/incoming`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    expect(res.status).toBe(400)
  })

  it('does NOT call fetch when callbackUrl is blocked (no SSRF leak)', async () => {
    const payload = buildWebhookPayload({ callbackUrl: BLOCKED_CALLBACK })
    await fetch(`${testApp.baseUrl}/webhook/incoming`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const externalCall = fetchCalls.find((c) => c.url === BLOCKED_CALLBACK)
    expect(externalCall).toBeUndefined()
  })

  it('returns 502 when callbackUrl delivery fails', async () => {
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url: url.toString(), body: JSON.parse((init?.body as string) ?? '{}') })
      if (url === ALLOWED_CALLBACK) {
        return { ok: false, status: 500, json: async () => ({}) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })
    const payload = buildWebhookPayload()
    const res     = await fetch(`${testApp.baseUrl}/webhook/incoming`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    expect(res.status).toBe(502)
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url: url.toString(), body: JSON.parse((init?.body as string) ?? '{}') })
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })
  })
})
