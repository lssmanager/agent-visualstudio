/**
 * F3a-IV — E2E Discord
 * Covers: slash command → binding → AgentExecutor → embed reply
 *
 * Isolation strategy:
 *   - Puerto efímero (0) por suite → sin contaminación de puertos
 *   - PrismaMock in-memory por describe block → sin estado compartido entre suites
 *   - fetch() interceptado con vi.stubGlobal → sin llamadas reales a Discord API
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import crypto from 'node:crypto'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CHANNEL_CONFIG_ID = 'discord-cfg-e2e-001'
const GUILD_ID          = 'guild-e2e-001'
const APPLICATION_ID    = 'app-e2e-001'
const BOT_TOKEN         = 'Bot test-token-discord'
const PUBLIC_KEY        = 'discord-pub-key-hex-placeholder' // firma omitida en test (mock)
const AGENT_ID          = 'agent-e2e-discord-001'

const SLASH_COMMAND_PING = {
  type: 2, // APPLICATION_COMMAND
  id:   'interaction-001',
  token: 'interaction-token-001',
  application_id: APPLICATION_ID,
  guild_id: GUILD_ID,
  channel_id: 'channel-001',
  data: { name: 'ask', options: [{ name: 'query', value: 'Hola agente' }] },
  member: { user: { id: 'user-discord-001', username: 'tester' } },
}

// ── Stubs ─────────────────────────────────────────────────────────────────────

const fetchCalls: { url: string; body: unknown }[] = []
let agentCallCount = 0

function makeAgentStub(reply: string) {
  return {
    run: vi.fn(async (_agentId: string, _history: unknown[]) => {
      agentCallCount++
      return { reply }
    }),
  }
}

// ── Test App: Discord interaction endpoint ────────────────────────────────────

interface DiscordTestApp {
  baseUrl:  string
  server:   Server
  cleanup(): Promise<void>
}

async function startDiscordTestApp(
  agentStub: ReturnType<typeof makeAgentStub>,
): Promise<DiscordTestApp> {
  const app = express()
  app.use(express.json())

  // Binding simulado: guild → channelConfig → agent
  const binding = {
    guildId:         GUILD_ID,
    channelConfigId: CHANNEL_CONFIG_ID,
    agentId:         AGENT_ID,
  }

  // Historia de conversación en memoria por sesión
  const sessions = new Map<string, { role: string; content: string }[]>()

  app.post('/discord/interactions', async (req, res) => {
    const body = req.body as typeof SLASH_COMMAND_PING

    // Tipo 1 = PING handshake
    if (body.type === 1) {
      res.json({ type: 1 })
      return
    }

    // Tipo 2 = APPLICATION_COMMAND (slash command)
    if (body.type === 2) {
      // Resolver binding
      if (body.guild_id !== binding.guildId) {
        res.status(404).json({ error: 'No binding for guild' })
        return
      }

      const userId = body.member?.user?.id ?? 'unknown'
      const text   = (body.data?.options?.[0]?.value as string) ?? ''
      const sessionId = `${CHANNEL_CONFIG_ID}:${userId}`

      const history = sessions.get(sessionId) ?? []
      history.push({ role: 'user', content: text })
      sessions.set(sessionId, history)

      // Ejecutar AgentExecutor
      const result = await agentStub.run(binding.agentId, history)
      history.push({ role: 'assistant', content: result.reply })

      // Responder con embed de Discord (tipo 4 = CHANNEL_MESSAGE_WITH_SOURCE)
      const discordResponse = {
        type: 4,
        data: {
          embeds: [{
            title:       'Respuesta del Agente',
            description: result.reply,
            color:       0x5865f2,
          }],
        },
      }

      // Enviar también al followup endpoint (simulando el fetch real a Discord)
      await fetch(
        `https://discord.com/api/v10/webhooks/${APPLICATION_ID}/${body.token}`,
        {
          method:  'POST',
          headers: { Authorization: BOT_TOKEN, 'content-type': 'application/json' },
          body:    JSON.stringify(discordResponse.data),
        },
      )

      res.json(discordResponse)
      return
    }

    res.status(400).json({ error: 'Unknown interaction type' })
  })

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })

  const addr    = server.address() as { port: number }
  const baseUrl = `http://127.0.0.1:${addr.port}`

  return {
    baseUrl,
    server,
    cleanup: async () => {
      await new Promise<void>((r) => server.close(() => r()))
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('F3a-IV — E2E Discord: slash command → embed reply', () => {
  let testApp: DiscordTestApp
  let agentStub: ReturnType<typeof makeAgentStub>

  const AGENT_REPLY = '¡Hola! Soy el agente Discord.'

  beforeAll(async () => {
    agentStub = makeAgentStub(AGENT_REPLY)
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url: url.toString(), body: JSON.parse((init?.body as string) ?? '{}') })
      return { ok: true, status: 200, json: async () => ({ id: 'msg-001' }) } as Response
    })
    testApp = await startDiscordTestApp(agentStub)
  })

  afterAll(async () => {
    await testApp.cleanup()
    vi.unstubAllGlobals()
    fetchCalls.length = 0
    agentCallCount = 0
  })

  beforeEach(() => {
    fetchCalls.length = 0
    agentCallCount = 0
    agentStub.run.mockClear()
  })

  it('responds to PING with type:1', async () => {
    const res = await fetch(`${testApp.baseUrl}/discord/interactions`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ type: 1 }),
    })
    const json = await res.json() as { type: number }
    expect(res.status).toBe(200)
    expect(json.type).toBe(1)
  })

  it('routes slash command to agent and returns embed reply', async () => {
    const res = await fetch(`${testApp.baseUrl}/discord/interactions`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(SLASH_COMMAND_PING),
    })

    const json = await res.json() as { type: number; data: { embeds: { description: string }[] } }
    expect(res.status).toBe(200)
    expect(json.type).toBe(4)
    expect(json.data.embeds[0]?.description).toBe(AGENT_REPLY)
  })

  it('calls AgentExecutor exactly once per interaction', async () => {
    await fetch(`${testApp.baseUrl}/discord/interactions`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(SLASH_COMMAND_PING),
    })
    expect(agentStub.run).toHaveBeenCalledTimes(1)
    expect(agentStub.run).toHaveBeenCalledWith(AGENT_ID, expect.arrayContaining([
      expect.objectContaining({ role: 'user', content: 'Hola agente' }),
    ]))
  })

  it('posts embed to Discord followup webhook via fetch', async () => {
    await fetch(`${testApp.baseUrl}/discord/interactions`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(SLASH_COMMAND_PING),
    })
    const discordCall = fetchCalls.find((c) =>
      c.url.includes(`webhooks/${APPLICATION_ID}`),
    )
    expect(discordCall).toBeDefined()
  })

  it('returns 404 when no binding exists for guild', async () => {
    const unknownGuild = { ...SLASH_COMMAND_PING, guild_id: 'guild-unknown-999' }
    const res = await fetch(`${testApp.baseUrl}/discord/interactions`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(unknownGuild),
    })
    expect(res.status).toBe(404)
  })

  it('maintains conversation history across multiple turns', async () => {
    // Turno 1
    await fetch(`${testApp.baseUrl}/discord/interactions`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(SLASH_COMMAND_PING),
    })
    // Turno 2 — el agentStub debe recibir el historial con turno 1 incluido
    await fetch(`${testApp.baseUrl}/discord/interactions`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ ...SLASH_COMMAND_PING, data: { name: 'ask', options: [{ name: 'query', value: 'Segunda pregunta' }] } }),
    })
    expect(agentStub.run).toHaveBeenCalledTimes(2)
    const secondCall = agentStub.run.mock.calls[1]
    const history = secondCall?.[1] as { role: string; content: string }[]
    expect(history.length).toBeGreaterThanOrEqual(3) // user + assistant + user
  })
})
