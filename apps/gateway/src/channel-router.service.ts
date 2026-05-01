/**
 * channel-router.service.ts — [F3a-08]
 *
 * Registro central de adaptadores de canal.
 *
 * Responsabilidades:
 *   1. Mantener un Map<channelConfigId, ChannelRouterEntry> de canales activos
 *   2. Instanciar el IChannelAdapter correcto usando AdapterFactory
 *   3. Inicializar el adapter (initialize + onMessage) al activar
 *   4. Hacer dispose() del adapter al desactivar o en shutdown
 *   5. Exponer getAdapter() para que GatewayService envíe respuestas
 *   6. Emitir eventos channel:activated / channel:deactivated
 *
 * Ciclo de vida de un canal:
 *   activate(channelConfigId, channelType, messageHandler)
 *     → factory(channelType) → IChannelAdapter
 *     → adapter.initialize(channelConfigId)
 *     → adapter.onMessage(messageHandler)
 *     → listo para recibir mensajes
 *   deactivate(channelConfigId) → adapter.dispose()
 *
 * NOTA: ChannelRouter NO accede a Prisma directamente.
 * La carga de ChannelConfig la hace GatewayService y pasa
 * los parámetros necesarios a activate().
 */

import { EventEmitter } from 'node:events'
import type { IChannelAdapter, IncomingMessage } from './channels/channel-adapter.interface.js'
import type {
  ChannelConfigRow,
  ChannelRouterEntry,
  AdapterFactory,
  ChannelActivatedEvent,
  ChannelDeactivatedEvent,
} from './channel-router.types.js'

import { WebchatAdapter }  from './channels/webchat.adapter.js'
import { TelegramAdapter } from './channels/telegram.adapter.js'
import { DiscordAdapter }  from './channels/discord.adapter.js'
import { SlackAdapter }    from './channels/slack.adapter.js'
import { WebhookAdapter }  from './channels/webhook.adapter.js'
import { WhatsappAdapter } from './channels/whatsapp.adapter.js'

// ── Factory por defecto ────────────────────────────────────────────────

/**
 * Instancia el adapter correcto según el channel string.
 * Para añadir un nuevo canal: solo añadir el case aquí.
 * Retorna null si el channel no es reconocido.
 */
export function defaultAdapterFactory(channel: string): IChannelAdapter | null {
  switch (channel.toLowerCase()) {
    case 'webchat':  return new WebchatAdapter()
    case 'telegram': return new TelegramAdapter()
    case 'discord':  return new DiscordAdapter()
    case 'slack':    return new SlackAdapter()
    case 'webhook':  return new WebhookAdapter()
    case 'whatsapp': return new WhatsappAdapter()
    default:         return null
  }
}

// ── ChannelRouter ───────────────────────────────────────────────────────

export class ChannelRouter extends EventEmitter {

  /** Map<channelConfigId, entry> de canales activos */
  private readonly registry = new Map<string, ChannelRouterEntry>()

  constructor(
    /** Factory inyectable — en producción usa defaultAdapterFactory; en tests usa un mock */
    private readonly factory: AdapterFactory = defaultAdapterFactory,
  ) {
    super()
  }

  // ── Ciclo de vida ────────────────────────────────────────────────────

  /**
   * Activa un canal:
   *   1. Crea el adapter vía factory
   *   2. Llama adapter.initialize(channelConfigId)
   *   3. Conecta adapter.onMessage(messageHandler)
   *   4. Registra la entrada en el Map
   *   5. Emite channel:activated
   *
   * Es idempotente: si el canal ya está activo, no hace nada.
   *
   * @throws Error si el channel type no es conocido por la factory
   * @throws Error si adapter.initialize() falla
   */
  async activate(
    cfg:            ChannelConfigRow,
    messageHandler: (msg: IncomingMessage) => Promise<void>,
  ): Promise<void> {
    if (this.registry.has(cfg.id)) {
      console.info(
        `[ChannelRouter] channel ${cfg.id} (${cfg.channel}) already active — skipping`,
      )
      return
    }

    const adapter = this.factory(cfg.channel)
    if (!adapter) {
      throw new Error(
        `[ChannelRouter] unknown channel type '${cfg.channel}' for config ${cfg.id}`,
      )
    }

    await adapter.initialize(cfg.id)
    adapter.onMessage(messageHandler)

    const activatedAt = new Date()
    this.registry.set(cfg.id, {
      channelConfigId: cfg.id,
      channel:         cfg.channel,
      adapter,
      activatedAt,
    })

    const event: ChannelActivatedEvent = {
      channelConfigId: cfg.id,
      channel:         cfg.channel,
      activatedAt,
    }
    this.emit('channel:activated', event)

    console.info(
      `[ChannelRouter] activated channel=${cfg.channel} id=${cfg.id}`,
    )
  }

  /**
   * Desactiva un canal:
   *   1. Llama adapter.dispose()
   *   2. Elimina la entrada del registry
   *   3. Emite channel:deactivated
   *
   * Si el canal no está activo, es no-op.
   */
  async deactivate(
    channelConfigId: string,
    reason: ChannelDeactivatedEvent['reason'] = 'manual',
  ): Promise<void> {
    const entry = this.registry.get(channelConfigId)
    if (!entry) return

    try {
      await entry.adapter.dispose()
    } catch (err) {
      console.warn(
        `[ChannelRouter] dispose error for ${channelConfigId}:`, err,
      )
    }

    this.registry.delete(channelConfigId)

    const event: ChannelDeactivatedEvent = {
      channelConfigId,
      channel: entry.channel,
      reason,
    }
    this.emit('channel:deactivated', event)

    console.info(
      `[ChannelRouter] deactivated channel=${entry.channel} id=${channelConfigId} reason=${reason}`,
    )
  }

  /**
   * Desactiva todos los canales activos.
   * Llamado en el shutdown del proceso.
   */
  async shutdownAll(): Promise<void> {
    const ids = [...this.registry.keys()]
    await Promise.allSettled(
      ids.map((id) => this.deactivate(id, 'shutdown')),
    )
  }

  // ── Inspección ──────────────────────────────────────────────────────────

  /**
   * Retorna el adapter de un canal activo.
   * Retorna undefined si el canal no está activo.
   */
  getAdapter(channelConfigId: string): IChannelAdapter | undefined {
    return this.registry.get(channelConfigId)?.adapter
  }

  /**
   * Retorna una copia del array de entradas activas.
   * útil para health checks y endpoints de admin.
   */
  getActiveChannels(): ChannelRouterEntry[] {
    return [...this.registry.values()]
  }

  /**
   * Retorna true si el canal está activo en el registry.
   */
  isActive(channelConfigId: string): boolean {
    return this.registry.has(channelConfigId)
  }

  /** Número de canales activos (para métricas / health) */
  get size(): number {
    return this.registry.size
  }
}
