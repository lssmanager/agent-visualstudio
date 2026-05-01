/**
 * discord.e2e-spec.ts — [F3a-27] Tests E2E Discord slash commands
 *
 * Valida los 6 escenarios del criterio de aceptación de F3a-27:
 *   1. /ask con binding por channelId → AgentExecutor llamado → respuesta recibida
 *   2. /ask con binding por guildId (sin channel binding) → funciona como fallback
 *   3. /ask sin binding → devuelve mensaje de error legible (no lanza excepción)
 *   4. /status con binding → muestra agentId y scope correcto
 *   5. /status sin binding → devuelve instrucciones de configuración
 *   6. body inválido (faltan campos) → parseInteractionBody retorna null (no crash)
 *
 * Sin Discord real: usa mocks para Prisma y AgentExecutor.
 * Compatible con Jest / Vitest (describe/it/expect).
 */

import {
  DiscordCommandDispatcher,
  makeBindingResolver,
  parseInteractionBody,
  type CommandInteractionContext,
  type DiscordBindingResult,
  type DiscordChannelBinding,
} from '../../channels/discord.commands.js'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const GUILD_ID   = 'guild-abc-123'
const CHANNEL_ID = 'channel-xyz-456'
const AGENT_ID   = 'agent-001'
const CONFIG_ID  = 'cfg-001'
const USER_ID    = 'user-999'

/** Crea un CommandInteractionContext mínimo para los tests */
function makeCtx(
  commandName: string,
  overrides: Partial<CommandInteractionContext> = {},
): CommandInteractionContext {
  return {
    commandName,
    guildId:          GUILD_ID,
    channelId:        CHANNEL_ID,
    userId:           USER_ID,
    username:         'testuser',
    interactionId:    'iid-001',
    interactionToken: 'tok-abc',
    options:          {},
    ...overrides,
  }
}

/** Binding que vincula por channelId */
const CHANNEL_BINDING: DiscordChannelBinding = {
  agentId:           AGENT_ID,
  channelConfigId:   CONFIG_ID,
  externalChannelId: CHANNEL_ID,
  externalGuildId:   null,
}

