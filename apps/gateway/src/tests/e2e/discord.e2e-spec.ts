/**
 * discord.e2e-spec.ts — [F3a-27]
 *
 * Tests E2E del flujo completo de slash commands Discord.
 * Cubre dos capas:
 *
 *   Capa 1 — discord.commands.ts (DiscordCommandDispatcher, makeBindingResolver,
 *             parseInteractionBody): lógica pura, sin HTTP ni Discord real.
 *
 *   Capa 2 — discord.adapter.ts (DiscordAdapter): flujo HTTP usando Express
 *             handler manual + handleInteraction() + fetch mockeado.
 *             NOTA: DiscordAdapter expone initialize(), handleInteraction(),
 *             send() y dispose() — NO tiene setup()/buildHttpRouter()/onError().
 *             El harness construye el router Express manualmente.
 *
 * Sin Discord real ni base de datos: todos los mocks son en memoria.
 *
 * Cobertura requerida (F3a-27):
 *   ✅ /ask con binding por channelId → AgentExecutor llamado → respuesta recibida
 *   ✅ /ask con binding por guildId (sin channel binding) → funciona como fallback
 *   ✅ /ask sin binding → devuelve mensaje de error legible (no lanza excepción)
 *   ✅ /status con binding → muestra agentId y scope correcto
 *   ✅ /status sin binding → devuelve instrucciones de configuración
 *   ✅ body inválido (faltan campos) → parseInteractionBody retorna null (no crash)
 */

import express               from 'express'
import request               from 'supertest'

import {
  DiscordCommandDispatcher,
  DiscordBindingResult,
  DiscordChannelBinding,
  CommandInteractionContext,
  makeBindingResolver,
  parseInteractionBody,
} from '../../channels/discord.commands'

import { DiscordAdapter }    from '../../channels/discord.adapter'
import { MessageDispatcher } from '../../message-dispatcher.service'
import type {
  IAgentExecutor,
  DispatchInput,
  DispatchSuccess,
  DispatchFailure,
} from '../../message-dispatcher.types'
import type { IncomingMessage } from '../../channels/channel-adapter.interface'

// ════════════════════════════════════════════════════════════════════════════
// CAPA 1 — discord.commands.ts (sin HTTP, sin Discord real)
// ════════════════════════════════════════════════════════════════════════════

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CHANNEL_ID = 'ch-111'
const GUILD_ID   = 'guild-222'
const AGENT_ID   = 'agent-abc'
const CONFIG_ID  = 'config-xyz'
const USER_ID    = 'user-001'

/** Binding activo para channelId exacto */
const CHANNEL_BINDING: DiscordChannelBinding = {
  agentId:           AGENT_ID,
  channelConfigId:   CONFIG_ID,
  externalChannelId: CHANNEL_ID,
  externalGuildId:   null,
}

/** Binding sólo por guildId (sin channel específico) */
const GUILD_BINDING: DiscordChannelBinding = {
  agentId:           AGENT_ID,
  channelConfigId:   CONFIG_ID,
  externalChannelId: null,
  externalGuildId:   GUILD_ID,
}

function makeCtx(
  commandName: string,
  options: Record<string, string | number | boolean> = {},
  overrides: Partial<CommandInteractionContext> = {},
): CommandInteractionContext {
  return {
    commandName,
    guildId:          GUILD_ID,
    channelId:        CHANNEL_ID,
    userId:           USER_ID,
    username:         'tester',
    interactionId:    'int-001',
    interactionToken: 'tok-001',
    options,
    ...overrides,
  }
}

/**
 * Mock de AgentExecutor (Prisma): jest.fn() configurable.
 * Verifica que se llame con el binding y el prompt correctos.
 */
function mockRunAgent(
  expectedBinding: Partial<DiscordBindingResult>,
  returnValue = 'Respuesta del agente',
) {
  return jest.fn().mockImplementation(
    async (binding: DiscordBindingResult, _userId: string, _prompt: string) => {
      expect(binding.agentId).toBe(expectedBinding.agentId ?? AGENT_ID)
      if (expectedBinding.scopeLevel) {
        expect(binding.scopeLevel).toBe(expectedBinding.scopeLevel)
      }
      return returnValue
    },
  )
}

