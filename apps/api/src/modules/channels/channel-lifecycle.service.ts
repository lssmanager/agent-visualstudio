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
   */
  private readonly runtimeStatus = new Map<string, RuntimeChannelStatus>()

  /**
   * AUDIT-15: Lock por channelId — previene start/stop concurrentes en el mismo canal.
   *
   * Cómo funciona:
   *   - Al entrar a _withLock(id, fn), se encadena fn() al final de la Promise
   *     actualmente registrada para ese id.
   *   - Si hay una operación en curso (e.g. start), la siguiente (e.g. stop)
   *     esperará a que la primera termine antes de ejecutarse.
   *   - Si la primera falló, la segunda se ejecuta igualmente (segundo callback
   *     de .then()) para no bloquear el canal indefinidamente.
   *   - Cuando la Promise resultante termina y sigue siendo la última en el Map,
   *     se elimina la entrada para liberar memoria.
   *
   * Nota: este lock es en memoria — si el proceso reinicia se limpia.
   *       Lock distribuido (Redis) está fuera de scope de este AUDIT.
   */
  private readonly _locks = new Map<string, Promise<ChannelStatusDto>>()

  constructor(
    private readonly db: PrismaService,
    private readonly gateway: GatewayService,
    private readonly resolver: AgentResolverService,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async provision(dto: ProvisionChannelDto): Promise<ChannelStatusDto> {
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

  /**
   * AUDIT-15: start() pasa por _withLock para serializar operaciones concurrentes.
   */
  async start(channelConfigId: string): Promise<ChannelStatusDto> {
    return this._withLock(channelConfigId, () => this._startLocked(channelConfigId))
  }

  /**
   * AUDIT-15: stop() pasa por _withLock para serializar operaciones concurrentes.
   */
  async stop(channelConfigId: string): Promise<ChannelStatusDto> {
    return this._withLock(channelConfigId, () => this._stopLocked(channelConfigId))
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

  // ── Lock guard ─────────────────────────────────────────────────────────────

  /**
   * AUDIT-15: Serializa operaciones por channelId usando una cadena de Promises.
   * Si la operación anterior falló, la siguiente se ejecuta igualmente
   * para no bloquear el canal indefinidamente.
   */
  private _withLock<T>(
    channelId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const existing = this._locks.get(channelId) as Promise<T> | undefined
    const next = (existing ?? Promise.resolve()).then(
      () => fn(),
      () => fn(), // si la anterior falló, ejecutar igualmente
    )
    this._locks.set(channelId, next as unknown as Promise<ChannelStatusDto>)
    void next.finally(() => {
      // Limpiar el lock cuando no haya más operaciones pendientes
      if (this._locks.get(channelId) === (next as unknown as Promise<ChannelStatusDto>)) {
        this._locks.delete(channelId)
      }
    })
    return next
  }

  // ── Locked operations ───────────────────────────────────────────────────────

  private async _startLocked(channelConfigId: string): Promise<ChannelStatusDto> {
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

  private async _stopLocked(channelConfigId: string): Promise<ChannelStatusDto> {
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

  // ── Gateway calls ───────────────────────────────────────────────────────────

  /**
   * AUDIT-14: Verificación defensiva del resultado de activateChannel.
   *
   * GatewayService.activateChannel() devuelve Promise<void> y lanza si falla.
   * El try/catch en _startLocked ya captura y propaga el error correctamente.
   *
   * Se añade verificación explícita por si en el futuro el contrato cambia:
   *   - { success: boolean } → lanza Error si success=false
   *   - boolean → lanza Error si false
   */
  private async callGatewayActivate(id: string): Promise<void> {
    const result = await this.gateway.activateChannel(id) as unknown

    if (typeof result === 'boolean' && !result) {
      throw new Error(`[gateway] Channel ${id} activation returned false`)
    }

    if (
      result != null &&
      typeof result === 'object' &&
      'success' in result &&
      !(result as { success: boolean }).success
    ) {
      const msg = (result as { error?: string }).error ?? 'activateChannel returned success=false'
      throw new Error(`[gateway] Channel ${id} activation failed: ${msg}`)
    }
  }

  /**
   * AUDIT-14: Verificación defensiva simétrica para deactivateChannel.
   */
  private async callGatewayDeactivate(id: string): Promise<void> {
    const result = await this.gateway.deactivateChannel(id) as unknown

    if (typeof result === 'boolean' && !result) {
      throw new Error(`[gateway] Channel ${id} deactivation returned false`)
    }

    if (
      result != null &&
      typeof result === 'object' &&
      'success' in result &&
      !(result as { success: boolean }).success
    ) {
      const msg = (result as { error?: string }).error ?? 'deactivateChannel returned success=false'
      throw new Error(`[gateway] Channel ${id} deactivation failed: ${msg}`)
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────

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
