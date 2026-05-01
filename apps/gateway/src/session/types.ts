/**
 * session/types.ts
 *
 * Tipos públicos del SessionManager.
 * Este archivo NO importa nada de apps/gateway/src/channels/
 * para mantener session/ desacoplado del transporte.
 */

/**
 * Representa una sesión activa de un usuario externo en un canal.
 * Retornado por receiveUserMessage() y findSession().
 */
export interface GatewaySessionDto {
  id:              string
  channelConfigId: string
  externalUserId:  string
  agentId:         string
  /** Historial de turns completo, ordenado cronológicamente */
  history:         SessionTurn[]
  createdAt:       string
  updatedAt:       string
}

/**
 * Un turno de conversación dentro de una sesión.
 * Mapea 1-a-1 con ConversationMessage en Prisma.
 */
export interface SessionTurn {
  id:        string
  role:      'user' | 'assistant'
  text:      string
  type:      string      // IncomingMessage.type | 'text'
  metadata?: Record<string, unknown> | null
  createdAt: string
}

/**
 * IncomingMessage normalizado.
 * Copiado aquí para que session/ no importe de channels/.
 */
export interface IncomingMessage {
  /** chat.id de Telegram / userId de webchat → equivale a externalUserId */
  externalId:   string
  senderId:     string
  text:         string
  type:         'text' | 'image' | 'audio' | 'file' | 'command'
  attachments?: Array<{ type: string; url?: string; data?: unknown }>
  metadata?:    Record<string, unknown>
  receivedAt:   string
}

/**
 * Mensaje saliente del agente (OutboundMessage en gateway.service.ts).
 */
export interface OutboundMessage {
  externalUserId: string
  text:           string
  type?:          string
  metadata?:      Record<string, unknown>
}
