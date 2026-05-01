import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../../lib/prisma.service.js'
import { GatewayService }        from '../gateway/gateway.service.js'
import { AgentResolverService }  from '../gateway/agent-resolver.service.js'
import {
  ChannelNotFoundError,
  InvalidTransitionError,
  ChannelAlreadyInStateError,
  WebhookRegistrationError,
} from './channel-lifecycle.errors.js'
import type { ProvisionChannelDto, ChannelStatusDto } from './dto/provision-channel.dto.js'
import { createCipheriv, randomBytes }               from 'crypto'

// ── Tipos ───────────────────────────────────────────────────────────────

type ChannelStatus =
  | 'provisioned'
  | 'starting'
  | 'active'
  | 'stopping'
  | 'stopped'
  | 'error'

// ── Transiciones permitidas (mapa explícito) ────────────────────────────

const TRANSITIONS: Record<ChannelStatus, ChannelStatus[]> = {
  provisioned: ['starting'],
  starting:    ['active', 'error'],
  active:      ['stopping'],
  stopping:    ['stopped', 'error'],
  stopped:     ['starting'],
  error:       ['starting'],
}

// ── Servicio ────────────────────────────────────────────────────────────

@Injectable()
export class ChannelLifecycleService implements OnModuleInit {
  private readonly logger = new Logger(ChannelLifecycleService.name)

  constructor(
    private readonly db:       PrismaService,
    private readonly gateway:  GatewayService,
    private readonly resolver: AgentResolverService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.recoverStuckTransitions()
  }

  // ────────────────────────────────────────────────────────────────────
  // PROVISION — Crea el ChannelConfig en BD con status='provisioned'
  // ────────────────────────────────────────────────────────────────────

  /**
   * Crea un nuevo canal en la BD en estado 'provisioned'.
   * No registra webhooks ni activa el canal.
   * Si dto.autoStart=true, llama start() inmediatamente después.
   *
   * @returns ChannelStatusDto del canal creado
   */
  async provision(dto: ProvisionChannelDto): Promise<ChannelStatusDto> {
    const secretsEncrypted = dto.secrets
      ? this.encryptSecrets(dto.secrets)
      : null

    const channel = await this.db.channelConfig.create({
      data: {
        type:             dto.type,
        name:             dto.name,
        config:           dto.config,
        secretsEncrypted,
        isActive:         false,
        status:           'provisioned',
        errorMessage:     null,
        lastStartedAt:    null,
        lastStoppedAt:    null,
      },
    })

    this.logger.log(`[provision] Channel "${channel.id}" (${channel.type}) created`)

    if (dto.autoStart) {
      return this.start(channel.id)
    }

    return this.toStatusDto(channel, 0, 0)
  }

  // ────────────────────────────────────────────────────────────────────
  // START — Activa el canal: registra webhooks y marca isActive=true
  // ────────────────────────────────────────────────────────────────────

