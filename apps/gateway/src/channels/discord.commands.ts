/**
 * discord.commands.ts — [F3a-27]
 *
 * Registro y despacho de slash commands Discord:
 *   /ask <prompt>  → envía un mensaje al agente y responde con el resultado
 *   /status        → muestra el estado del binding de este guild/canal
 *
 * Binding por guild/canal:
 *   Prioridad de resolución (más específico gana):
 *     channel  → binding.scopeLevel='channel', binding.scopeId=channelId
 *     guild    → binding.scopeLevel='guild',   binding.scopeId=guildId
 *
 * Flujo de registro:
 *   1. DiscordCommandRegistry.register()  → PUT /applications/:appId/guilds/:guildId/commands
 *   2. En cada interacción type=2, DiscordCommandDispatcher.dispatch()
 *      identifica el comando, resuelve binding, y devuelve la respuesta.
 *
 * Inspirado en el patrón del DiscordAdapter (F3a-26).
 */

// ── Constantes ────────────────────────────────────────────────────────────────

const DISCORD_API        = 'https://discord.com/api/v10'
const MAX_CONTENT_LENGTH = 2000

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface SlashCommandDefinition {
  name:        string
  description: string
  options?:    SlashCommandOption[]
}

export interface SlashCommandOption {
  type:        number   // 3 = STRING, 4 = INTEGER, 5 = BOOLEAN
  name:        string
  description: string
  required?:   boolean
}

/** Contexto de interacción normalizado, listo para el dispatcher */
export interface CommandInteractionContext {
  commandName:      string
  guildId:          string | null
  channelId:        string
  userId:           string
  username:         string
  interactionId:    string
  interactionToken: string
  options:          Record<string, string | number | boolean>
}

/**
 * Resultado de resolveBinding():
 *   - agentId + scopeLevel indican qué binding ganó
 *   - null si no hay binding activo para guild/canal
 */
export interface DiscordBindingResult {
  agentId:        string
  channelConfigId: string
  scopeLevel:     'channel' | 'guild'
  scopeId:        string
}

// ── Definiciones de comandos ──────────────────────────────────────────────────

export const DISCORD_SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    name:        'ask',
    description: 'Envía una pregunta al agente de IA configurado para este servidor',
    options: [
      {
        type:        3,   // STRING
        name:        'prompt',
        description: 'Tu pregunta o instrucción para el agente',
        required:    true,
      },
    ],
  },
  {
    name:        'status',
    description: 'Muestra el estado del agente de IA vinculado a este servidor/canal',
  },
]

// ── DiscordCommandRegistry ────────────────────────────────────────────────────

/**
 * Registra los slash commands en Discord vía REST.
 *
 * Uso:
 *   const reg = new DiscordCommandRegistry({ botToken, applicationId })
 *   await reg.registerGuild(guildId)     // commands de guild (instantáneos)
 *   await reg.registerGlobal()           // commands globales (hasta 1h de propagación)
 *   await reg.unregisterGuild(guildId)   // elimina todos los commands de un guild
 */
export class DiscordCommandRegistry {
  constructor(
    private readonly botToken:       string,
    private readonly applicationId:  string,
  ) {}

  /**
   * Registra todos los DISCORD_SLASH_COMMANDS en un guild específico.
   * Los guild commands son instantáneos y se usan en dev/staging.
   */
  async registerGuild(guildId: string): Promise<void> {
    const url = `${DISCORD_API}/applications/${this.applicationId}/guilds/${guildId}/commands`
    await this._bulkOverwrite(url)
    console.info(`[discord.commands] Guild commands registered for guild ${guildId}`)
  }

  /**
   * Registra todos los DISCORD_SLASH_COMMANDS como comandos globales.
   * Los global commands pueden tardar hasta 1 hora en propagarse.
   */
  async registerGlobal(): Promise<void> {
    const url = `${DISCORD_API}/applications/${this.applicationId}/commands`
    await this._bulkOverwrite(url)
    console.info('[discord.commands] Global commands registered')
  }

  /**
   * Elimina todos los slash commands de un guild (bulk overwrite con []).
   */
  async unregisterGuild(guildId: string): Promise<void> {
    const url = `${DISCORD_API}/applications/${this.applicationId}/guilds/${guildId}/commands`
    await this._request('PUT', url, [])
    console.info(`[discord.commands] Guild commands cleared for guild ${guildId}`)
  }

  // ── Privados ───────────────────────────────────────────────────────────────

  private async _bulkOverwrite(url: string): Promise<void> {
    await this._request('PUT', url, DISCORD_SLASH_COMMANDS)
  }

