/**
 * discord.commands.ts - [F3a-27]
 *
 * Registro y despacho de slash commands Discord:
 *   /ask <prompt>  -> envía un mensaje al agente y responde con el resultado
 *   /status        -> muestra el estado del binding de este guild/canal
 *
 * Binding por guild/canal:
 *   Prioridad de resolución:
 *     channel -> binding.externalChannelId === channelId
 *     guild   -> binding.externalGuildId === guildId (fallback)
 *
 * Gap 1 corregido: makeBindingResolver usa los campos reales del modelo
 * ChannelBinding de Prisma, en lugar de scopeLevel/scopeId.
 *
 * Flujo de registro:
 *   1. DiscordCommandRegistry.register() -> PUT /applications/:appId/guilds/:guildId/commands
 *   2. En cada interacción type=2, DiscordCommandDispatcher.dispatch()
 *      identifica el comando, resuelve binding, y devuelve la respuesta.
 *
 * Flujo deferral (Gap 2 - responsabilidad del DiscordAdapter):
 *   El adapter responde type=5 de forma inmediata y luego hace PATCH al followup
 *   con el texto devuelto por dispatch(). Este módulo solo genera el texto.
 */

const DISCORD_API = 'https://discord.com/api/v10'
const MAX_CONTENT_LENGTH = 2000

export interface SlashCommandDefinition {
  name: string
  description: string
  options?: SlashCommandOption[]
}

export interface SlashCommandOption {
  type: number
  name: string
  description: string
  required?: boolean
}

export interface CommandInteractionContext {
  commandName: string
  guildId: string | null
  channelId: string
  userId: string
  username: string
  interactionId: string
  interactionToken: string
  options: Record<string, string | number | boolean>
}

export interface DiscordBindingResult {
  agentId: string
  channelConfigId: string
  scopeLevel: 'channel' | 'guild'
  scopeId: string
}

export interface DiscordChannelBinding {
  agentId: string
  channelConfigId: string
  externalChannelId: string | null
  externalGuildId: string | null
}

export const DISCORD_SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    name: 'ask',
    description: 'Envía una pregunta al agente de IA configurado para este servidor',
    options: [
      {
        type: 3,
        name: 'prompt',
        description: 'Tu pregunta o instrucción para el agente',
        required: true,
      },
    ],
  },
  {
    name: 'status',
    description: 'Muestra el estado del agente de IA vinculado a este servidor/canal',
  },
]

export class DiscordCommandRegistry {
  constructor(
    private readonly botToken: string,
    private readonly applicationId: string,
  ) {}

  async registerGuild(guildId: string): Promise<void> {
    const url = `${DISCORD_API}/applications/${this.applicationId}/guilds/${guildId}/commands`
    await this._bulkOverwrite(url)
    console.info(`[discord.commands] Guild commands registered for guild ${guildId}`)
  }

  async registerGlobal(): Promise<void> {
    const url = `${DISCORD_API}/applications/${this.applicationId}/commands`
    await this._bulkOverwrite(url)
    console.info('[discord.commands] Global commands registered')
  }

  async unregisterGuild(guildId: string): Promise<void> {
    const url = `${DISCORD_API}/applications/${this.applicationId}/guilds/${guildId}/commands`
    await this._request('PUT', url, [])
    console.info(`[discord.commands] Guild commands cleared for guild ${guildId}`)
  }

  private async _bulkOverwrite(url: string): Promise<void> {
    await this._request('PUT', url, DISCORD_SLASH_COMMANDS)
  }

  private async _request(method: string, url: string, body: unknown): Promise<void> {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bot ${this.botToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`[discord.commands] ${method} ${url} failed (${res.status}): ${text}`)
    }
  }
}

export class DiscordCommandDispatcher {
  constructor(
    private readonly resolveBinding: (
      guildId: string | null,
      channelId: string,
    ) => Promise<DiscordBindingResult | null>,
    private readonly runAgent: (
      binding: DiscordBindingResult,
      userId: string,
      prompt: string,
    ) => Promise<string>,
  ) {}

