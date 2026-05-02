/**
 * discord.commands.ts — F3a-27
 *
 * Registro y despacho de slash commands Discord:
 *   /ask <prompt>  → envía una pregunta al agente y responde con el resultado
 *   /status        → muestra el estado del binding de este guild/canal
 *
 * Binding por guild/canal (prioridad channel > guild):
 *   channel → binding.externalChannelId === channelId
 *   guild   → binding.externalGuildId   === guildId  (fallback)
 *
 * Flujo deferral (< 3 s):
 *   El caller (DiscordAdapter.receive) responde type=5 inmediatamente.
 *   Este módulo genera el texto; el adapter hace PATCH @original con él.
 */

const DISCORD_API        = 'https://discord.com/api/v10';
const MAX_CONTENT_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface SlashCommandDefinition {
  name:         string;
  description:  string;
  options?:     SlashCommandOption[];
}

export interface SlashCommandOption {
  type:         number;
  name:         string;
  description:  string;
  required?:    boolean;
}

export interface CommandInteractionContext {
  commandName:       string;
  guildId:           string | null;
  channelId:         string;
  userId:            string;
  username:          string;
  interactionId:     string;
  interactionToken:  string;
  options:           Record<string, string | number | boolean>;
}

export interface DiscordBindingResult {
  agentId:         string;
  channelConfigId: string;
  scopeLevel:      'channel' | 'guild';
  scopeId:         string;
}

/** Fila de ChannelBinding tal como viene de Prisma. */
export interface DiscordChannelBinding {
  agentId:           string;
  channelConfigId:   string;
  externalChannelId: string | null;
  externalGuildId:   string | null;
}

// ---------------------------------------------------------------------------
// Definición de comandos
// ---------------------------------------------------------------------------

export const DISCORD_SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    name:        'ask',
    description: 'Envía una pregunta al agente de IA configurado para este servidor',
    options: [
      {
        type:        3,  // STRING
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
];

// ---------------------------------------------------------------------------
// DiscordCommandRegistry
// ---------------------------------------------------------------------------

/**
 * Registra slash commands en la API de Discord.
 * Usa bulk-overwrite (PUT) para idempotencia — seguro llamar múltiples veces.
 *
 * @example
 * const registry = new DiscordCommandRegistry(botToken, applicationId);
 * await registry.registerGuild('123456789');
 */
export class DiscordCommandRegistry {
  constructor(
    private readonly botToken:       string,
    private readonly applicationId:  string,
  ) {}

  /**
   * Registra los comandos para un guild específico (propagación < 1 s).
   * Usar en desarrollo o cuando el bot está en pocos servidores.
   *
   * @param guildId  Snowflake del guild de Discord
   */
  async registerGuild(guildId: string): Promise<void> {
    const url = `${DISCORD_API}/applications/${this.applicationId}/guilds/${guildId}/commands`;
    await this._bulkOverwrite(url);
    console.info(`[discord.commands] Guild commands registered for guild ${guildId}`);
  }

  /**
   * Registra los comandos globalmente (propagación hasta 1 hora).
   * Usar en producción cuando el bot está en muchos servidores.
   */
  async registerGlobal(): Promise<void> {
    const url = `${DISCORD_API}/applications/${this.applicationId}/commands`;
    await this._bulkOverwrite(url);
    console.info('[discord.commands] Global commands registered');
  }

  /**
   * Elimina todos los comandos de un guild (bulk-overwrite con array vacío).
   *
   * @param guildId  Snowflake del guild
   */
  async unregisterGuild(guildId: string): Promise<void> {
    const url = `${DISCORD_API}/applications/${this.applicationId}/guilds/${guildId}/commands`;
    await this._request('PUT', url, []);
    console.info(`[discord.commands] Guild commands cleared for guild ${guildId}`);
  }

  private async _bulkOverwrite(url: string): Promise<void> {
    await this._request('PUT', url, DISCORD_SLASH_COMMANDS);
  }

  private async _request(method: string, url: string, body: unknown): Promise<void> {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization:  `Bot ${this.botToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[discord.commands] ${method} ${url} failed (${res.status}): ${text}`);
    }
  }
}

// ---------------------------------------------------------------------------
// DiscordCommandDispatcher
// ---------------------------------------------------------------------------

/**
 * Despacha slash commands /ask y /status.
 * No tiene side-effects HTTP — solo genera el texto de respuesta.
 * El adapter es responsable del deferral y del PATCH @original.
 *
 * @example
 * const dispatcher = new DiscordCommandDispatcher(resolveBinding, runAgent);
 * const text = await dispatcher.dispatch(ctx);
 * // → adapter hace PATCH @original con text
 */
export class DiscordCommandDispatcher {
  constructor(
    private readonly resolveBinding: (
      guildId:   string | null,
      channelId: string,
    ) => Promise<DiscordBindingResult | null>,
    private readonly runAgent: (
      binding: DiscordBindingResult,
      userId:  string,
      prompt:  string,
    ) => Promise<string>,
  ) {}