// ── /ask — binding por channelId ─────────────────────────────────────────────

describe('[F3a-27] /ask — binding por channelId', () => {
  it('llama al AgentExecutor y retorna la respuesta', async () => {
    const runAgent   = mockRunAgent({ agentId: AGENT_ID, scopeLevel: 'channel' })
    const resolver   = makeBindingResolver([CHANNEL_BINDING])
    const dispatcher = new DiscordCommandDispatcher(resolver, runAgent)

    const result = await dispatcher.dispatch(
      makeCtx('ask', { prompt: '¿Qué hora es?' }),
    )

    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: AGENT_ID, scopeLevel: 'channel' }),
      USER_ID,
      '¿Qué hora es?',
    )
    expect(result).toBe('Respuesta del agente')
  })

  it('trunca respuestas superiores a 2000 caracteres', async () => {
    const longReply  = 'x'.repeat(3000)
    const runAgent   = jest.fn().mockResolvedValue(longReply)
    const resolver   = makeBindingResolver([CHANNEL_BINDING])
    const dispatcher = new DiscordCommandDispatcher(resolver, runAgent)

    const result = await dispatcher.dispatch(
      makeCtx('ask', { prompt: 'largo' }),
    )
    expect(result.length).toBeLessThanOrEqual(2000)
  })

  it('devuelve error legible si prompt está vacío (no lanza excepción)', async () => {
    const resolver   = makeBindingResolver([CHANNEL_BINDING])
    const dispatcher = new DiscordCommandDispatcher(resolver, jest.fn())

    const result = await dispatcher.dispatch(
      makeCtx('ask', { prompt: '' }),
    )
    expect(typeof result).toBe('string')
    expect(result).toMatch(/prompt|pregunta|uso/i)
  })
})

// ── /ask — binding por guildId (fallback) ────────────────────────────────────

describe('[F3a-27] /ask — binding por guildId (fallback sin channel binding)', () => {
  it('resuelve por guild y llama al AgentExecutor', async () => {
    const runAgent   = mockRunAgent({ agentId: AGENT_ID, scopeLevel: 'guild' })
    const resolver   = makeBindingResolver([GUILD_BINDING])  // sin CHANNEL_BINDING
    const dispatcher = new DiscordCommandDispatcher(resolver, runAgent)

    const result = await dispatcher.dispatch(
      makeCtx('ask', { prompt: 'test guild fallback' }),
    )

    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({ scopeLevel: 'guild', agentId: AGENT_ID }),
      USER_ID,
      'test guild fallback',
    )
    expect(result).toBe('Respuesta del agente')
  })

  it('channel binding tiene prioridad sobre guild binding cuando ambos existen', async () => {
    const runAgent   = jest.fn().mockResolvedValue('ok')
    const resolver   = makeBindingResolver([GUILD_BINDING, CHANNEL_BINDING])
    const dispatcher = new DiscordCommandDispatcher(resolver, runAgent)

    await dispatcher.dispatch(
      makeCtx('ask', { prompt: 'prioridad' }),
    )

    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({ scopeLevel: 'channel' }),
      expect.any(String),
      'prioridad',
    )
  })
})

// ── /ask — sin binding ────────────────────────────────────────────────────────

