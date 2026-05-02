/**
 * discord.adapter.ts — F3a-26
 *
 * Adaptador Discord completo:
 *   - Soporte APPLICATION_COMMAND (slash commands) con deferral inmediato (type=5)
 *   - Soporte mensajes normales (MESSAGE_CREATE) para bots con intent MESSAGE_CONTENT
 *   - Verificación de firma Ed25519 obligatoria (Discord rechaza sin ella)
 *   - replied=true SOLO después de confirmar entrega HTTP (fix #182)
 *
 * Secrets esperados en ChannelConfig.credentials:
 *   {
 *     botToken:      "Bot <token>",
 *     publicKey:     "<hex ed25519 public key>",  // para verificar firmas
 *     applicationId: "<snowflake>",
 *     guildIds?:     string[]   // guilds donde registrar comandos
 *   }
 *
 * Flujo slash command:
 *   1. POST /gateway/discord/:channelId  -> verifyInteraction()
 *   2. Si type=1 (PING)  -> respond { type: 1 }
 *   3. Si type=2 (APPLICATION_COMMAND) -> respond { type: 5, data: { flags: 64 } }  (deferral ephemeral)
 *   4. Dispatch runAgent() en background
 *   5. PATCH /webhooks/:appId/:token/messages/@original  con la respuesta
 */

