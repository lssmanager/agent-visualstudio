/**
 * F3a-IV — E2E WhatsApp
 * Covers: getOrCreate() concurrencia — race condition guard (#177)
 *
 * Isolation strategy:
 *   - WhatsApp session store in-memory con Map<string, Promise<>> lock
 *   - Múltiples llamadas concurrentes al mismo phoneNumber → solo 1 sesión creada
 *   - fetch() interceptado para simular Baileys API
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CHANNEL_CONFIG_ID = 'whatsapp-cfg-e2e-001'
const AGENT_ID          = 'agent-e2e-whatsapp-001'

interface WhatsAppSession {
  phoneNumber:     string
  channelConfigId: string
  status:          'connecting' | 'connected' | 'disconnected'
  createdAt:       Date
  qrCode?:         string
}

// ── In-memory session store con race condition guard ──────────────────────────

class WhatsAppSessionStore {
  private sessions  = new Map<string, WhatsAppSession>()
  private pending   = new Map<string, Promise<WhatsAppSession>>()
  public  createCount = 0

  async getOrCreate(
    phoneNumber:     string,
    channelConfigId: string,
  ): Promise<WhatsAppSession> {
    const key = `${channelConfigId}:${phoneNumber}`

    // 1. Ya existe → devolver inmediatamente
    const existing = this.sessions.get(key)
    if (existing) return existing

    // 2. Hay una creación pendiente → esperar la misma promesa
    const inFlight = this.pending.get(key)
    if (inFlight) return inFlight

    // 3. Crear nueva sesión y registrar la promesa como lock
    const creation = this._createSession(phoneNumber, channelConfigId).finally(() => {
      this.pending.delete(key)
    })
    this.pending.set(key, creation)
    return creation
  }

  private async _createSession(
    phoneNumber:     string,
    channelConfigId: string,
  ): Promise<WhatsAppSession> {
    // Simular latencia de inicialización de Baileys
    await new Promise((r) => setTimeout(r, 10))

    this.createCount++

    const session: WhatsAppSession = {
      phoneNumber,
      channelConfigId,
      status:    'connecting',
      createdAt: new Date(),
    }

    const key = `${channelConfigId}:${phoneNumber}`
    this.sessions.set(key, session)
    return session
  }

  get(phoneNumber: string, channelConfigId: string): WhatsAppSession | undefined {
    return this.sessions.get(`${channelConfigId}:${phoneNumber}`)
  }

  clear(): void {
    this.sessions.clear()
    this.pending.clear()
    this.createCount = 0
  }
}

// ── Test App ──────────────────────────────────────────────────────────────────

interface WhatsAppTestApp {
  baseUrl:   string
  server:    Server
  store:     WhatsAppSessionStore
  cleanup(): Promise<void>
}

async function startWhatsAppTestApp(
  agentReply: string,
): Promise<WhatsAppTestApp> {
  const app   = express()
  const store = new WhatsAppSessionStore()
  app.use(express.json())

  const sessions = new Map<string, { role: string; content: string }[]>()

  app.post('/whatsapp/incoming', async (req, res) => {
    const body = req.body as {
      phoneNumber: string
      text:        string
      messageId:   string
    }

    if (!body.phoneNumber || !body.text) {
      res.status(400).json({ error: 'phoneNumber and text are required' })
      return
    }

    // getOrCreate con race-condition guard
    const session = await store.getOrCreate(body.phoneNumber, CHANNEL_CONFIG_ID)

    const sessionId = `${CHANNEL_CONFIG_ID}:${body.phoneNumber}`
    const history   = sessions.get(sessionId) ?? []
    history.push({ role: 'user', content: body.text })
    sessions.set(sessionId, history)

    const reply = agentReply
    history.push({ role: 'assistant', content: reply })

    // Simular envío via fetch (Baileys → WhatsApp Cloud API)
    const sendRes = await fetch('https://graph.facebook.com/v19.0/wa-number-id/messages', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        messaging_product: 'whatsapp',
        to:                body.phoneNumber,
        type:              'text',
        text:              { body: reply },
      }),
    })

    if (!sendRes.ok) {
      res.status(502).json({ error: 'WhatsApp delivery failed' })
      return
    }

    res.json({ ok: true, sessionStatus: session.status, reply })
  })

  // Endpoint para crear sesiones concurrentemente (test de race condition)
  app.post('/whatsapp/session/init', async (req, res) => {
    const { phoneNumber } = req.body as { phoneNumber: string }
    if (!phoneNumber) {
      res.status(400).json({ error: 'phoneNumber required' })
      return
    }
    const session = await store.getOrCreate(phoneNumber, CHANNEL_CONFIG_ID)
    res.json({ ok: true, status: session.status, createCount: store.createCount })
  })

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })

  const addr    = server.address() as { port: number }
  const baseUrl = `http://127.0.0.1:${addr.port}`

  return {
    baseUrl, server, store,
    cleanup: async () => {
      await new Promise<void>((r) => server.close(() => r()))
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('F3a-IV — E2E WhatsApp: getOrCreate() concurrencia', () => {
  let testApp: WhatsAppTestApp
  const AGENT_REPLY = 'Respuesta WhatsApp E2E'

  beforeAll(async () => {
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.includes('graph.facebook.com')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.001' }] }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })
    testApp = await startWhatsAppTestApp(AGENT_REPLY)
  })

  afterAll(async () => {
    await testApp.cleanup()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    testApp.store.clear()
  })

  it('creates session and processes message successfully', async () => {
    const res = await fetch(`${testApp.baseUrl}/whatsapp/incoming`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ phoneNumber: '+573001234567', text: 'Hola WhatsApp', messageId: 'msg-001' }),
    })
    const json = await res.json() as { ok: boolean; sessionStatus: string; reply: string }
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.sessionStatus).toBe('connecting')
    expect(json.reply).toBe(AGENT_REPLY)
  })

  it('creates exactly ONE session when getOrCreate() is called concurrently for same phoneNumber', async () => {
    const phoneNumber = '+573009999999'
    const CONCURRENCY = 10

    // Disparar 10 inicializaciones simultáneas al mismo número
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        fetch(`${testApp.baseUrl}/whatsapp/session/init`, {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify({ phoneNumber }),
        }).then((r) => r.json() as Promise<{ createCount: number; status: string }>),
      ),
    )

    // Todos deben haber obtenido una sesión válida
    for (const result of results) {
      expect(result.status).toBe('connecting')
    }

    // La sesión debe haberse creado UNA sola vez
    expect(testApp.store.createCount).toBe(1)
  })

  it('reuses existing session on subsequent calls (no recreation)', async () => {
    const phoneNumber = '+573008888888'

    // Primera llamada
    await fetch(`${testApp.baseUrl}/whatsapp/session/init`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ phoneNumber }),
    })

    const countAfterFirst = testApp.store.createCount

    // Segunda llamada al mismo número
    await fetch(`${testApp.baseUrl}/whatsapp/session/init`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ phoneNumber }),
    })

    // No debe haber creado otra sesión
    expect(testApp.store.createCount).toBe(countAfterFirst)
  })

  it('creates independent sessions for different phone numbers', async () => {
    const phones = ['+573001111111', '+573002222222', '+573003333333']

    await Promise.all(
      phones.map((phoneNumber) =>
        fetch(`${testApp.baseUrl}/whatsapp/session/init`, {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify({ phoneNumber }),
        }),
      ),
    )

    expect(testApp.store.createCount).toBe(phones.length)

    for (const phone of phones) {
      const session = testApp.store.get(phone, CHANNEL_CONFIG_ID)
      expect(session).toBeDefined()
      expect(session?.phoneNumber).toBe(phone)
    }
  })

  it('returns 502 when WhatsApp delivery fails', async () => {
    vi.stubGlobal('fetch', async (url: string, _init?: RequestInit) => {
      if (url.includes('graph.facebook.com')) {
        return { ok: false, status: 500, json: async () => ({ error: 'Internal Error' }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    const res = await fetch(`${testApp.baseUrl}/whatsapp/incoming`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ phoneNumber: '+573007777777', text: 'Test fallo', messageId: 'msg-fail' }),
    })
    expect(res.status).toBe(502)

    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.includes('graph.facebook.com')) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.001' }] }) } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })
  })
})