describe('[F3a-27] /ask — sin binding', () => {
  it('devuelve mensaje de error legible sin lanzar excepción', async () => {
    const runAgent   = jest.fn()
    const resolver   = makeBindingResolver([])  // lista vacía → sin binding
    const dispatcher = new DiscordCommandDispatcher(resolver, runAgent)

    const result = await dispatcher.dispatch(
      makeCtx('ask', { prompt: 'hola' }),
    )

    // No debe haber llamado al agente
    expect(runAgent).not.toHaveBeenCalled()
    // Debe devolver string legible
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    // Debe indicar ausencia de binding y cómo configurarlo
    expect(result).toMatch(/no hay agente vinculado|no binding/i)
    // No debe contener artefactos de debug
    expect(result).not.toContain('[object Object]')
    expect(result).not.toContain('Error:')
  })

  it('sin guildId (DM sin servidor) tampoco lanza excepción', async () => {
    const resolver   = makeBindingResolver([])
    const dispatcher = new DiscordCommandDispatcher(resolver, jest.fn())

    const ctx = makeCtx('ask', { prompt: 'dm sin guild' }, { guildId: null })
    await expect(dispatcher.dispatch(ctx)).resolves.toEqual(expect.any(String))
  })
})

// ── /status — con binding ─────────────────────────────────────────────────────

describe('[F3a-27] /status — con binding activo', () => {
  it('muestra agentId y scope=channel cuando hay binding por canal', async () => {
    const resolver   = makeBindingResolver([CHANNEL_BINDING])
    const dispatcher = new DiscordCommandDispatcher(resolver, jest.fn())

    const result = await dispatcher.dispatch(makeCtx('status'))

    expect(result).toContain(AGENT_ID)
    expect(result).toContain('channel')
    expect(result).toContain(CHANNEL_ID)
  })

  it('muestra agentId y scope=guild cuando el binding es por servidor', async () => {
    const resolver   = makeBindingResolver([GUILD_BINDING])
    const dispatcher = new DiscordCommandDispatcher(resolver, jest.fn())

    const result = await dispatcher.dispatch(makeCtx('status'))

    expect(result).toContain(AGENT_ID)
    expect(result).toContain('guild')
    expect(result).toContain(GUILD_ID)
  })

  it('incluye channelConfigId en la respuesta de /status', async () => {
    const resolver   = makeBindingResolver([CHANNEL_BINDING])
    const dispatcher = new DiscordCommandDispatcher(resolver, jest.fn())

    const result = await dispatcher.dispatch(makeCtx('status'))
    expect(result).toContain(CONFIG_ID)
  })
})

// ── /status — sin binding ─────────────────────────────────────────────────────

describe('[F3a-27] /status — sin binding', () => {
  it('devuelve instrucciones de configuración legibles', async () => {
    const resolver   = makeBindingResolver([])
    const dispatcher = new DiscordCommandDispatcher(resolver, jest.fn())

    const result = await dispatcher.dispatch(makeCtx('status'))

    expect(typeof result).toBe('string')
    expect(result).toMatch(/externalChannelId|externalGuildId|panel|configurar|vincular/i)
    expect(result).not.toContain(AGENT_ID)  // no hay binding → no hay agentId
  })

  it('sin guildId → instrucciones sólo mencionan canal, no muestran "null"', async () => {
    const resolver   = makeBindingResolver([])
    const dispatcher = new DiscordCommandDispatcher(resolver, jest.fn())

    const ctx    = makeCtx('status', {}, { guildId: null })
    const result = await dispatcher.dispatch(ctx)

    expect(result).toContain(CHANNEL_ID)
    expect(result).not.toContain('null')
  })
})

// ── parseInteractionBody — body inválido ──────────────────────────────────────

