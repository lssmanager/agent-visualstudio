import { Injectable, Logger }    from '@nestjs/common'
import { PrismaService }         from '../../prisma/prisma.service.js'
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

// Predecesores válidos para cada operación (usados en atomic claim)
const START_ALLOWED_STATUSES: ChannelStatus[] = ['provisioned', 'stopped', 'error']
const STOP_ALLOWED_STATUSES:  ChannelStatus[] = ['active']

// ── Servicio ────────────────────────────────────────────────────────────

@Injectable()
export class ChannelLifecycleService {
  private readonly logger = new Logger(ChannelLifecycleService.name)

  constructor(
    private readonly db:       PrismaService,
    private readonly gateway:  GatewayService,
    private readonly resolver: AgentResolverService,
  ) {}

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
   *
   * Flujo (atomic claim pattern — elimina TOCTOU):
   *   1. Intentar updateMany con WHERE id=X AND status IN (allowed)
   *      → status='starting', isActive=true
   *   2. Si count=0: leer estado actual para lanzar error apropiado
   *      (ChannelAlreadyInStateError si ya active/starting, InvalidTransitionError
   *       si stopping, ChannelNotFoundError si no existe)
   *   3. Si count=1: llamar GatewayService.activateChannel()
   *   4a. Éxito → status='active', lastStartedAt=now
   *   4b. Fallo → status='error', isActive=false, errorMessage
   *
   * @throws ChannelNotFoundError si el canal no existe
   * @throws ChannelAlreadyInStateError si ya está 'active' o 'starting'
   * @throws InvalidTransitionError si está en 'stopping'
   * @throws WebhookRegistrationError si el gateway falla al activar
   */
  async start(channelConfigId: string): Promise<ChannelStatusDto> {
    // Atomic claim: sólo transiciona a 'starting' si el status actual lo permite
    const claim = await this.db.channelConfig.updateMany({
      where: {
        id:     channelConfigId,
        status: { in: START_ALLOWED_STATUSES },
      },
      data: { status: 'starting', isActive: true, errorMessage: null },
    })

    if (claim.count === 0) {
      // No se pudo reclamar — diagnosticar por qué
      const channel = await this.db.channelConfig.findUnique({
        where: { id: channelConfigId },
      })
      if (!channel) throw new ChannelNotFoundError(channelConfigId)
      if (channel.status === 'active' || channel.status === 'starting') {
        throw new ChannelAlreadyInStateError(channelConfigId, channel.status)
      }
      // stopping u otro estado no permitido
      throw new InvalidTransitionError(channelConfigId, channel.status, 'starting')
    }

    this.resolver.invalidateCache(channelConfigId)

    try {
      await this.callGatewayActivate(channelConfigId)

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
   *
   * Flujo (atomic claim pattern — simétrico a start()):
   *   1. Intentar updateMany con WHERE id=X AND status IN ('active')
   *      → status='stopping', isActive=false
   *   2. Si count=0: leer estado actual para lanzar error apropiado
   *   3. Si count=1: llamar GatewayService.deactivateChannel()
   *   4a. Éxito → status='stopped', lastStoppedAt=now
   *   4b. Fallo → status='error', errorMessage
   *
   * @throws ChannelNotFoundError si el canal no existe
   * @throws ChannelAlreadyInStateError si ya está 'stopped' o 'stopping'
   * @throws InvalidTransitionError si el estado no permite detener
   */
  async stop(channelConfigId: string): Promise<ChannelStatusDto> {
    const claim = await this.db.channelConfig.updateMany({
      where: {
        id:     channelConfigId,
        status: { in: STOP_ALLOWED_STATUSES },
      },
      data: { status: 'stopping', isActive: false, errorMessage: null },
    })

    if (claim.count === 0) {
      const channel = await this.db.channelConfig.findUnique({
        where: { id: channelConfigId },
      })
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
      channels.map((ch) => this.buildStatusDto(ch, ch.id))
    )
  }

  // ────────────────────────────────────────────────────────────────────
  // GATEWAY DELEGATION — falla rápido si los métodos no están presentes
  // ────────────────────────────────────────────────────────────────────

  /**
   * Delega activación al GatewayService.
   * Lanza un error descriptivo si activateChannel no está implementado,
   * en lugar de silenciosamente retornar éxito (lo que permitiría persistir
   * status='active' sin que el gateway haya activado nada real).
   */
  private async callGatewayActivate(id: string): Promise<void> {
    if (typeof (this.gateway as any).activateChannel !== 'function') {
      throw new Error(
        `[ChannelLifecycle] GatewayService is missing activateChannel() — ` +
        `cannot activate channel "${id}". Implement GatewayService.activateChannel().`
      )
    }
    await (this.gateway as any).activateChannel(id)
  }

  /**
   * Delega desactivación al GatewayService.
   * Lanza un error descriptivo si deactivateChannel no está implementado,
   * en lugar de silenciosamente retornar éxito.
   */
  private async callGatewayDeactivate(id: string): Promise<void> {
    if (typeof (this.gateway as any).deactivateChannel !== 'function') {
      throw new Error(
        `[ChannelLifecycle] GatewayService is missing deactivateChannel() — ` +
        `cannot deactivate channel "${id}". Implement GatewayService.deactivateChannel().`
      )
    }
    await (this.gateway as any).deactivateChannel(id)
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
    const key    = Buffer.from(keyHex, 'hex')
    const iv     = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const plain  = Buffer.from(JSON.stringify(secrets), 'utf8')
    const enc    = Buffer.concat([cipher.update(plain), cipher.final()])
    const tag    = cipher.getAuthTag()
    return Buffer.concat([iv, tag, enc]).toString('base64')
  }
}
