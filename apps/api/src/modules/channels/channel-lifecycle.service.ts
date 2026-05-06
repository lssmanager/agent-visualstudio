import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../lib/prisma.service'
import { GatewayService } from '../gateway/gateway.service'
import { AgentResolverService } from '../gateway/agent-resolver.service'
import {
  ChannelNotFoundError,
  InvalidTransitionError,
  ChannelAlreadyInStateError,
  WebhookRegistrationError,
} from './channel-lifecycle.errors'
import type { ProvisionChannelDto, ChannelStatusDto } from './dto/provision-channel.dto'
import { createCipheriv, randomBytes } from 'crypto'

/**
 * AUDIT-25: Estado operacional en memoria del adaptador.
 * NUNCA se persiste en Prisma — ChannelConfig.isActive es el único campo
 * de estado persistido en BD.
 *
 * Transiciones válidas:
 *   stopped → starting → active
 *   active  → stopping → stopped
 *   *       → error    (cualquier estado puede caer en error)
 */
type RuntimeChannelStatus =
  | 'starting'
  | 'active'
  | 'stopping'
  | 'stopped'
  | 'error'

@Injectable()
export class ChannelLifecycleService {
  private readonly logger = new Logger(ChannelLifecycleService.name)

  /**
   * AUDIT-25: Estado en memoria por channelConfigId.
   * Permite reportar 'starting' / 'stopping' con más precisión que el bool isActive.
   * Se inicializa al cargar canales activos en onModuleInit (si se implementa).
   */
  private readonly runtimeStatus = new Map<string, RuntimeChannelStatus>()

  constructor(
    private readonly db: PrismaService,
    private readonly gateway: GatewayService,
    private readonly resolver: AgentResolverService,
  ) {}

  async provision(dto: ProvisionChannelDto): Promise<ChannelStatusDto> {
    // AUDIT-24: encriptar secrets → secretsEncrypted (nullable si no hay secrets)
    const secretsEncrypted = dto.secrets ? this.encryptSecrets(dto.secrets) : null

    const channel = await this.db.channelConfig.create({
      data: {
        type:            dto.type as any,
        name:            dto.name,
        config:          dto.config,
        secretsEncrypted,
        isActive:        false,
        workspaceId:     (dto as any).workspaceId,
      },
    })

    this.runtimeStatus.set(channel.id, 'stopped')
    this.logger.log(`[provision] Channel "${channel.id}" (${channel.type}) created`)

    if (dto.autoStart) {
      return this.start(channel.id)
    }

    return this.buildStatusDto(channel, channel.id)
  }

  async start(channelConfigId: string): Promise<ChannelStatusDto> {
    const channel = await this.db.channelConfig.findUnique({ where: { id: channelConfigId } })
    if (!channel) throw new ChannelNotFoundError(channelConfigId)
    if (channel.isActive) throw new ChannelAlreadyInStateError(channelConfigId, 'active')

    this.runtimeStatus.set(channelConfigId, 'starting')

    try {
      await this.callGatewayActivate(channelConfigId)

      const updated = await this.db.channelConfig.update({
        where: { id: channelConfigId },
        data:  { isActive: true },
      })
      this.runtimeStatus.set(channelConfigId, 'active')
      this.resolver.invalidateCache(channelConfigId)
      this.logger.log(`[start] Channel "${channelConfigId}" is now active`)
      return this.buildStatusDto(updated, channelConfigId)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      this.runtimeStatus.set(channelConfigId, 'error')
      await this.db.channelConfig.update({
        where: { id: channelConfigId },
        data:  { isActive: false },
      })
      this.resolver.invalidateCache(channelConfigId)
      this.logger.error(`[start] Channel "${channelConfigId}" failed to start: ${errorMessage}`)
      throw new WebhookRegistrationError(channelConfigId, errorMessage)
    }
  }