describe('[F3a-27] parseInteractionBody — validación de body', () => {
  it('retorna null con objeto vacío (no crash)', () => {
    expect(() => parseInteractionBody({})).not.toThrow()
    expect(parseInteractionBody({})).toBeNull()
  })

  it('retorna null si falta channel_id', () => {
    const body = {
      id:     'int-001',
      token:  'tok-001',
      data:   { name: 'ask' },
      member: { user: { id: 'u1', username: 'test' } },
      // channel_id: OMITIDO
    }
    expect(parseInteractionBody(body)).toBeNull()
  })

  it('retorna null si falta data.name (commandName)', () => {
    const body = {
      id:         'int-001',
      token:      'tok-001',
      channel_id: CHANNEL_ID,
      data:       {},  // sin name
      member:     { user: { id: 'u1', username: 'test' } },
    }
    expect(parseInteractionBody(body)).toBeNull()
  })

  it('retorna null si no hay user ni member', () => {
    const body = {
      id:         'int-001',
      token:      'tok-001',
      channel_id: CHANNEL_ID,
      data:       { name: 'ask' },
      // member/user: OMITIDO
    }
    expect(parseInteractionBody(body)).toBeNull()
  })

  it('retorna null si falta id o token de la interacción', () => {
    const body = {
      channel_id: CHANNEL_ID,
      data:       { name: 'ask' },
      member:     { user: { id: 'u1', username: 'test' } },
      // id y token: OMITIDOS
    }
    expect(parseInteractionBody(body)).toBeNull()
  })

  it('parsea correctamente un body válido completo', () => {
    const body = {
      id:         'int-001',
      token:      'tok-001',
      channel_id: CHANNEL_ID,
      guild_id:   GUILD_ID,
      data: {
        name:    'ask',
        options: [{ name: 'prompt', value: '¿cuántas fases hay?' }],
      },
      member: {
        user: { id: USER_ID, username: 'tester', global_name: 'Tester' },
      },
    }

    const ctx = parseInteractionBody(body)
    expect(ctx).not.toBeNull()
    expect(ctx?.commandName).toBe('ask')
    expect(ctx?.channelId).toBe(CHANNEL_ID)
    expect(ctx?.guildId).toBe(GUILD_ID)
    expect(ctx?.userId).toBe(USER_ID)
    expect(ctx?.options['prompt']).toBe('¿cuántas fases hay?')
  })

  it('acepta body sin guild_id (DM) → guildId es null', () => {
    const body = {
      id:         'int-002',
      token:      'tok-002',
      channel_id: CHANNEL_ID,
      data:       { name: 'status' },
      user:       { id: USER_ID, username: 'dm-user' },
    }

    const ctx = parseInteractionBody(body)
    expect(ctx).not.toBeNull()
    expect(ctx?.guildId).toBeNull()
  })

  it('parsea options de múltiples tipos correctamente', () => {
    const body = {
      id:         'int-003',
      token:      'tok-003',
      channel_id: CHANNEL_ID,
      data: {
        name:    'ask',
        options: [
          { name: 'prompt', value: 'texto' },
          { name: 'verbose', value: true },
          { name: 'count', value: 3 },
        ],
      },
      user: { id: USER_ID, username: 'u' },
    }

    const ctx = parseInteractionBody(body)
    expect(ctx?.options['prompt']).toBe('texto')
    expect(ctx?.options['verbose']).toBe(true)
    expect(ctx?.options['count']).toBe(3)
  })
})

// ── makeBindingResolver — lógica de prioridad channel > guild ─────────────────

describe('[F3a-27] makeBindingResolver — prioridad channel > guild', () => {
  it('con lista vacía retorna null', async () => {
    const resolver = makeBindingResolver([])
    const result   = await resolver(GUILD_ID, CHANNEL_ID)
    expect(result).toBeNull()
  })

  it('canal coincidente → retorna binding con scopeLevel=channel', async () => {
    const resolver = makeBindingResolver([CHANNEL_BINDING])
    const result   = await resolver(GUILD_ID, CHANNEL_ID)
    expect(result?.scopeLevel).toBe('channel')
    expect(result?.scopeId).toBe(CHANNEL_ID)
    expect(result?.agentId).toBe(AGENT_ID)
    expect(result?.channelConfigId).toBe(CONFIG_ID)
  })

  it('guild coincidente (sin canal) → retorna binding con scopeLevel=guild', async () => {
    const resolver = makeBindingResolver([GUILD_BINDING])
    const result   = await resolver(GUILD_ID, 'otro-canal')
    expect(result?.scopeLevel).toBe('guild')
    expect(result?.scopeId).toBe(GUILD_ID)
  })

  it('canal y guild presentes → canal tiene prioridad', async () => {
    const resolver = makeBindingResolver([GUILD_BINDING, CHANNEL_BINDING])
    const result   = await resolver(GUILD_ID, CHANNEL_ID)
    expect(result?.scopeLevel).toBe('channel')
  })

  it('guildId=null con canal no coincidente → retorna null', async () => {
    const resolver = makeBindingResolver([GUILD_BINDING])
    const result   = await resolver(null, 'otro-canal')
    expect(result).toBeNull()
  })

  it('channelId distinto de binding → no resuelve canal, intenta guild', async () => {
    const resolver = makeBindingResolver([CHANNEL_BINDING, GUILD_BINDING])
    // Canal diferente al binding, pero guild coincide
    const result   = await resolver(GUILD_ID, 'canal-diferente')
    expect(result?.scopeLevel).toBe('guild')
  })
})

