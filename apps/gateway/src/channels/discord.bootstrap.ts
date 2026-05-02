/**
 * discord.bootstrap.ts — F3a-29
 *
 * Bootstrap de slash commands Discord:
 *   - Registra los comandos en todos los guilds configurados al arrancar
 *   - Soporta registro global (producción) o por guild (desarrollo)
 *   - Idempotente: usa un Set interno para no re-registrar guilds ya procesados
 *   - Hook onGuildCreate: registra comandos automáticamente en nuevos guilds
 *
 * Uso en el entry point del gateway:
 *   import { DiscordBootstrap } from './channels/discord.bootstrap';
 *   const bootstrap = new DiscordBootstrap({ botToken, applicationId });
 *   await bootstrap.run(guildIds); // registra en todos los guilds
 *
 * Uso con registro global (producción):
 *   await bootstrap.registerGlobalOnce();
 */

import { DiscordCommandRegistry } from './discord.commands';

export interface DiscordBootstrapOptions {
  /** Token del bot ("Bot xxxxxxxxxxx") */
  botToken:       string;
  /** Application ID de Discord (snowflake) */
  applicationId:  string;
  /** Si true, registra comandos globalmente en lugar de por guild. Default: false */
  globalCommands?: boolean;
}

/**
 * Orquesta el registro de slash commands Discord al arrancar el gateway.
 *
 * @example
 * const bootstrap = new DiscordBootstrap({
 *   botToken:      process.env.DISCORD_BOT_TOKEN!,
 *   applicationId: process.env.DISCORD_APP_ID!,
 * });
 * await bootstrap.run(['123456789', '987654321']);
 */
export class DiscordBootstrap {
  private readonly registry:         DiscordCommandRegistry;
  private readonly globalCommands:   boolean;
  private readonly registeredGuilds: Set<string> = new Set();
  private globalRegistered = false;

  constructor(private readonly options: DiscordBootstrapOptions) {
    this.registry       = new DiscordCommandRegistry(options.botToken, options.applicationId);
    this.globalCommands = options.globalCommands ?? false;
  }

  /**
   * Registra slash commands en todos los guilds proporcionados.
   * Omite guilds que ya fueron registrados en esta sesión (idempotente).
   *
   * @param guildIds  Lista de snowflakes de guilds donde registrar comandos
   */
  async run(guildIds: string[]): Promise<void> {
    if (this.globalCommands) {
      await this.registerGlobalOnce();
      return;
    }

    const pending = guildIds.filter((id) => !this.registeredGuilds.has(id));
    if (pending.length === 0) {
      console.info('[DiscordBootstrap] All guilds already registered — skipping');
      return;
    }

    console.info(`[DiscordBootstrap] Registering slash commands in ${pending.length} guild(s)...`);

    const results = await Promise.allSettled(
      pending.map((guildId) => this._registerGuild(guildId)),
    );

    let ok = 0;
    let failed = 0;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        ok++;
      } else {
        failed++;
        console.error('[DiscordBootstrap] Guild registration failed:', result.reason);
      }
    }

    console.info(
      `[DiscordBootstrap] Registration complete: ${ok} ok, ${failed} failed`,
    );
  }

  /**
   * Registra comandos globalmente (propagación hasta 1 hora).
   * Idempotente: no re-registra si ya se hizo en esta sesión.
   * Usar en producción cuando el bot está en muchos servidores.
   */
  async registerGlobalOnce(): Promise<void> {
    if (this.globalRegistered) {
      console.info('[DiscordBootstrap] Global commands already registered — skipping');
      return;
    }

    await this.registry.registerGlobal();
    this.globalRegistered = true;
    console.info('[DiscordBootstrap] Global commands registered successfully');
  }

  /**
   * Hook para registrar comandos en un nuevo guild automáticamente.
   * Conectar al evento GUILD_CREATE del cliente Discord:
   *
   * @example
   * client.on('guildCreate', (guild) => bootstrap.onGuildCreate(guild.id));
   *
   * @param guildId  Snowflake del guild recién unido
   */
  async onGuildCreate(guildId: string): Promise<void> {
    if (this.globalCommands || this.registeredGuilds.has(guildId)) return;

    console.info(`[DiscordBootstrap] New guild joined: ${guildId} — registering commands`);
    await this._registerGuild(guildId);
  }

  /**
   * Elimina los slash commands de un guild (cleanup al salir o desactivar el canal).
   *
   * @param guildId  Snowflake del guild
   */
  async unregisterGuild(guildId: string): Promise<void> {
    await this.registry.unregisterGuild(guildId);
    this.registeredGuilds.delete(guildId);
    console.info(`[DiscordBootstrap] Commands unregistered from guild ${guildId}`);
  }

  // ── Privados ───────────────────────────────────────────────────────────────

  private async _registerGuild(guildId: string): Promise<void> {
    await this.registry.registerGuild(guildId);
    this.registeredGuilds.add(guildId);
  }
}
