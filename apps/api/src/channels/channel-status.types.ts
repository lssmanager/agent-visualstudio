// apps/api/src/channels/channel-status.types.ts
//
// Tipos para las respuestas de la API REST de canales.
// AUDIT-25: botStatus es el campo principal de estado expuesto.
//           isActive está OMITIDO en responses externas (campo deprecated).

import { BotStatus, ChannelType } from '@prisma/client'

/**
 * Respuesta estándar de GET /api/channels y GET /api/channels/:id
 * botStatus es el campo principal de estado — nunca exponer isActive.
 */
export interface ChannelResponse {
  id:               string
  name:             string
  type:             ChannelType
  workspaceId:      string
  botStatus:        BotStatus
  statusDetail?:    string
  statusUpdatedAt?: string
  createdAt:        string
  updatedAt:        string
  // isActive: OMITIDO intencionalmente — campo deprecated, solo uso interno.
}

/**
 * Respuesta de GET /api/channels/:id/status
 * Solo expone el estado — útil para polling ligero.
 */
export interface ChannelStatusResponse {
  channelConfigId:  string
  botStatus:        BotStatus
  statusDetail?:    string
  statusUpdatedAt?: string
}

/**
 * Payload de eventos SSE emitidos en GET /api/channels/:id/status-stream
 * Estructura compatible con StatusTransitionEvent de channel-lifecycle.service.ts
 */
export interface ChannelStatusSseEvent {
  channelConfigId: string
  status:          BotStatus
  detail?:         string
  timestamp:       string
}