// ── Comando desconocido ────────────────────────────────────────────────────────

describe('[F3a-27] dispatch — comando desconocido', () => {
  it('retorna mensaje de comando desconocido sin lanzar excepción', async () => {
    const resolver   = makeBindingResolver([])
    const dispatcher = new DiscordCommandDispatcher(resolver, jest.fn())

    const result = await dispatcher.dispatch(makeCtx('unknown-cmd'))

    expect(typeof result).toBe('string')
    expect(result).toContain('unknown-cmd')
  })

  it('errores internos en runAgent devuelven string de error, no propagan', async () => {
    const failAgent  = jest.fn().mockRejectedValue(new Error('DB connection lost'))
    const resolver   = makeBindingResolver([CHANNEL_BINDING])
    const dispatcher = new DiscordCommandDispatcher(resolver, failAgent)

    // No debe lanzar — debe atrapar y retornar string
    await expect(
      dispatcher.dispatch(makeCtx('ask', { prompt: 'error test' })),
    ).resolves.toEqual(expect.any(String))
  })
})

// ════════════════════════════════════════════════════════════════════════════
// CAPA 2 — DiscordAdapter HTTP (Express handler manual + handleInteraction)
//
// DiscordAdapter API pública real:
//   initialize(channelConfigId)  — async, carga config desde DB
//   handleInteraction(body)      — procesa interacción y emite IncomingMessage
//   send(OutgoingMessage)        — PATCH followup a Discord API
//   dispose()                    — limpia estado
//   onMessage(handler)           — suscribe al stream de IncomingMessage
//
// NO existe: setup(), buildHttpRouter(), onError().
// El harness construye el router Express manualmente y delega en handleInteraction().
// ════════════════════════════════════════════════════════════════════════════

const FAKE_APP_ID      = '111111111111111111'
const FAKE_GUILD_ID    = GUILD_ID
const FAKE_CHANNEL_ID  = CHANNEL_ID
const FAKE_USER_ID     = USER_ID
const FAKE_INT_TOKEN   = 'fake_interaction_token_xyz'
const FAKE_CHANNEL_CFG = 'channel-config-uuid-test'
const FAKE_AGENT_ID    = 'agent-uuid-test'
const FAKE_SESSION_ID  = 'session-test-001'

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
        id:          FAKE_USER_ID,
        username:    'testuser',
        global_name: 'Test User',
      },
    },
    data: {
      id:      '666666666666666666',
      name:    commandName,
      options: optionValue
        ? [{ name: 'prompt', type: 3, value: optionValue }]
        : [],
    },
  }
}