  async dispatch(ctx: CommandInteractionContext): Promise<string> {
    try {
      switch (ctx.commandName) {
        case 'ask':
          return await this._handleAsk(ctx)
        case 'status':
          return await this._handleStatus(ctx)
        default:
          return `Comando desconocido: \`/${ctx.commandName}\``
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[discord.commands] dispatch error (/${ctx.commandName}):`, msg)
      return `Error al procesar el comando: ${msg}`
    }
  }

  private async _handleAsk(ctx: CommandInteractionContext): Promise<string> {
    const prompt = String(ctx.options['prompt'] ?? '').trim()
    if (!prompt) {
      return 'Debes proporcionar un prompt. Uso: `/ask <tu pregunta>`'
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
      'Agente vinculado',
      `Scope:   \`${binding.scopeLevel}\` -> ${scopeLabel}`,
      `Agente:  \`${binding.agentId}\``,
      `Config:  \`${binding.channelConfigId}\``,
    ].join('\n')
  }

  private _noBindingMessage(guildId: string | null, channelId: string): string {
    return [
      'No hay agente vinculado a este servidor/canal.',
      '',
      'Un administrador debe configurar el binding desde el panel de control:',
      `  - Para este canal: vincular \`externalChannelId: "${channelId}"\``,
      guildId
        ? `  - Para todo el servidor: vincular \`externalGuildId: "${guildId}"\``
        : '',
      '',
      'Consulta la documentacion en /docs/discord-setup',
    ]
      .filter(Boolean)
      .join('\n')
  }
}

export function parseInteractionBody(
  body: Record<string, unknown>,
): CommandInteractionContext | null {
  const data = body['data'] as Record<string, unknown> | undefined
  const member = body['member'] as Record<string, unknown> | undefined
  const user = (member?.['user'] ?? body['user']) as Record<string, unknown> | undefined

  const commandName = data?.['name'] as string | undefined
  const channelId = body['channel_id'] as string | undefined
  const interactionId = body['id'] as string | undefined
  const interactionToken = body['token'] as string | undefined
  const userId = user?.['id'] as string | undefined
  const username = (user?.['username'] ?? user?.['global_name'] ?? 'unknown') as string
  const guildId = (body['guild_id'] as string | undefined) ?? null

  if (!commandName || !channelId || !interactionId || !interactionToken || !userId) {
    return null
  }

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

export function makeBindingResolver(
  channelBindings: DiscordChannelBinding[],
): (guildId: string | null, channelId: string) => Promise<DiscordBindingResult | null> {
  return async (guildId, channelId) => {
    const channelBinding = channelBindings.find(
      (b) => b.externalChannelId === channelId,
    )
    if (channelBinding) {
      return {
        agentId: channelBinding.agentId,
        channelConfigId: channelBinding.channelConfigId,
        scopeLevel: 'channel',
        scopeId: channelId,
      }
    }

    if (guildId) {
      const guildBinding = channelBindings.find(
        (b) => b.externalGuildId === guildId,
      )
      if (guildBinding) {
        return {
          agentId: guildBinding.agentId,
          channelConfigId: guildBinding.channelConfigId,
          scopeLevel: 'guild',
          scopeId: guildId,
        }
      }
    }

    return null
  }
}

/**
 * Legacy alias for code that still passes scopeLevel/scopeId bindings.
 * @deprecated Use makeBindingResolver() with DiscordChannelBinding rows.
 */
export function makeBindingResolverLegacy(
  channelBindings: Array<{
    agentId: string
    channelConfigId: string
    scopeLevel: string
    scopeId: string
  }>,
): (guildId: string | null, channelId: string) => Promise<DiscordBindingResult | null> {
  const mapped: DiscordChannelBinding[] = channelBindings.map((b) => ({
    agentId: b.agentId,
    channelConfigId: b.channelConfigId,
    externalChannelId: b.scopeLevel === 'channel' ? b.scopeId : null,
    externalGuildId: b.scopeLevel === 'guild' ? b.scopeId : null,
  }))
  return makeBindingResolver(mapped)
}