/** Binding que vincula por guildId (sin channelId específico) */
const GUILD_BINDING: DiscordChannelBinding = {
  agentId:           AGENT_ID,
  channelConfigId:   CONFIG_ID,
  externalChannelId: null,
  externalGuildId:   GUILD_ID,
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock de AgentExecutor
// ─────────────────────────────────────────────────────────────────────────────

/** Mock de runAgent — registra la llamada y devuelve respuesta fija */
function makeMockAgent(response = '¡Hola! Soy el agente.') {
  const calls: Array<{ binding: DiscordBindingResult; userId: string; prompt: string }> = []

  const runAgent = async (
    binding: DiscordBindingResult,
    userId:  string,
    prompt:  string,
  ): Promise<string> => {
    calls.push({ binding, userId, prompt })
    return response
  }

  return { runAgent, calls }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build dispatcher
// ─────────────────────────────────────────────────────────────────────────────

function buildDispatcher(
  bindings: DiscordChannelBinding[],
  agentResponse = '¡Hola! Soy el agente.',
) {
  const { runAgent, calls } = makeMockAgent(agentResponse)
  const resolveBinding      = makeBindingResolver(bindings)
  const dispatcher          = new DiscordCommandDispatcher(resolveBinding, runAgent)
  return { dispatcher, calls }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite principal
// ─────────────────────────────────────────────────────────────────────────────

describe('[F3a-27] DiscordCommandDispatcher — slash commands E2E', () => {

  // ──────────────────────────────────────────────────────────────────────────
  // Escenario 1: /ask con binding por channelId
  // ──────────────────────────────────────────────────────────────────────────

  describe('/ask con binding por channelId', () => {
    it('llama a AgentExecutor y devuelve la respuesta', async () => {
      const { dispatcher, calls } = buildDispatcher([CHANNEL_BINDING])

      const ctx = makeCtx('ask', { options: { prompt: '¿Cuál es el estado?' } })
      const reply = await dispatcher.dispatch(ctx)

      // AgentExecutor fue llamado exactamente una vez
      expect(calls).toHaveLength(1)

      // La llamada usó el binding de canal correcto
      expect(calls[0]!.binding.scopeLevel).toBe('channel')
      expect(calls[0]!.binding.agentId).toBe(AGENT_ID)
      expect(calls[0]!.binding.scopeId).toBe(CHANNEL_ID)

      // El prompt llegó correctamente
      expect(calls[0]!.prompt).toBe('¿Cuál es el estado?')
      expect(calls[0]!.userId).toBe(USER_ID)

      // La respuesta contiene el texto del agente
      expect(reply).toBe('¡Hola! Soy el agente.')
    })

    it('trunca respuestas largas a 2000 caracteres', async () => {
      const longResponse = 'x'.repeat(3000)
      const { dispatcher } = buildDispatcher([CHANNEL_BINDING], longResponse)

      const ctx = makeCtx('ask', { options: { prompt: 'pregunta' } })
      const reply = await dispatcher.dispatch(ctx)

      expect(reply.length).toBe(2000)
    })

    it('prioriza channelBinding sobre guildBinding si ambos existen', async () => {
      // Ambos bindings disponibles — debe ganar el de canal
      const channelBindingAlt: DiscordChannelBinding = {
        agentId:           'agent-channel-priority',
        channelConfigId:   'cfg-channel',
        externalChannelId: CHANNEL_ID,
        externalGuildId:   null,
      }
      const guildBindingAlt: DiscordChannelBinding = {
        agentId:           'agent-guild-fallback',
        channelConfigId:   'cfg-guild',
        externalChannelId: null,
        externalGuildId:   GUILD_ID,
      }

      const { dispatcher, calls } = buildDispatcher([guildBindingAlt, channelBindingAlt])
      const ctx = makeCtx('ask', { options: { prompt: 'test' } })
      await dispatcher.dispatch(ctx)

      expect(calls[0]!.binding.agentId).toBe('agent-channel-priority')
      expect(calls[0]!.binding.scopeLevel).toBe('channel')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Escenario 2: /ask con binding por guildId (fallback)
  // ──────────────────────────────────────────────────────────────────────────

  describe('/ask con binding por guildId (fallback sin channelBinding)', () => {
    it('resuelve el binding de guild y llama al agente', async () => {
      const { dispatcher, calls } = buildDispatcher([GUILD_BINDING])

      // El channelId NO tiene binding propio — solo hay guildBinding
      const ctx = makeCtx('ask', {
        channelId: 'otro-canal-sin-binding',
        options:   { prompt: '¿Cómo estás?' },
      })
      const reply = await dispatcher.dispatch(ctx)

      expect(calls).toHaveLength(1)
      expect(calls[0]!.binding.scopeLevel).toBe('guild')
      expect(calls[0]!.binding.agentId).toBe(AGENT_ID)
      expect(calls[0]!.binding.scopeId).toBe(GUILD_ID)
      expect(reply).toBe('¡Hola! Soy el agente.')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Escenario 3: /ask sin binding → error legible, no excepción
  // ──────────────────────────────────────────────────────────────────────────

  describe('/ask sin binding activo', () => {
    it('devuelve mensaje de error legible y NO lanza excepción', async () => {
      const { dispatcher, calls } = buildDispatcher([]) // sin bindings

      const ctx = makeCtx('ask', { options: { prompt: 'cualquier pregunta' } })

      // No debe lanzar
      let reply!: string
      await expect(
        (async () => { reply = await dispatcher.dispatch(ctx) })()
      ).resolves.not.toThrow()

      // AgentExecutor NUNCA fue llamado
      expect(calls).toHaveLength(0)

      // El mensaje es legible y menciona el problema
      expect(reply).toContain('No hay agente vinculado')
      expect(reply).toContain(CHANNEL_ID)
      expect(reply).toContain(GUILD_ID)
    })

    it('devuelve error legible cuando prompt está vacío', async () => {
      const { dispatcher } = buildDispatcher([CHANNEL_BINDING])

      const ctx = makeCtx('ask', { options: { prompt: '' } })
      const reply = await dispatcher.dispatch(ctx)

      expect(reply).toContain('Debes proporcionar un prompt')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Escenario 4: /status con binding → muestra agentId y scope
  // ──────────────────────────────────────────────────────────────────────────

  describe('/status con binding activo', () => {
    it('con binding de canal muestra agentId y scope=channel', async () => {
      const { dispatcher } = buildDispatcher([CHANNEL_BINDING])

      const ctx = makeCtx('status')
      const reply = await dispatcher.dispatch(ctx)

      expect(reply).toContain('Agente vinculado')
      expect(reply).toContain(AGENT_ID)
      expect(reply).toContain('channel')
      expect(reply).toContain(CONFIG_ID)
    })

    it('con binding de guild muestra agentId y scope=guild', async () => {
      const { dispatcher } = buildDispatcher([GUILD_BINDING])

      // Canal sin binding propio — resuelve por guild
      const ctx = makeCtx('status', { channelId: 'canal-sin-binding' })
      const reply = await dispatcher.dispatch(ctx)

      expect(reply).toContain('Agente vinculado')
      expect(reply).toContain(AGENT_ID)
      expect(reply).toContain('guild')
      expect(reply).toContain(GUILD_ID)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Escenario 5: /status sin binding → instrucciones de configuración
  // ──────────────────────────────────────────────────────────────────────────

  describe('/status sin binding activo', () => {
    it('devuelve instrucciones de configuración claras', async () => {
      const { dispatcher } = buildDispatcher([])

      const ctx = makeCtx('status')
      const reply = await dispatcher.dispatch(ctx)

      expect(reply).toContain('No hay agente vinculado')
      // Debe mencionar cómo configurar (channelId y guildId)
      expect(reply).toContain(CHANNEL_ID)
      expect(reply).toContain(GUILD_ID)
    })

    it('sin guildId sigue siendo legible', async () => {
      const { dispatcher } = buildDispatcher([])

      const ctx = makeCtx('status', { guildId: null })
      const reply = await dispatcher.dispatch(ctx)

      expect(reply).toContain('No hay agente vinculado')
      expect(reply).toContain(CHANNEL_ID)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Escenario 6: parseInteractionBody con body inválido → null (no crash)
  // ──────────────────────────────────────────────────────────────────────────

  describe('parseInteractionBody — validación de campos', () => {
    it('retorna null si falta data.name (commandName)', () => {
      const body = {
        type:        2,
        id:          'iid-1',
        token:       'tok-1',
        channel_id:  'chan-1',
        guild_id:    'guild-1',
        member:      { user: { id: 'uid-1', username: 'user' } },
        data:        { options: [] }, // sin name
      }
      expect(parseInteractionBody(body)).toBeNull()
    })

    it('retorna null si falta channel_id', () => {
      const body = {
        type:    2,
        id:      'iid-1',
        token:   'tok-1',
        guild_id: 'guild-1',
        member:  { user: { id: 'uid-1', username: 'user' } },
        data:    { name: 'ask', options: [] },
        // sin channel_id
      }
      expect(parseInteractionBody(body)).toBeNull()
    })

    it('retorna null si falta el token de interacción', () => {
      const body = {
        type:       2,
        id:         'iid-1',
        channel_id: 'chan-1',
        guild_id:   'guild-1',
        member:     { user: { id: 'uid-1', username: 'user' } },
        data:       { name: 'ask', options: [] },
        // sin token
      }
      expect(parseInteractionBody(body)).toBeNull()
    })

    it('retorna null si falta el userId (member.user.id)', () => {
      const body = {
        type:       2,
        id:         'iid-1',
        token:      'tok-1',
        channel_id: 'chan-1',
        guild_id:   'guild-1',
        member:     { user: { username: 'user' } }, // sin id
        data:       { name: 'ask', options: [] },
      }
      expect(parseInteractionBody(body)).toBeNull()
    })

    it('retorna null para body completamente vacío', () => {
      expect(parseInteractionBody({})).toBeNull()
    })

    it('parsea correctamente un body válido con opciones', () => {
      const body = {
        type:       2,
        id:         'iid-valid',
        token:      'tok-valid',
        channel_id: CHANNEL_ID,
        guild_id:   GUILD_ID,
        member:     { user: { id: USER_ID, username: 'testuser' } },
        data: {
          name:    'ask',
          options: [{ name: 'prompt', value: '¿Qué hora es?' }],
        },
      }
      const ctx = parseInteractionBody(body)

      expect(ctx).not.toBeNull()
      expect(ctx!.commandName).toBe('ask')
      expect(ctx!.channelId).toBe(CHANNEL_ID)
      expect(ctx!.guildId).toBe(GUILD_ID)
      expect(ctx!.userId).toBe(USER_ID)
      expect(ctx!.username).toBe('testuser')
      expect(ctx!.interactionId).toBe('iid-valid')
      expect(ctx!.interactionToken).toBe('tok-valid')
      expect(ctx!.options['prompt']).toBe('¿Qué hora es?')
    })

    it('acepta interacción DM (sin guild_id) y lo normaliza a null', () => {
      const body = {
        type:       2,
        id:         'iid-dm',
        token:      'tok-dm',
        channel_id: 'dm-channel',
        user:       { id: 'uid-dm', username: 'dmuser' }, // DM usa body.user, no member
        data:       { name: 'status', options: [] },
        // sin guild_id
      }
      const ctx = parseInteractionBody(body)

      expect(ctx).not.toBeNull()
      expect(ctx!.guildId).toBeNull()
      expect(ctx!.userId).toBe('uid-dm')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Escenario extra: comando desconocido no lanza
  // ──────────────────────────────────────────────────────────────────────────

  describe('comando desconocido', () => {
    it('devuelve mensaje de comando desconocido sin lanzar', async () => {
      const { dispatcher } = buildDispatcher([])

      const ctx = makeCtx('unknown-command')
      const reply = await dispatcher.dispatch(ctx)

      expect(reply).toContain('Comando desconocido')
      expect(reply).toContain('unknown-command')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Escenario extra: error interno del agente → mensaje legible, no excepción
  // ──────────────────────────────────────────────────────────────────────────

  describe('error interno del AgentExecutor', () => {
    it('captura errores y devuelve mensaje legible sin propagar la excepción', async () => {
      const resolveBinding = makeBindingResolver([CHANNEL_BINDING])
      const runAgent = async (): Promise<string> => {
        throw new Error('LLM timeout')
      }
      const dispatcher = new DiscordCommandDispatcher(resolveBinding, runAgent)

      const ctx = makeCtx('ask', { options: { prompt: 'pregunta' } })
      const reply = await dispatcher.dispatch(ctx)

      expect(reply).toContain('Error al procesar el comando')
      expect(reply).toContain('LLM timeout')
    })
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// Tests unitarios de makeBindingResolver
// ─────────────────────────────────────────────────────────────────────────────

describe('[F3a-27] makeBindingResolver — resolución de bindings', () => {

  it('retorna null cuando no hay bindings', async () => {
    const resolve = makeBindingResolver([])
    const result  = await resolve(GUILD_ID, CHANNEL_ID)
    expect(result).toBeNull()
  })

  it('resuelve por externalChannelId cuando coincide', async () => {
    const resolve = makeBindingResolver([CHANNEL_BINDING])
    const result  = await resolve(GUILD_ID, CHANNEL_ID)

    expect(result).not.toBeNull()
    expect(result!.scopeLevel).toBe('channel')
    expect(result!.scopeId).toBe(CHANNEL_ID)
    expect(result!.agentId).toBe(AGENT_ID)
  })

  it('resuelve por externalGuildId como fallback cuando no hay channelBinding', async () => {
    const resolve = makeBindingResolver([GUILD_BINDING])
    const result  = await resolve(GUILD_ID, 'otro-canal')

    expect(result).not.toBeNull()
    expect(result!.scopeLevel).toBe('guild')
    expect(result!.scopeId).toBe(GUILD_ID)
    expect(result!.agentId).toBe(AGENT_ID)
  })

  it('prioriza channelBinding sobre guildBinding', async () => {
    const channelB: DiscordChannelBinding = { agentId: 'a-ch', channelConfigId: 'c-ch', externalChannelId: CHANNEL_ID, externalGuildId: null }
    const guildB:   DiscordChannelBinding = { agentId: 'a-gu', channelConfigId: 'c-gu', externalChannelId: null, externalGuildId: GUILD_ID }

    const resolve = makeBindingResolver([guildB, channelB]) // guild primero en array
    const result  = await resolve(GUILD_ID, CHANNEL_ID)

    expect(result!.scopeLevel).toBe('channel')
    expect(result!.agentId).toBe('a-ch')
  })

  it('retorna null si guildId es null y no hay channelBinding', async () => {
    const resolve = makeBindingResolver([GUILD_BINDING])
    const result  = await resolve(null, 'canal-sin-binding')
    expect(result).toBeNull()
  })

  it('no resuelve si el channelId no coincide con ningún externalChannelId', async () => {
    const resolve = makeBindingResolver([CHANNEL_BINDING])
    const result  = await resolve(GUILD_ID, 'canal-diferente')

    // GUILD_BINDING no está en la lista, solo CHANNEL_BINDING con otro channelId
    // Cae a guild lookup: CHANNEL_BINDING.externalGuildId === null → null
    expect(result).toBeNull()
  })
})