  async stop(channelConfigId: string): Promise<ChannelStatusDto> {
    const channel = await this.db.channelConfig.findUnique({ where: { id: channelConfigId } })
    if (!channel) throw new ChannelNotFoundError(channelConfigId)
    if (!channel.isActive) throw new ChannelAlreadyInStateError(channelConfigId, 'stopped')

    this.runtimeStatus.set(channelConfigId, 'stopping')

    try {
      await this.callGatewayDeactivate(channelConfigId)

      const updated = await this.db.channelConfig.update({
        where: { id: channelConfigId },
        data:  { isActive: false },
      })
      this.runtimeStatus.set(channelConfigId, 'stopped')
      this.resolver.invalidateCache(channelConfigId)
      this.logger.log(`[stop] Channel "${channelConfigId}" is now stopped`)
      return this.buildStatusDto(updated, channelConfigId)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      this.runtimeStatus.set(channelConfigId, 'error')
      await this.db.channelConfig.update({
        where: { id: channelConfigId },
        data:  { isActive: false },
      })
      this.resolver.invalidateCache(channelConfigId)
      this.logger.error(`[stop] Channel "${channelConfigId}" failed to stop: ${errorMessage}`)
      throw err
    }
  }

  async restart(channelConfigId: string): Promise<ChannelStatusDto> {
    const channel = await this.loadOrThrow(channelConfigId)

    if (channel.isActive) {
      await this.stop(channelConfigId)
    }

    return this.start(channelConfigId)
  }

  async status(channelConfigId: string): Promise<ChannelStatusDto> {
    const channel = await this.loadOrThrow(channelConfigId)
    return this.buildStatusDto(channel, channelConfigId)
  }

  async listAll(): Promise<ChannelStatusDto[]> {
    const channels = await this.db.channelConfig.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    })

    return Promise.all(channels.map((ch: any) => this.buildStatusDto(ch, ch.id)))
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async callGatewayActivate(id: string): Promise<void> {
    await this.gateway.activateChannel(id)
  }

  private async callGatewayDeactivate(id: string): Promise<void> {
    await this.gateway.deactivateChannel(id)
  }

  private async loadOrThrow(channelConfigId: string) {
    const channel = await this.db.channelConfig.findUnique({ where: { id: channelConfigId } })
    if (!channel) throw new ChannelNotFoundError(channelConfigId)
    return channel
  }

  private async buildStatusDto(channel: any, channelConfigId: string): Promise<ChannelStatusDto> {
    const [bindingCount, activeSessions] = await Promise.all([
      this.db.channelBinding.count({ where: { channelConfigId } }),
      this.db.gatewaySession.count({ where: { channelConfigId, state: 'active' } }),
    ])
    return this.toStatusDto(channel, bindingCount, activeSessions)
  }

  /**
   * AUDIT-25: toStatusDto canónico.
   * - status deriva de isActive como base
   * - si existe RuntimeChannelStatus en memoria, lo usa para mayor precisión
   * - SIN errorMessage / lastStartedAt / lastStoppedAt (campos fantasma eliminados)
   */
  private toStatusDto(ch: any, bindingCount: number, activeSessions: number): ChannelStatusDto {
    const memStatus = this.runtimeStatus.get(ch.id)
    const status: string = memStatus ?? (ch.isActive ? 'active' : 'stopped')

    return {
      id:             ch.id,
      name:           ch.name,
      type:           ch.type,
      status,
      isActive:       ch.isActive,
      bindingCount,
      activeSessions,
      createdAt:      ch.createdAt.toISOString(),
      updatedAt:      ch.updatedAt.toISOString(),
    }
  }

  /**
   * AUDIT-24: encripta secrets con AES-256-GCM.
   * El resultado se guarda en ChannelConfig.secretsEncrypted (String?).
   * Los adapters leen secretsEncrypted — NO tokenEnc ni credentials.
   */
  private encryptSecrets(secrets: Record<string, unknown>): string {
    const keyHex = process.env.GATEWAY_ENCRYPTION_KEY ?? ''
    if (!keyHex) throw new Error('GATEWAY_ENCRYPTION_KEY is not set')
    const key = Buffer.from(keyHex, 'hex')
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const plain = Buffer.from(JSON.stringify(secrets), 'utf8')
    const enc = Buffer.concat([cipher.update(plain), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, enc]).toString('base64')
  }
}
