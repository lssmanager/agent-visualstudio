/**
 * channel-adapter.ts
 *
 * IChannelAdapter — the single contract every channel integration must
 * implement. The gateway service calls these methods; adapters translate
 * between channel-specific wire formats and the canonical
 * IncomingMessage / OutboundMessage shapes.
 *
 * Lifecycle:
 *   setup()    — called once when a ChannelConfig is activated
 *                (registers webhooks, opens long-poll loops, etc.)
 *   receive()  — called by the gateway when a raw webhook payload arrives
 *   send()     — called by the agent runtime to push a reply
 *   teardown() — called when a ChannelConfig is deactivated
 *
 * Adapters are stateless beyond what they need to talk to their external
 * platform. All session state lives in GatewaySession (via SessionManager).
 */

// ─── Canonical message shapes ───────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Attachment describes a file or media item sent by the user.
 */
export interface MessageAttachment {
  /** MIME type, e.g. 'image/jpeg', 'application/pdf' */
  mimeType: string;
  /** Public or pre-signed URL to the file */
  url:      string;
  /** Original filename, if available */
  name?:    string;
  /** File size in bytes, if available */
  size?:    number;
}

/**
 * IncomingMessage is what any channel delivers to the gateway.
 * The gateway session manager appends it to GatewaySession.messageHistory
 * and dispatches it to the bound agent.
 */
export interface IncomingMessage {
  /** Opaque external user ID in this channel (Telegram chat_id, socket ID, etc.) */
  externalUserId: string;
  /** The user's text, or null for media-only messages */
  text:           string | null;
  /** Attached files / images */
  attachments:    MessageAttachment[];
  /**
   * Channel-specific raw metadata — preserved for adapters that need it.
   * E.g. Telegram message_id for reply threading, WhatsApp wamid, etc.
   */
  metadata:       Record<string, unknown>;
  /** ISO 8601 timestamp from the channel, or Date.now() if not provided */
  ts:             string;
}

/**
 * OutboundMessage is what the agent runtime sends back through the channel.
 */
export interface OutboundMessage {
  /** Must match IncomingMessage.externalUserId for this session */
  externalUserId: string;
  /** Plain text or Markdown content */
  text:           string;
  /** Optional media to attach to the reply */
  attachments?:   MessageAttachment[];
  /**
   * Channel-specific delivery options.
   * Telegram: { parseMode: 'MarkdownV2' | 'HTML', replyToMessageId: number }
   * WebChat:  { eventType: 'message' | 'typing' | 'end' }
   */
  options?:       Record<string, unknown>;
  /**
   * Quick-reply buttons / inline keyboard.
   * Each item is a { label, value } pair; adapters translate to their format.
   */
  buttons?:       Array<{ label: string; value: string }>;
}

// ─── IChannelAdapter ─────────────────────────────────────────────────────────

export interface IChannelAdapter {
  /**
   * Channel type identifier — must match ChannelConfig.type in the DB.
   * E.g. 'telegram', 'webchat', 'whatsapp', 'slack'
   */
  readonly type: string;

  /**
   * Called once when the ChannelConfig is activated.
   * Use to register webhooks, start polling loops, etc.
   * @param config  Decrypted ChannelConfig.config (non-sensitive settings)
   * @param secrets Decrypted secrets from ChannelConfig.secretsEncrypted
   */
  setup(
    config:  Record<string, unknown>,
    secrets: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Translate a raw inbound webhook payload into an IncomingMessage.
   * Called by the gateway HTTP handler on every incoming request.
   * Returns null if the payload should be ignored (e.g. Telegram bot commands
   * that the adapter handles internally, or update types not yet supported).
   */
  receive(
    rawPayload: Record<string, unknown>,
    secrets:    Record<string, unknown>,
  ): Promise<IncomingMessage | null>;

  /**
   * Deliver a reply to the user through the channel.
   * @param message  The outbound message to send
   * @param config   ChannelConfig.config (non-sensitive settings)
   * @param secrets  Decrypted secrets
   */
  send(
    message: OutboundMessage,
    config:  Record<string, unknown>,
    secrets: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Called when the ChannelConfig is deactivated or deleted.
   * Deregister webhooks, stop polling loops, release resources.
   */
  teardown(
    config:  Record<string, unknown>,
    secrets: Record<string, unknown>,
  ): Promise<void>;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * ChannelAdapterRegistry
 *
 * Singleton map of channel type string → IChannelAdapter.
 * The gateway service registers adapters at startup and looks them up
 * by ChannelConfig.type when routing inbound webhooks.
 *
 * @example
 * // apps/gateway/src/index.ts
 * import { registry } from '@agent-vs/gateway-sdk';
 * import { TelegramAdapter } from '@agent-vs/gateway-sdk/adapters/telegram';
 * registry.register(new TelegramAdapter());
 */
export class ChannelAdapterRegistry {
  private readonly adapters = new Map<string, IChannelAdapter>();

  register(adapter: IChannelAdapter): void {
    if (this.adapters.has(adapter.type)) {
      throw new Error(
        `ChannelAdapterRegistry: adapter for type '${adapter.type}' is already registered. ` +
        'Call deregister() first if you want to replace it.',
      );
    }
    this.adapters.set(adapter.type, adapter);
  }

  deregister(type: string): void {
    this.adapters.delete(type);
  }

  get(type: string): IChannelAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(
        `ChannelAdapterRegistry: no adapter registered for channel type '${type}'. ` +
        `Registered types: ${[...this.adapters.keys()].join(', ') || '(none)'}`,
      );
    }
    return adapter;
  }

  has(type: string): boolean {
    return this.adapters.has(type);
  }

  registeredTypes(): string[] {
    return [...this.adapters.keys()];
  }

  /**
   * Devuelve todos los adaptadores registrados con sus tipos.
   *
   * Útil para:
   * - Health-check global: iterar sobre todos los adapters activos
   * - Restart en cascada: `registry.list().forEach(({ adapter }) => adapter.teardown(...))`
   * - Endpoint `GET /gateway/health`: exponer qué canales están conectados
   *
   * @returns Array de { type, adapter } en orden de registro.
   *
   * @example
   * ```ts
   * const active = registry.list().map(({ type }) => ({ type, status: 'active' }));
   * res.json({ adapters: active });
   * ```
   */
  list(): Array<{ type: string; adapter: IChannelAdapter }> {
    return Array.from(this.adapters.entries()).map(([type, adapter]) => ({
      type,
      adapter,
    }));
  }

  /**
   * Variante conveniente de `list()` que solo devuelve los adaptadores.
   *
   * Útil cuando solo necesitas iterar sobre los adapters sin el tipo:
   * ```ts
   * await Promise.all(registry.listAdapters().map(a => a.teardown({}, {})));
   * ```
   */
  listAdapters(): IChannelAdapter[] {
    return Array.from(this.adapters.values());
  }
}

/** Module-level singleton — import and use directly */
export const registry = new ChannelAdapterRegistry();