  private async _request(
    method: string,
    url:    string,
    body:   unknown,
  ): Promise<void> {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization:  `Bot ${this.botToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(
        `[discord.commands] ${method} ${url} failed (${res.status}): ${text}`,
      )
    }
  }
}

// ── DiscordCommandDispatcher ──────────────────────────────────────────────────

/**
 * Procesa un CommandInteractionContext y devuelve el texto de respuesta.
 *
 * El caller (DiscordAdapter) es responsable de:
 *   1. Verificar la firma Ed25519 (ya hecho en adapter)
 *   2. Parsear el body a CommandInteractionContext via parseInteractionBody()
 *   3. Llamar dispatch() con el contexto
 *   4. Enviar la respuesta via followup PATCH (interactionToken)
 *
 * DiscordCommandDispatcher SOLO genera el texto. No hace I/O HTTP a Discord.
 */
export class DiscordCommandDispatcher {

  constructor(
    private readonly resolveBinding: (
      guildId:   string | null,
      channelId: string,
    ) => Promise<DiscordBindingResult | null>,

    private readonly runAgent: (
      binding:  DiscordBindingResult,
      userId:   string,
      prompt:   string,
    ) => Promise<string>,
  ) {}

  /**
   * Despacha la interacción y devuelve el texto de respuesta listo para Discord.
   * Siempre devuelve un string (nunca lanza — los errores se convierten en mensajes).
   */
  async dispatch(ctx: CommandInteractionContext): Promise<string> {
    try {
      switch (ctx.commandName) {
        case 'ask':    return await this._handleAsk(ctx)
        case 'status': return await this._handleStatus(ctx)
        default:
          return `❓ Comando desconocido: \`/${ctx.commandName}\``
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[discord.commands] dispatch error (/${ctx.commandName}):`, msg)
      return `⚠️ Error al procesar el comando: ${msg}`
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  private async _handleAsk(ctx: CommandInteractionContext): Promise<string> {
    const prompt = String(ctx.options['prompt'] ?? '').trim()
    if (!prompt) {
      return '❌ Debes proporcionar un prompt. Uso: `/ask <tu pregunta>`'
    }

    const binding = await this.resolveBinding(ctx.guildId, ctx.channelId)
    if (!binding) {
      return this._noBindingMessage(ctx.guildId, ctx.channelId)
    }

    const reply = await this.runAgent(binding, ctx.userId, prompt)
    return reply.slice(0, MAX_CONTENT_LENGTH)
  }

  private async _handleStatus(ctx: CommandInteractionContext): Promise<string> {
    const binding = await this.resolveBinding(ctx.guildId, ctx.channelId)

    if (!binding) {
      return this._noBindingMessage(ctx.guildId, ctx.channelId)
    }

    const scopeLabel =
      binding.scopeLevel === 'channel'
        ? `canal <#${ctx.channelId}>`
        : `servidor \`${ctx.guildId}\``

    return [
      '✅ **Agente vinculado**',
      `• Scope:   \`${binding.scopeLevel}\` → ${scopeLabel}`,
      `• Agente:  \`${binding.agentId}\``,
      `• Config:  \`${binding.channelConfigId}\``,
    ].join('\n')
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _noBindingMessage(guildId: string | null, channelId: string): string {
    return [
      '❌ **No hay agente vinculado** a este servidor/canal.',
      '',
      'Un administrador debe crear un `ChannelBinding` con:',
      `  \`scopeLevel: "channel"\`, \`scopeId: "${channelId}"\``,
      guildId
        ? `  ó \`scopeLevel: "guild"\`, \`scopeId: "${guildId}"\``
        : '',
    ].filter(Boolean).join('\n')
  }
}

// ── parseInteractionBody ──────────────────────────────────────────────────────

/**
 * Normaliza un body de interaction type=2 (APPLICATION_COMMAND)
 * al tipo CommandInteractionContext.
 *
 * Retorna null si faltan campos obligatorios.
 */
export function parseInteractionBody(
  body: Record<string, unknown>,
): CommandInteractionContext | null {
  const data    = body['data']    as Record<string, unknown> | undefined
  const member  = body['member']  as Record<string, unknown> | undefined
  const user    = (member?.['user'] ?? body['user']) as Record<string, unknown> | undefined

  const commandName      = data?.['name']    as string | undefined
  const channelId        = body['channel_id'] as string | undefined
  const interactionId    = body['id']         as string | undefined
  const interactionToken = body['token']      as string | undefined
  const userId           = user?.['id']       as string | undefined
  const username         = (user?.['username'] ?? user?.['global_name'] ?? 'unknown') as string
  const guildId          = (body['guild_id']  as string | undefined) ?? null

  if (!commandName || !channelId || !interactionId || !interactionToken || !userId) {
    return null
  }

  // Normalizar options (Discord los envía como array [{name, value}])
  const rawOptions = (data?.['options'] as Array<{ name: string; value: unknown }>) ?? []
  const options: Record<string, string | number | boolean> = {}
  for (const opt of rawOptions) {
    options[opt.name] = opt.value as string | number | boolean
  }

  return {
    commandName,
    guildId,
    channelId,
    userId,
    username,
    interactionId,
    interactionToken,
    options,
  }
}

// ── resolveDiscordBinding ─────────────────────────────────────────────────────

/**
 * Factory de resolveBinding para DiscordCommandDispatcher.
 *
 * Busca en `channelBindings` el binding más específico para el guild/canal dado.
 * Prioridad: channel > guild.
 *
 * @param channelBindings  Lista de bindings activos (desde DB o caché)
 */
export function makeBindingResolver(
  channelBindings: Array<{
    agentId:         string
    channelConfigId: string
    scopeLevel:      string
    scopeId:         string
  }>,
): (guildId: string | null, channelId: string) => Promise<DiscordBindingResult | null> {
  return async (guildId, channelId) => {
    // 1. Binding de canal específico (mayor prioridad)
    const channelBinding = channelBindings.find(
      (b) => b.scopeLevel === 'channel' && b.scopeId === channelId,
    )
    if (channelBinding) {
      return {
        agentId:         channelBinding.agentId,
        channelConfigId: channelBinding.channelConfigId,
        scopeLevel:      'channel',
        scopeId:         channelId,
      }
    }

    // 2. Binding de guild
    if (guildId) {
      const guildBinding = channelBindings.find(
        (b) => b.scopeLevel === 'guild' && b.scopeId === guildId,
      )
      if (guildBinding) {
        return {
          agentId:         guildBinding.agentId,
          channelConfigId: guildBinding.channelConfigId,
          scopeLevel:      'guild',
          scopeId:         guildId,
        }
      }
    }

    return null
  }
}