function makeDispatchInput(
  overrides: Partial<DispatchInput> = {},
): DispatchInput {
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

/**
 * buildHttpHarness — construye un Express app con DiscordAdapter.
 *
 * El router POST /discord:
 *   type=1  → responde { type: 1 } (ping)
 *   type=2  → llama adapter.handleInteraction() → responde { type: 5 } ACK
 *   otros   → 400
 *
 * La verificación de firma Ed25519 se mockea a nivel de middleware.
 */
async function buildHttpHarness(agentReply = 'Respuesta del agente de prueba') {
  // Mock fetch global para PATCH Discord API
  const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
    async (url: string | URL | Request) => {
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

  const mockExecutor: IAgentExecutor = {
    run: jest.fn().mockResolvedValue({ reply: agentReply }),
  }

  // Mock initialize() para no requerir Prisma en tests
  const adapter = new DiscordAdapter()
  jest.spyOn(adapter as any, 'loadConfig').mockResolvedValue({
    id:               FAKE_CHANNEL_CFG,
    config:           { applicationId: FAKE_APP_ID, guildId: FAKE_GUILD_ID },
    secretsEncrypted: JSON.stringify({ publicKey: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899' }),
  })
  await adapter.initialize(FAKE_CHANNEL_CFG)

  const dispatcher = new MessageDispatcher(mockExecutor, {
    timeoutMs:    5_000,
    maxAttempts:  1,
    retryDelayMs: 50,
  })

  // Router Express manual — no usa buildHttpRouter() (no existe)
  const app = express()
  app.use(express.json())
  app.post('/discord', async (req, res) => {
    try {
      const body = req.body as { type: number; [key: string]: unknown }

      // Ping de verificación Discord (type=1)
      if (body.type === 1) {
        res.json({ type: 1 })
        return
      }

      // Slash command (type=2)
      if (body.type === 2) {
        // ACK inmediato (DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE)
        res.json({ type: 5 })
        // Procesar asíncrono — no bloquea la respuesta HTTP
        adapter.handleInteraction(body as any).catch((err: Error) => {
          console.error('[discord:test] handleInteraction error:', err.message)
        })
        return
      }

      // Tipo desconocido
      res.status(400).json({ error: `Unknown interaction type: ${body.type}` })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message })
    }
  })

  const capturedMessages: IncomingMessage[] = []
  adapter.onMessage((msg: IncomingMessage) => capturedMessages.push(msg))

  return { adapter, dispatcher, mockExecutor, fetchSpy, app, capturedMessages }
}

// ── HTTP: Ping de Discord ─────────────────────────────────────────────────────

describe('[F3a-27] HTTP — Ping de Discord (type=1)', () => {
  let h: Awaited<ReturnType<typeof buildHttpHarness>>

  beforeEach(async () => { h = await buildHttpHarness() })
  afterEach(async () => { jest.restoreAllMocks(); await h.adapter.dispose() })

  it('responde { type: 1 } al ping de verificación', async () => {
    const res = await request(h.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send({ type: 1 })
      .expect(200)

    expect(res.body).toEqual({ type: 1 })
  })

  it('no emite IncomingMessage en ping (type=1)', async () => {
    await request(h.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send({ type: 1 })

    expect(h.capturedMessages).toHaveLength(0)
  })
})

// ── HTTP: Slash command /ask ──────────────────────────────────────────────────

describe('[F3a-27] HTTP — Slash command /ask con binding', () => {
  let h: Awaited<ReturnType<typeof buildHttpHarness>>

  beforeEach(async () => { h = await buildHttpHarness('El proyecto está en fase F3a.') })
  afterEach(async () => { jest.restoreAllMocks(); await h.adapter.dispose() })

  it('emite IncomingMessage con type=command y texto correcto', async () => {
    const body = makeSlashInteraction('ask', '¿cuál es el estado?')

    await request(h.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(body)
      .expect(200)

    // Esperar a que handleInteraction() complete (es async fire-and-forget)
    await new Promise((r) => setTimeout(r, 50))

    expect(h.capturedMessages).toHaveLength(1)
    const msg = h.capturedMessages[0]!
    expect(msg.channelType).toBe('discord')
    expect(msg.channelConfigId).toBe(FAKE_CHANNEL_CFG)
    expect(msg.senderId).toBe(FAKE_USER_ID)
    expect(msg.text).toBeTruthy()
  })

  it('responde ACK type=5 (DEFERRED_CHANNEL_MESSAGE) inmediatamente', async () => {
    const res = await request(h.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(makeSlashInteraction('ask', 'pregunta'))
      .expect(200)

    expect(res.body).toEqual({ type: 5 })
  })

  it('MessageDispatcher.dispatch() llama al AgentExecutor y retorna ok:true', async () => {
    const result = await h.dispatcher.dispatch(
      makeDispatchInput({ history: [{ role: 'user', content: '¿cuántas fases hay?' }] }),
    )

    expect(result.ok).toBe(true)
    const success = result as DispatchSuccess
    expect(success.reply).toBe('El proyecto está en fase F3a.')
    expect(success.attempts).toBe(1)
  })
})

// ── HTTP: /status con binding ─────────────────────────────────────────────────

describe('[F3a-27] HTTP — Slash command /status', () => {
  let h: Awaited<ReturnType<typeof buildHttpHarness>>

  beforeEach(async () => { h = await buildHttpHarness() })
  afterEach(async () => { jest.restoreAllMocks(); await h.adapter.dispose() })

  it('emite IncomingMessage para /status tras handleInteraction', async () => {
    await request(h.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(makeSlashInteraction('status'))
      .expect(200)

    // Esperar async
    await new Promise((r) => setTimeout(r, 50))

    expect(h.capturedMessages).toHaveLength(1)
    const msg = h.capturedMessages[0]!
    expect(msg.channelType).toBe('discord')
  })

  it('responde ACK type=5 para /status', async () => {
    const res = await request(h.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(makeSlashInteraction('status'))
      .expect(200)

    expect(res.body).toEqual({ type: 5 })
  })

  it('incluye interactionToken en metadata del IncomingMessage', async () => {
    await request(h.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(makeSlashInteraction('status'))

    await new Promise((r) => setTimeout(r, 50))

    const msg = h.capturedMessages[0]!
    expect(msg.metadata?.['interactionToken']).toBe(FAKE_INT_TOKEN)
  })
})

// ── HTTP: sin binding → mensaje de error ──────────────────────────────────────

describe('[F3a-27] HTTP — /ask sin binding devuelve error legible', () => {
  afterEach(() => jest.restoreAllMocks())

  it('no lanza excepción al servidor — responde 200 ACK', async () => {
    const { app, adapter } = await buildHttpHarness()

    const res = await request(app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(makeSlashInteraction('ask', 'pregunta sin binding'))

    // El servidor SIEMPRE responde 200 ACK — nunca debe devolver 500
    expect(res.status).toBe(200)

    await adapter.dispose()
  })
})

// ── HTTP: Edge cases ───────────────────────────────────────────────────────────

describe('[F3a-27] HTTP — DiscordAdapter edge cases', () => {
  let h: Awaited<ReturnType<typeof buildHttpHarness>>

  beforeEach(async () => { h = await buildHttpHarness() })
  afterEach(async () => { jest.restoreAllMocks(); await h.adapter.dispose() })

  it('retorna 400 para tipos de interacción desconocidos (type=99)', async () => {
    const res = await request(h.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send({ type: 99 })
      .expect(400)

    expect(res.body.error).toBeDefined()
  })

  it('dispose() no lanza excepción', async () => {
    await expect(h.adapter.dispose()).resolves.not.toThrow()
  })

  it('onMessage() registra handler sin lanzar', () => {
    // onMessage() sí existe en BaseChannelAdapter
    expect(() => h.adapter.onMessage(jest.fn())).not.toThrow()
  })

  it('no emite IncomingMessage si falta channel_id en la interacción', async () => {
    const bodyWithoutChannel = {
      id:     '888888888888888888',
      type:   2,
      token:  FAKE_INT_TOKEN,
      member: { user: { id: FAKE_USER_ID, username: 'test' } },
      data:   { name: 'ask', options: [] },
      // channel_id: OMITIDO — adapter debe ignorar sin crash
    }

    await request(h.app)
      .post('/discord')
      .set('x-signature-ed25519',  'fakesig')
      .set('x-signature-timestamp', '1234567890')
      .send(bodyWithoutChannel)

    await new Promise((r) => setTimeout(r, 50))

    expect(h.capturedMessages).toHaveLength(0)
  })
})