  /**
   * Despacha un comando y devuelve el texto de respuesta (≤ 2000 chars).
   *
   * @param ctx  Contexto de la interacción parseado por parseInteractionBody()
   * @returns    Texto listo para enviar como followup
   */
  async dispatch(ctx: CommandInteractionContext): Promise<string> {
    try {
      switch (ctx.commandName) {
        case 'ask':    return await this._handleAsk(ctx);
        case 'status': return await this._handleStatus(ctx);
        default:       return `Comando desconocido: \`/${ctx.commandName}\``;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[discord.commands] dispatch error (/${ctx.commandName}):`, msg);
      return `Error al procesar el comando: ${msg}`;
    }
  }

  // ── Handlers privados ──────────────────────────────────────────────────────

  private async _handleAsk(ctx: CommandInteractionContext): Promise<string> {
    const prompt = String(ctx.options['prompt'] ?? '').trim();
    if (!prompt) {
      return 'Debes proporcionar un prompt. Uso: `/ask <tu pregunta>`';
    }

    const binding = await this.resolveBinding(ctx.guildId, ctx.channelId);
    if (!binding) return this._noBindingMessage(ctx.guildId, ctx.channelId);

    const reply = await this.runAgent(binding, ctx.userId, prompt);
    return reply.slice(0, MAX_CONTENT_LENGTH);
  }

  private async _handleStatus(ctx: CommandInteractionContext): Promise<string> {
    const binding = await this.resolveBinding(ctx.guildId, ctx.channelId);
    if (!binding) return this._noBindingMessage(ctx.guildId, ctx.channelId);

    const scopeLabel =
      binding.scopeLevel === 'channel'
        ? `canal <#${ctx.channelId}>`
        : `servidor \`${ctx.guildId}\``;

    return [
      '✅ Agente vinculado',
      `Scope:   \`${binding.scopeLevel}\` → ${scopeLabel}`,
      `Agente:  \`${binding.agentId}\``,
      `Config:  \`${binding.channelConfigId}\``,
    ].join('\n');
  }

  private _noBindingMessage(guildId: string | null, channelId: string): string {
    return [
      '❌ No hay agente vinculado a este servidor/canal.',
      '',
      'Un administrador debe configurar el binding desde el panel de control:',
      `  • Para este canal específico: \`externalChannelId: "${channelId}"\``,
      guildId
        ? `  • Para todo el servidor:     \`externalGuildId:   "${guildId}"\``
        : '',
      '',
      'Consulta la documentación en /docs/discord-setup',
    ]
      .filter(Boolean)
      .join('\n');
  }
}

// ---------------------------------------------------------------------------
// Helpers de parseo
// ---------------------------------------------------------------------------

/**
 * Parsea el body raw de una interacción Discord tipo APPLICATION_COMMAND.
 * Devuelve null si el payload no tiene los campos mínimos requeridos.
 *
 * @param body  Body JSON de la petición ya parseado como objeto
 * @returns     CommandInteractionContext o null si el payload es inválido
 */
export function parseInteractionBody(
  body: Record<string, unknown>,
): CommandInteractionContext | null {
  const data   = body['data']   as Record<string, unknown> | undefined;
  const member = body['member'] as Record<string, unknown> | undefined;
  const user   = (member?.['user'] ?? body['user']) as Record<string, unknown> | undefined;

  const commandName       = data?.['name']  as string | undefined;
  const channelId         = body['channel_id'] as string | undefined;
  const interactionId     = body['id']         as string | undefined;
  const interactionToken  = body['token']      as string | undefined;
  const userId            = user?.['id']       as string | undefined;
  const username          = (user?.['username'] ?? user?.['global_name'] ?? 'unknown') as string;
  const guildId           = (body['guild_id']  as string | undefined) ?? null;

  if (!commandName || !channelId || !interactionId || !interactionToken || !userId) {
    return null;
  }

  const rawOptions = (data?.['options'] as Array<{ name: string; value: unknown }>) ?? [];
  const options: Record<string, string | number | boolean> = {};
  for (const opt of rawOptions) {
    options[opt.name] = opt.value as string | number | boolean;
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
  };
}

// ---------------------------------------------------------------------------
// Resolución de binding
// ---------------------------------------------------------------------------

/**
 * Crea una función que resuelve el binding para un par (guildId, channelId).
 * Prioridad: channel-level > guild-level.
 *
 * @param channelBindings  Filas de ChannelBinding del channelConfig activo
 * @returns                Función de resolución asíncrona
 *
 * @example
 * const resolve = makeBindingResolver(config.bindings);
 * const binding = await resolve(guildId, channelId);
 */
export function makeBindingResolver(
  channelBindings: DiscordChannelBinding[],
): (guildId: string | null, channelId: string) => Promise<DiscordBindingResult | null> {
  return async (guildId, channelId) => {
    // 1. Channel-level binding (más específico)
    const channelBinding = channelBindings.find(
      (b) => b.externalChannelId === channelId,
    );
    if (channelBinding) {
      return {
        agentId:         channelBinding.agentId,
        channelConfigId: channelBinding.channelConfigId,
        scopeLevel:      'channel',
        scopeId:         channelId,
      };
    }

    // 2. Guild-level binding (fallback)
    if (guildId) {
      const guildBinding = channelBindings.find(
        (b) => b.externalGuildId === guildId,
      );
      if (guildBinding) {
        return {
          agentId:         guildBinding.agentId,
          channelConfigId: guildBinding.channelConfigId,
          scopeLevel:      'guild',
          scopeId:         guildId,
        };
      }
    }

    return null;
  };
}

/**
 * @deprecated Usa makeBindingResolver() con filas DiscordChannelBinding.
 * Este alias convierte bindings legacy (scopeLevel/scopeId) al nuevo formato.
 */
export function makeBindingResolverLegacy(
  channelBindings: Array<{
    agentId:         string;
    channelConfigId: string;
    scopeLevel:      string;
    scopeId:         string;
  }>,
): (guildId: string | null, channelId: string) => Promise<DiscordBindingResult | null> {
  const mapped: DiscordChannelBinding[] = channelBindings.map((b) => ({
    agentId:           b.agentId,
    channelConfigId:   b.channelConfigId,
    externalChannelId: b.scopeLevel === 'channel' ? b.scopeId : null,
    externalGuildId:   b.scopeLevel === 'guild'   ? b.scopeId : null,
  }));
  return makeBindingResolver(mapped);
}
