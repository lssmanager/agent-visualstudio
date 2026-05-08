/**
 * gateway.service.ts - Dispatcher central del Gateway
 * Fix: importa desde './index' (local), no '@agent-vs/gateway-sdk'
 * Fix: usa channel+credentials del schema actual (no type+secretsEncrypted)
 * Fix: session.id en lugar de session.sessionId
 */

import { Injectable }       from '@nestjs/common'
import { createDecipheriv } from 'crypto'
import {
  registry,
  SessionManager,
  type IChannelAdapter,
  type IncomingMessage,
  type OutboundMessage,
} from './index'
import { AgentRunner }          from './stubs/flow-engine.stub'
import type { RunInput }        from './stubs/flow-engine.stub'
import { PrismaService }        from './prisma/prisma.service'
import { AgentResolverService } from './agent-resolver.service'

interface DecryptedChannelConfig {
  id:          string
  type:        string
  config:      Record<string, unknown>
  secrets:     Record<string, unknown>
  workspaceId: string
}

@Injectable()
export class GatewayService {
  readonly sessions:  SessionManager
  private readonly agentRunner: AgentRunner
  private readonly configCache = new Map<string, DecryptedChannelConfig>()
  private readonly encKey:      Buffer

  constructor(
    private readonly db:       PrismaService,
    private readonly resolver: AgentResolverService,
  ) {
    this.sessions    = new SessionManager(db)
    this.agentRunner = new AgentRunner({ prisma: db })

    const keyHex = process.env.GATEWAY_ENCRYPTION_KEY ?? ''
    if (!keyHex) {
      console.warn('[GatewayService] GATEWAY_ENCRYPTION_KEY not set')
    }
    this.encKey = Buffer.from(keyHex || '0'.repeat(64), 'hex')
  }

  async activateChannel(channelConfigId: string): Promise<void> {
    const cfg     = await this.loadChannelConfig(channelConfigId)
    const adapter = this.resolveAdapter(cfg.type)
    await adapter.setup(cfg.config, cfg.secrets)
    console.info(`[GatewayService] channel ${channelConfigId} (${cfg.type}) activated`)
  }

  async deactivateChannel(channelConfigId: string): Promise<void> {
    const cached = this.configCache.get(channelConfigId)
    if (!cached) return
    const adapter = this.resolveAdapter(cached.type)
    await adapter.teardown(cached.config, cached.secrets).catch((err: unknown) => {
      console.warn(`[GatewayService] teardown error for channel ${channelConfigId}:`, err)
    })
    this.configCache.delete(channelConfigId)
  }

  async dispatch(
    channelConfigId: string,
    rawPayload:      Record<string, unknown>,
  ): Promise<void> {
    const cfg     = await this.loadChannelConfig(channelConfigId)
    const adapter = this.resolveAdapter(cfg.type)

    const incoming: IncomingMessage | null = await adapter.receive(rawPayload, cfg.secrets)
    if (!incoming) return

    const existingSession = await this.sessions.findSession(
      channelConfigId,
      incoming.externalUserId,
    )

    const resolved = await this.resolver.resolve(
      channelConfigId,
      incoming.externalUserId,
      existingSession?.agentId ?? null,
    )

    const session = await this.sessions.receiveUserMessage(
      channelConfigId,
      resolved.agentId,
      incoming,
    )

    const runInput: RunInput = {
      workspaceId: cfg.workspaceId,
      agentId:     session.agentId,
      sessionId:   session.id,
      channelKind: cfg.type,
      inputData:   { userMessage: incoming.text ?? '' },
    }

    let replyText: string
    try {
      const result = await this.agentRunner.run(runInput)
      replyText =
        (result.output?.['reply'] as string | undefined) ??
        (result.output?.['text']  as string | undefined) ??
        '(sin respuesta)'
      if (result.status === 'failed') {
        console.error('[GatewayService] run failed:', result.error)
        replyText = '(error al procesar tu mensaje)'
      }
    } catch (err) {
      console.error('[GatewayService] AgentRunner threw:', err)
      replyText = '(error al procesar tu mensaje)'
    }

    const outbound: OutboundMessage = {
      externalUserId: incoming.externalUserId,
      text:           replyText,
    }

    await this.recordReply(channelConfigId, session.id, outbound)
  }

  async recordReply(
    channelConfigId: string,
    sessionId:       string,
    outbound:        OutboundMessage,
  ): Promise<void> {
    const cfg     = await this.loadChannelConfig(channelConfigId)
    const adapter = this.resolveAdapter(cfg.type)
    await this.sessions.recordAssistantReply(sessionId, outbound)
    await adapter.send(outbound, cfg.config, cfg.secrets)
  }

  private async loadChannelConfig(channelConfigId: string): Promise<DecryptedChannelConfig> {
    const cached = this.configCache.get(channelConfigId)
    if (cached) return cached

    const row = await this.db.channelConfig.findUniqueOrThrow({
      where:  { id: channelConfigId },
      select: { id: true, channel: true, config: true, credentials: true, workspaceId: true },
    })

    const secrets = (row.credentials as Record<string, unknown>) ?? {}
    const cfg: DecryptedChannelConfig = {
      id:          row.id,
      type:        row.channel,
      config:      (row.config as Record<string, unknown>) ?? {},
      workspaceId: row.workspaceId,
      secrets,
    }
    this.configCache.set(channelConfigId, cfg)
    return cfg
  }

  private resolveAdapter(type: string): IChannelAdapter {
    if (!registry.has(type)) {
      throw new Error(
        `GatewayService: no adapter for '${type}'. Registered: ${registry.registeredTypes().join(', ') || '(none)'}`,
      )
    }
    return registry.get(type)
  }

  private decrypt(secretsEncrypted: string | null): Record<string, unknown> {
    if (!secretsEncrypted) return {}
    try {
      const buf     = Buffer.from(secretsEncrypted, 'hex')
      const iv      = buf.subarray(0, 12)
      const authTag = buf.subarray(12, 28)
      const cipher  = buf.subarray(28)
      const dec     = createDecipheriv('aes-256-gcm', this.encKey, iv)
      dec.setAuthTag(authTag)
      const decrypted = Buffer.concat([dec.update(cipher), dec.final()])
      return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>
    } catch (err) {
      console.error('[GatewayService] Failed to decrypt:', err)
      return {}
    }
  }
}
