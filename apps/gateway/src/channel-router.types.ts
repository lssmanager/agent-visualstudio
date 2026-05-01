/**
 * channel-router.types.ts — [F3a-08]
 *
 * Tipos públicos del ChannelRouter.
 */

import type { IChannelAdapter } from './channels/channel-adapter.interface.js'

/** Estado de un canal activo en el router */
export interface ChannelRouterEntry {
  channelConfigId: string
  channel:         string
  adapter:         IChannelAdapter
  activatedAt:     Date
}

/** Config mínima que ChannelRouter necesita para activate() */
export interface ChannelConfigRow {
  id:               string
  channel:          string
  active:           boolean
  /** JSON string encriptado con las credenciales */
  secretsEncrypted: string | null
}

/** Factory de adapters — inyectable para facilitar tests */
export type AdapterFactory = (channel: string) => IChannelAdapter | null

/** Evento emitido cuando un canal es activado con éxito */
export interface ChannelActivatedEvent {
  channelConfigId: string
  channel:         string
  activatedAt:     Date
}

/** Evento emitido cuando un canal es desactivado */
export interface ChannelDeactivatedEvent {
  channelConfigId: string
  channel:         string
  reason:          'manual' | 'error' | 'shutdown'
}