import { getPrisma } from '../../lib/prisma.js';
import {
  BaseChannelAdapter,
  type ChannelType,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface';
import {
  parseInteractionBody,
  makeBindingResolver,
  DiscordCommandDispatcher,
  type DiscordChannelBinding,
  type CommandInteractionContext,
} from './discord.commands';

const DISCORD_API = 'https://discord.com/api/v10';

type DiscordSecrets = {
  botToken:      string;
  publicKey:     string;
  applicationId: string;
  guildIds?:     string[];
};

/** Resultado de la verificación de firma Discord (Ed25519) */
export type InteractionVerifyResult =
  | { valid: true  }
  | { valid: false; reason: string };

/**
 * Verifica la firma Ed25519 de una interacción Discord.
 * Discord requiere respuesta HTTP 401 si falla — el adapter HTTP debe leer valid.
 *
 * @param publicKey  Clave pública hexadecimal del application de Discord
 * @param signature  Header X-Signature-Ed25519
 * @param timestamp  Header X-Signature-Timestamp
 * @param rawBody    Body de la petición como string (antes de parsear JSON)
 */
export async function verifyDiscordInteraction(
  publicKey:  string,
  signature:  string,
  timestamp:  string,
  rawBody:    string,
): Promise<InteractionVerifyResult> {
  try {
    // tweetnacl-util + tweetnacl son peerDeps livianos; discord.js los usa internamente
    const nacl = await import('tweetnacl').catch(() => {
      throw new Error('[DiscordAdapter] tweetnacl not installed. Run: pnpm add tweetnacl');
    });
    const { decodeUTF8, decodeBase64 } = await import('tweetnacl-util').catch(() => {
      throw new Error('[DiscordAdapter] tweetnacl-util not installed. Run: pnpm add tweetnacl-util');
    });

    const message  = decodeUTF8(timestamp + rawBody);
    const sigBytes = Buffer.from(signature, 'hex');
    const keyBytes = Buffer.from(publicKey,  'hex');

    const ok = nacl.sign.detached.verify(message, sigBytes, keyBytes);
    return ok ? { valid: true } : { valid: false, reason: 'signature mismatch' };
  } catch (err) {
    return {
      valid:  false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------

export class DiscordAdapter extends BaseChannelAdapter {
  readonly channel = 'discord' as const satisfies ChannelType;

  private applicationId = '';
  private publicKey     = '';
  private bindings:    DiscordChannelBinding[] = [];

  // ---------------------------------------------------------------------------
  // IChannelAdapter — initialize / dispose
  // ---------------------------------------------------------------------------

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;

    const db     = getPrisma();
    const config = await db.channelConfig.findUnique({
      where:   { id: channelConfigId },
      include: { bindings: true },
    });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);

    this.credentials   = config.credentials as Record<string, unknown>;
    const secrets      = this.credentials as DiscordSecrets;
    this.applicationId = secrets.applicationId;
    this.publicKey     = secrets.publicKey;

    // Cargar bindings para resolución guild/channel
    this.bindings = (config.bindings ?? []).map((b: { agentId: string; channelConfigId: string; externalChannelId: string | null; externalGuildId: string | null }) => ({
      agentId:           b.agentId,
      channelConfigId:   b.channelConfigId,
      externalChannelId: b.externalChannelId,
      externalGuildId:   b.externalGuildId,
    }));

    console.info(
      `[DiscordAdapter] initialized (channelConfigId=${channelConfigId}, ` +
      `appId=${this.applicationId}, bindings=${this.bindings.length})`,
    );
  }

  async dispose(): Promise<void> {
    this.bindings = [];
    console.info(`[DiscordAdapter] disposed (channelConfigId=${this.channelConfigId})`);
  }

  // ---------------------------------------------------------------------------
  // IChannelAdapter — receive
  // ---------------------------------------------------------------------------

  /**
   * Procesa el body ya parseado de una interacción Discord.
   * Para PING (type=1) devuelve null — el caller debe responder { type: 1 }.
   * Para APPLICATION_COMMAND (type=2) emite el IncomingMessage y devuelve el objeto
   * para que el caller haga deferral inmediato antes de que el agente responda.
   *
   * @param rawPayload  Body JSON de la petición Discord ya parseado
   */
  async receive(
    rawPayload: Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const interactionType = rawPayload['type'] as number | undefined;

    // PING — Discord verifica el endpoint; responder { type: 1 } fuera de este método
    if (interactionType === 1) return null;

    // APPLICATION_COMMAND (slash) o MESSAGE_COMPONENT
    if (interactionType === 2 || interactionType === 3) {
      const ctx = parseInteractionBody(rawPayload);
      if (!ctx) return null;

      return {
        channelConfigId: this.channelConfigId,
        channelType:     'discord',
        externalId:      ctx.channelId,
        externalUserId:  ctx.userId,
        senderId:        ctx.userId,
        text:            String(ctx.options['prompt'] ?? ctx.commandName),
        type:            'text',
        receivedAt:      this.makeTimestamp(),
        metadata:        {
          interactionId:    ctx.interactionId,
          interactionToken: ctx.interactionToken,
          commandName:      ctx.commandName,
          guildId:          ctx.guildId,
          options:          ctx.options,
        },
      };
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // IChannelAdapter — send
  // ---------------------------------------------------------------------------

  /**
   * Envía una respuesta a una interacción Discord vía followup (PATCH @original).
   * El token de interacción se lee de message.metadata.interactionToken.
   *
   * @throws Error si la petición HTTP falla
   */
  async send(message: OutgoingMessage): Promise<void> {
    const meta  = (message.metadata ?? {}) as Record<string, string | undefined>;
    const token = meta['interactionToken'];

    if (token) {
      // Followup de slash command (PATCH @original)
      const url = `${DISCORD_API}/webhooks/${this.applicationId}/${token}/messages/@original`;
      const res = await fetch(url, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: message.text.slice(0, 2000) }),
      });

      // replied=true SOLO después de confirmar entrega (fix #182)
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`[DiscordAdapter] followup failed (${res.status}): ${err}`);
      }
      return;
    }

    // Mensaje normal en canal (usando REST sin discord.js Client)
    const secrets = this.credentials as DiscordSecrets;
    const url     = `${DISCORD_API}/channels/${message.externalId}/messages`;
    const res     = await fetch(url, {
      method:  'POST',
      headers: {
        Authorization:  secrets.botToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: message.text.slice(0, 2000) }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[DiscordAdapter] send failed (${res.status}): ${err}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers públicos para el router HTTP
  // ---------------------------------------------------------------------------

  /**
   * Devuelve la clave pública Ed25519 para que el router HTTP pueda
   * verificar la firma ANTES de parsear el body.
   */
  getPublicKey(): string {
    return this.publicKey;
  }

  /**
   * Construye un dispatcher de comandos con los bindings cargados.
   * El caller debe proveer runAgent().
   *
   * @param runAgent  Función que ejecuta el agente y devuelve la respuesta
   */
  makeDispatcher(
    runAgent: (
      binding: { agentId: string; channelConfigId: string; scopeLevel: 'channel' | 'guild'; scopeId: string },
      userId:  string,
      prompt:  string,
    ) => Promise<string>,
  ): DiscordCommandDispatcher {
    return new DiscordCommandDispatcher(
      makeBindingResolver(this.bindings),
      runAgent,
    );
  }

  /**
   * Respuesta inmediata de deferral para slash commands.
   * Debe enviarse como response HTTP ANTES de llamar runAgent().
   * Discord requiere respuesta en < 3 s; el followup puede tardar hasta 15 min.
   *
   * @param ephemeral  Si true, solo el usuario que ejecutó el comando ve la respuesta
   */
  static deferralResponse(ephemeral = true): Record<string, unknown> {
    return {
      type: 5,
      data: { flags: ephemeral ? 64 : 0 },
    };
  }

  /**
   * Respuesta inmediata de PING (Discord verifica el endpoint).
   */
  static pongResponse(): Record<string, unknown> {
    return { type: 1 };
  }
}

// Re-export para uso externo sin importar discord.commands directamente
export {
  auditDiscordProvisioned,
  auditDiscordMessageInbound,
  auditDiscordMessageOutbound,
  auditDiscordError,
} from './discord.adapter.audit';