  /**
   * Inicia un canal en estado 'provisioned', 'stopped', o 'error'.
   * Flujo:
   *   1. Validar transición → 'starting'
   *   2. Persistir status='starting', isActive=true
   *   3. Llamar GatewayService.activateChannel() (con stub de seguridad)
   *   4a. Éxito → persistir status='active', lastStartedAt=now
   *   4b. Fallo → persistir status='error', isActive=false, errorMessage
   *
   * @throws InvalidTransitionError si el canal no puede hacer start desde su estado actual
   */
  async start(channelConfigId: string): Promise<ChannelStatusDto> {
    const channel = await this.loadOrThrow(channelConfigId)

    if (channel.status === 'active') {
      throw new ChannelAlreadyInStateError(channelConfigId, 'active')
    }

    this.assertTransition(channel.status as ChannelStatus, 'starting', channelConfigId)

    // Marcar como 'starting'
    await this.db.channelConfig.update({
      where: { id: channelConfigId },
      data:  { status: 'starting', isActive: true, errorMessage: null },
    })
    this.resolver.invalidateCache(channelConfigId)

    try {
      // Delegar al GatewayService la activación real del canal.
      await this.callGatewayActivate(channelConfigId)

      // Marcar como 'active'
      const updated = await this.db.channelConfig.update({
        where: { id: channelConfigId },
        data:  { status: 'active', lastStartedAt: new Date() },
      })
      this.resolver.invalidateCache(channelConfigId)
      this.logger.log(`[start] Channel "${channelConfigId}" is now active`)
      return this.buildStatusDto(updated, channelConfigId)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      await this.db.channelConfig.update({
        where: { id: channelConfigId },
        data:  { status: 'error', isActive: false, errorMessage },
      })
      this.resolver.invalidateCache(channelConfigId)
      this.logger.error(`[start] Channel "${channelConfigId}" failed to start: ${errorMessage}`)
      throw new WebhookRegistrationError(channelConfigId, errorMessage)
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // STOP — Desactiva el canal: desregistra webhooks y marca isActive=false
  // ────────────────────────────────────────────────────────────────────

  /**
   * Detiene un canal en estado 'active'.
   * Flujo:
   *   1. Validar transición → 'stopping'
   *   2. Persistir status='stopping', isActive=false
   *   3. Llamar GatewayService.deactivateChannel() (con stub de seguridad)
   *   4a. Éxito → persistir status='stopped', lastStoppedAt=now
   *   4b. Fallo → persistir status='error', errorMessage
   *
   * @throws InvalidTransitionError si el canal no está en estado 'active'
   */
  async stop(channelConfigId: string): Promise<ChannelStatusDto> {
    const channel = await this.loadOrThrow(channelConfigId)

    if (channel.status === 'stopped') {
      throw new ChannelAlreadyInStateError(channelConfigId, 'stopped')
    }

    this.assertTransition(channel.status as ChannelStatus, 'stopping', channelConfigId)

    await this.db.channelConfig.update({
      where: { id: channelConfigId },
      data:  { status: 'stopping', isActive: false, errorMessage: null },
    })
    this.resolver.invalidateCache(channelConfigId)

    try {
      await this.callGatewayDeactivate(channelConfigId)

      const updated = await this.db.channelConfig.update({
        where: { id: channelConfigId },
        data:  { status: 'stopped', lastStoppedAt: new Date() },
      })
      this.resolver.invalidateCache(channelConfigId)
      this.logger.log(`[stop] Channel "${channelConfigId}" is now stopped`)
      return this.buildStatusDto(updated, channelConfigId)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      await this.db.channelConfig.update({
        where: { id: channelConfigId },
        data:  { status: 'error', errorMessage },
      })
      this.resolver.invalidateCache(channelConfigId)
      this.logger.error(`[stop] Channel "${channelConfigId}" failed to stop: ${errorMessage}`)
      throw err
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // RESTART — stop() + start() con manejo de estado intermedio
  // ────────────────────────────────────────────────────────────────────

  /**
   * Reinicia el canal.
   * - Si está 'active' → stop() + start()
   * - Si está 'error', 'stopped', 'provisioned' → start() directo
   * - Si está 'starting' o 'stopping' → InvalidTransitionError
   */
  async restart(channelConfigId: string): Promise<ChannelStatusDto> {
    const channel = await this.loadOrThrow(channelConfigId)

    if (channel.status === 'starting' || channel.status === 'stopping') {
      throw new InvalidTransitionError(
        channelConfigId,
        channel.status,
        'restart',
      )
    }

    if (channel.status === 'active') {
      await this.stop(channelConfigId)
    }

    return this.start(channelConfigId)
  }

  // ────────────────────────────────────────────────────────────────────
  // STATUS — Lectura enriquecida del estado del canal
  // ────────────────────────────────────────────────────────────────────

  /**
   * Retorna el ChannelStatusDto con conteos de bindings y sesiones activas.
   * Nunca lanza errores de transición — solo lanza ChannelNotFoundError.
   */
  async status(channelConfigId: string): Promise<ChannelStatusDto> {
    const channel = await this.loadOrThrow(channelConfigId)
    return this.buildStatusDto(channel, channelConfigId)
  }

  /**
   * Lista todos los canales con su estado actual.
   * Ordenados por: activos primero, luego por nombre.
   */
  async listAll(): Promise<ChannelStatusDto[]> {
    const channels = await this.db.channelConfig.findMany({
      orderBy: [
        { isActive: 'desc' },
        { name: 'asc' },
      ],
    })

    return Promise.all(
      channels.map((ch: any) => this.buildStatusDto(ch, ch.id))
    )
  }

  // ────────────────────────────────────────────────────────────────────
  // STUBS DE GATEWAY (safe delegation)
  // ────────────────────────────────────────────────────────────────────

  /**
   * Llama gateway.activateChannel() si el método existe.
   * Si aún no está implementado en GatewayService, actúa como no-op
   * para que el build no rompa.
   */
  private async callGatewayActivate(id: string): Promise<void> {
    await this.gateway.activateChannel(id)
  }

  /**
   * Llama gateway.deactivateChannel() si el método existe.
   * Si aún no está implementado en GatewayService, actúa como no-op.
   */
  private async callGatewayDeactivate(id: string): Promise<void> {
    await this.gateway.deactivateChannel(id)
  }

  /**
   * Recupera transiciones intermedias que quedaron abiertas tras un crash.
   * Esto evita que un canal quede atrapado en 'starting'/'stopping' sin salida.
   */
  async recoverStuckTransitions(): Promise<number> {
    const result = await this.db.channelConfig.updateMany({
      where: {
        status: {
          in: ['starting', 'stopping'],
        },
      },
      data: {
        status:       'error',
        isActive:     false,
        errorMessage: 'Recovered from interrupted lifecycle transition',
      },
    })

    if (result.count > 0) {
      this.logger.warn(
        `[recovery] Reset ${result.count} channel(s) stuck in an intermediate state`,
      )
    }

    return result.count
  }

  // ────────────────────────────────────────────────────────────────────
  // PRIVADOS
  // ────────────────────────────────────────────────────────────────────

  private assertTransition(
    from:             ChannelStatus,
    to:               ChannelStatus,
    channelConfigId:  string,
  ): void {
    const allowed = TRANSITIONS[from] ?? []
    if (!allowed.includes(to)) {
      throw new InvalidTransitionError(channelConfigId, from, to)
    }
  }

  private async loadOrThrow(channelConfigId: string) {
    const channel = await this.db.channelConfig.findUnique({
      where: { id: channelConfigId },
    })
    if (!channel) throw new ChannelNotFoundError(channelConfigId)
    return channel
  }

  private async buildStatusDto(
    channel:         any,
    channelConfigId: string,
  ): Promise<ChannelStatusDto> {
    const [bindingCount, activeSessions] = await Promise.all([
      this.db.channelBinding.count({ where: { channelConfigId } }),
      this.db.gatewaySession.count({
        where: { channelConfigId, state: 'active' },
      }),
    ])
    return this.toStatusDto(channel, bindingCount, activeSessions)
  }

  private toStatusDto(
    ch:             any,
    bindingCount:   number,
    activeSessions: number,
  ): ChannelStatusDto {
    return {
      id:             ch.id,
      name:           ch.name,
      type:           ch.type,
      status:         ch.status,
      isActive:       ch.isActive,
      errorMessage:   ch.errorMessage ?? null,
      lastStartedAt:  ch.lastStartedAt?.toISOString() ?? null,
      lastStoppedAt:  ch.lastStoppedAt?.toISOString() ?? null,
      bindingCount,
      activeSessions,
      createdAt:      ch.createdAt.toISOString(),
      updatedAt:      ch.updatedAt.toISOString(),
    }
  }

  /**
   * Encripta los secretos del canal usando AES-256-GCM.
   * Mismo esquema que GatewayService: [12 IV][16 tag][N ciphertext]
   */
  private encryptSecrets(secrets: Record<string, unknown>): string {
    const keyHex = process.env.GATEWAY_ENCRYPTION_KEY ?? ''
    if (!keyHex) throw new Error('GATEWAY_ENCRYPTION_KEY is not set')
    if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
      throw new Error('GATEWAY_ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
    }
    const key    = Buffer.from(keyHex, 'hex')
    if (key.length !== 32) {
      throw new Error('GATEWAY_ENCRYPTION_KEY contains invalid hex')
    }
    const iv     = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const plain  = Buffer.from(JSON.stringify(secrets), 'utf8')
    const enc    = Buffer.concat([cipher.update(plain), cipher.final()])
    const tag    = cipher.getAuthTag()
    return Buffer.concat([iv, tag, enc]).toString('base64')
  }
}
