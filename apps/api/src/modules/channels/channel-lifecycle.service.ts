import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../lib/prisma.service.js'
import { GatewayService } from '../gateway/gateway.service.js'
import { AgentResolverService } from '../gateway/agent-resolver.service.js'
import {
  ChannelNotFoundError,
  InvalidTransitionError,
  ChannelAlreadyInStateError,
  WebhookRegistrationError,
} from './channel-lifecycle.errors.js'
import type { ProvisionChannelDto, ChannelStatusDto } from './dto/provision-channel.dto.js'
import { createCipheriv, randomBytes } from 'crypto'

type ChannelStatus =
  | 'provisioned'
  | 'starting'
  | 'active'
  | 'stopping'
  | 'stopped'
  | 'error'

const TRANSITIONS: Record<ChannelStatus, ChannelStatus[]> = {
  provisioned: ['starting'],
  starting: ['active', 'error'],
  active: ['stopping'],
  stopping: ['stopped', 'error'],
  stopped: ['starting'],
  error: ['starting'],
}

const START_ALLOWED_STATUSES: ChannelStatus[] = ['provisioned', 'stopped', 'error']
const STOP_ALLOWED_STATUSES: ChannelStatus[] = ['active']

@Injectable()
export class ChannelLifecycleService {
  private readonly logger = new Logger(ChannelLifecycleService.name)

  constructor(
    private readonly db: PrismaService,
    private readonly gateway: GatewayService,
    private readonly resolver: AgentResolverService,
  ) {}

  async provision(dto: ProvisionChannelDto): Promise<ChannelStatusDto> {
    const secretsEncrypted = dto.secrets ? this.encryptSecrets(dto.secrets) : null

    const channel = await this.db.channelConfig.create({
      data: {
        type: dto.type,
        name: dto.name,
        config: dto.config,
        secretsEncrypted,
        isActive: false,
        status: 'provisioned',
        errorMessage: null,
        lastStartedAt: null,
        lastStoppedAt: null,
      },
    })

    this.logger.log(`[provision] Channel "${channel.id}" (${channel.type}) created`)

    if (dto.autoStart) {
      return this.start(channel.id)
    }

    return this.toStatusDto(channel, 0, 0)
  }

  async start(channelConfigId: string): Promise<ChannelStatusDto> {
    const claim = await this.db.channelConfig.updateMany({
      where: {
        id: channelConfigId,
        status: { in: START_ALLOWED_STATUSES },
      },
      data: { status: 'starting', isActive: true, errorMessage: null },
    })

    if (claim.count === 0) {
      const channel = await this.db.channelConfig.findUnique({ where: { id: channelConfigId } })
      if (!channel) throw new ChannelNotFoundError(channelConfigId)
      if (channel.status === 'active' || channel.status === 'starting') {
        throw new ChannelAlreadyInStateError(channelConfigId, channel.status)
      }
      throw new InvalidTransitionError(channelConfigId, channel.status, 'starting')
    }

    this.resolver.invalidateCache(channelConfigId)

    try {
      await this.callGatewayActivate(channelConfigId)

      const updated = await this.db.channelConfig.update({
        where: { id: channelConfigId },
        data: { status: 'active', lastStartedAt: new Date() },
      })
      this.resolver.invalidateCache(channelConfigId)
      this.logger.log(`[start] Channel "${channelConfigId}" is now active`)
      return this.buildStatusDto(updated, channelConfigId)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      await this.db.channelConfig.update({
        where: { id: channelConfigId },
        data: { status: 'error', isActive: false, errorMessage },
      })
      this.resolver.invalidateCache(channelConfigId)
      this.logger.error(`[start] Channel "${channelConfigId}" failed to start: ${errorMessage}`)
      throw new WebhookRegistrationError(channelConfigId, errorMessage)
    }
  }

  async stop(channelConfigId: string): Promise<ChannelStatusDto> {
    const claim = await this.db.channelConfig.updateMany({
      where: {
        id: channelConfigId,
        status: { in: STOP_ALLOWED_STATUSES },
      },
      data: { status: 'stopping', isActive: false, errorMessage: null },
    })

    if (claim.count === 0) {
      const channel = await this.db.channelConfig.findUnique({ where: { id: channelConfigId } })
      if (!channel) throw new ChannelNotFoundError(channelConfigId)
      if (channel.status === 'stopped' || channel.status === 'stopping') {
        throw new ChannelAlreadyInStateError(channelConfigId, channel.status)
      }
      throw new InvalidTransitionError(channelConfigId, channel.status, 'stopping')
    }

    this.resolver.invalidateCache(channelConfigId)

    try {
      await this.callGatewayDeactivate(channelConfigId)

      const updated = await this.db.channelConfig.update({
        where: { id: channelConfigId },
        data: { status: 'stopped', lastStoppedAt: new Date() },
      })
      this.resolver.invalidateCache(channelConfigId)
      this.logger.log(`[stop] Channel "${channelConfigId}" is now stopped`)
      return this.buildStatusDto(updated, channelConfigId)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      await this.db.channelConfig.update({
        where: { id: channelConfigId },
        data: { status: 'error', errorMessage },
      })
      this.resolver.invalidateCache(channelConfigId)
      this.logger.error(`[stop] Channel "${channelConfigId}" failed to stop: ${errorMessage}`)
      throw err
    }
  }

  async restart(channelConfigId: string): Promise<ChannelStatusDto> {
    const channel = await this.loadOrThrow(channelConfigId)

    if (channel.status === 'starting' || channel.status === 'stopping') {
      throw new InvalidTransitionError(channelConfigId, channel.status, 'restart')
    }

    if (channel.status === 'active') {
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

  private async callGatewayActivate(id: string): Promise<void> {
    await this.gateway.activateChannel(id)
  }

  private async callGatewayDeactivate(id: string): Promise<void> {
    await this.gateway.deactivateChannel(id)
  }

  private assertTransition(from: ChannelStatus, to: ChannelStatus, channelConfigId: string): void {
    const allowed = TRANSITIONS[from] ?? []
    if (!allowed.includes(to)) {
      throw new InvalidTransitionError(channelConfigId, from, to)
    }
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

  private toStatusDto(ch: any, bindingCount: number, activeSessions: number): ChannelStatusDto {
    return {
      id: ch.id,
      name: ch.name,
      type: ch.type,
      status: ch.status,
      isActive: ch.isActive,
      errorMessage: ch.errorMessage ?? null,
      lastStartedAt: ch.lastStartedAt?.toISOString() ?? null,
      lastStoppedAt: ch.lastStoppedAt?.toISOString() ?? null,
      bindingCount,
      activeSessions,
      createdAt: ch.createdAt.toISOString(),
      updatedAt: ch.updatedAt.toISOString(),
    }
  }

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
