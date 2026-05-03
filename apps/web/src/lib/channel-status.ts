// apps/web/src/lib/channel-status.ts
//
// Mapa de presentación para el enum BotStatus canónico.
// AUDIT-25: usar BOT_STATUS_DISPLAY en lugar de isActive para UI.
//
// Para migrar componentes legacy que usen isActive o status 'idle'/'active':
//   1. Reemplazar is_active checks por: BOT_STATUS_DISPLAY[channel.botStatus].isActive
//   2. Reemplazar label/color hardcodeados por: BOT_STATUS_DISPLAY[channel.botStatus].label/color
//   3. Una vez migrados todos los componentes, eliminar legacyStatusFromBotStatus()
//
// Buscar componentes que necesiten migración:
//   grep -rn "isActive\|status.*['"]idle['"]" apps/web/src --include="*.tsx" --include="*.ts"

import type { BotStatus } from '@/types/prisma'

export type StatusColor =
  | 'gray'
  | 'yellow'
  | 'blue'
  | 'green'
  | 'orange'
  | 'red'
  | 'purple'

export type ChannelAction =
  | 'provision'
  | 'test'
  | 'stop'
  | 'restart'
  | 'auth'
  | 'deprovision'

export interface BotStatusDisplay {
  /** Etiqueta legible para el usuario */
  label:    string
  /** Color semántico del badge/indicador */
  color:    StatusColor
  /** Acciones disponibles en este estado */
  actions:  ChannelAction[]
  /**
   * true si el canal está procesando mensajes activamente.
   * Equivalente a: botStatus IN (online, degraded).
   * Usar SOLO cuando sea imprescindible un booleano.
   */
  isActive: boolean
}

export const BOT_STATUS_DISPLAY: Record<BotStatus, BotStatusDisplay> = {
  draft: {
    label:    'Sin configurar',
    color:    'gray',
    actions:  ['provision'],
    isActive: false,
  },
  configured: {
    label:    'Listo',
    color:    'blue',
    actions:  ['provision', 'test'],
    isActive: false,
  },
  provisioning: {
    label:    'Provisionando...',
    color:    'yellow',
    actions:  [],
    isActive: false,
  },
  needsauth: {
    label:    'Requiere autenticación',
    color:    'orange',
    actions:  ['auth'],
    isActive: false,
  },
  starting: {
    label:    'Iniciando...',
    color:    'yellow',
    actions:  [],
    isActive: false,
  },
  online: {
    label:    'En línea',
    color:    'green',
    actions:  ['stop', 'restart'],
    isActive: true,
  },
  degraded: {
    label:    'Con problemas',
    color:    'orange',
    actions:  ['restart', 'stop'],
    isActive: true,
  },
  offline: {
    label:    'Desconectado',
    color:    'gray',
    actions:  ['restart', 'deprovision'],
    isActive: false,
  },
  error: {
    label:    'Error',
    color:    'red',
    actions:  ['restart', 'deprovision'],
    isActive: false,
  },
  deprovisioned: {
    label:    'Dado de baja',
    color:    'purple',
    actions:  ['provision'],
    isActive: false,
  },
}

/**
 * Helper para los pocos lugares que sigan necesitando un booleano.
 */
export function isActiveFromBotStatus(status: BotStatus): boolean {
  return BOT_STATUS_DISPLAY[status].isActive
}

/**
 * Compatibilidad TEMPORAL para componentes legacy que usen el tri-estado
 * 'idle' | 'provisioning' | 'active'.
 *
 * @deprecated Eliminar cuando todos los componentes estén migrados a BotStatus.
 */
export function legacyStatusFromBotStatus(
  status: BotStatus,
): 'idle' | 'provisioning' | 'active' {
  if (status === 'online' || status === 'degraded')                          return 'active'
  if (['provisioning', 'needsauth', 'starting'].includes(status as string))  return 'provisioning'
  return 'idle'
}
