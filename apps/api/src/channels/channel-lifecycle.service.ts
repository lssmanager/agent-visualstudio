// apps/api/src/channels/channel-lifecycle.service.ts
//
// ChannelLifecycleService — ÚNICO escritor de botStatus e isActive en ChannelConfig.
//
// AUDIT-25: botStatus = fuente de verdad runtime.
//           isActive  = campo derivado (deprecated) = botStatus IN (online, degraded).
//           Ningún adapter, controller ni servicio externo debe
//           escribir botStatus o isActive directamente en Prisma.
//           Todos deben llamar a transitionStatus() de este servicio.

import { Injectable, Logger } from '@nestjs/common'
import { BotStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ChannelEventEmitter } from './channel-event-emitter'

// ─────────────────────────────────────────────────────────────────────────────
// Transiciones válidas del ciclo de vida del canal.
// Solo se permiten las transiciones explícitamente listadas.
// El estado deprovisioned es TERMINAL: no hay transición de salida.
// ─────────────────────────────────────────────────────────────────────────────
const VALID_TRANSITIONS: Partial<Record<BotStatus, BotStatus[]>> = {
  draft:         ['configured', 'error'],
  configured:    ['provisioning', 'error'],
  // NOTA: configured → draft ELIMINADO intencionalmente.
  // "Reset de configuración" no tiene caso de uso en API/UI actual.
  // Si se necesita en el futuro, añadir explícitamente con operación
  // dedicada (resetConfig) para evitar degradación accidental de estado.
  provisioning:  ['needsauth', 'starting', 'error', 'offline'],
  needsauth:     ['starting', 'error', 'offline'],
  starting:      ['online', 'error', 'offline'],
  online:        ['degraded', 'offline', 'error'],
  degraded:      ['online', 'offline', 'error'],
  offline:       ['starting', 'provisioning', 'deprovisioned', 'error'],
  error:         ['starting', 'provisioning', 'deprovisioned', 'offline'],
  deprovisioned: [], // TERMINAL
  deprovisioned: [], // TERMINAL — ver error descriptivo en transitionStatus()
}

/**
 * Deriva el valor de isActive (deprecated) a partir de botStatus.
 * isActive = true solo si el canal está procesando mensajes normalmente.
 * Este cálculo es el ÚNICO lugar que debe definir esta derivación.
 * Este cálculo es el ÚNICO lugar que debe definir esta derivación.
 */
function deriveIsActive(status: BotStatus): boolean {
  return status === BotStatus.online || status === BotStatus.degraded
}

export interface StatusTransitionEvent {
  channelConfigId: string
  status:          BotStatus
  detail?:         string
  timestamp:       string
}

@Injectable()
export class ChannelLifecycleService {
  private readonly logger = new Logger(ChannelLifecycleService.name)

  constructor(
    private readonly prisma:  PrismaService,
    private readonly events:  ChannelEventEmitter,
  ) {}

  /**
   * Transiciona el canal al nuevo estado.
   *
   * - Valida que la transición esté permitida en VALID_TRANSITIONS.
   * - Actualiza botStatus, isActive (derivado), statusDetail y statusUpdatedAt.
   * - Emite el evento canónico `channel.{newStatus}` para SSE, webhooks, etc.
   *
   * @param channelConfigId  UUID del ChannelConfig
   * @param newStatus        Estado destino (valor del enum BotStatus)
   * @param detail           Mensaje opcional (stack trace, aviso de API, etc.)
   * @throws Error si la transición no está permitida o el canal es terminal
   */
  async transitionStatus(
    channelConfigId: string,
    newStatus:       BotStatus,
    detail?:         string,
  ): Promise<void> {
    const channel = await this.prisma.channelConfig.findUniqueOrThrow({
      where:  { id: channelConfigId },
      select: { botStatus: true },
    })

    const currentStatus = channel.botStatus

    // Estado terminal: mensaje específico y claro
    if (currentStatus === BotStatus.deprovisioned) {
      throw new Error(
        `Channel ${channelConfigId} is deprovisioned (terminal state). ` +
        `Create a new ChannelConfig to reprovision.`,
      )
    }

    const allowed = VALID_TRANSITIONS[currentStatus] ?? []

    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid BotStatus transition: ${currentStatus} → ${newStatus}. ` +
        `Allowed from '${currentStatus}': [${allowed.join(', ') || 'none'}]`,
      )
    }

    await this.prisma.channelConfig.update({
      where: { id: channelConfigId },
      data: {
        botStatus:       newStatus,
        isActive:        deriveIsActive(newStatus), // SIEMPRE derivado, nunca manual
        statusDetail:    detail ?? null,
        statusUpdatedAt: new Date(),
      },
    })

    this.logger.log(
      `Channel ${channelConfigId}: ${currentStatus} → ${newStatus}` +
      (detail ? ` [${detail.slice(0, 120)}]` : ''),
    )

    const event: StatusTransitionEvent = {
      channelConfigId,
      status:    newStatus,
      detail,
      timestamp: new Date().toISOString(),
    }

    // Emite evento canónico: channel.online, channel.offline, channel.error, etc.
    // Consumido por: SSE endpoint, webhook notifiers, monitoring.
    this.events.emit(`channel.${newStatus}`, event)
  }
}
