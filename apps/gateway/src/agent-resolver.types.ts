/**
 * agent-resolver.types.ts — [F3a-06]
 *
 * Tipos públicos del AgentResolver.
 * Sin dependencias de Prisma ni de NestJS — importables desde cualquier capa.
 */

/**
 * Contexto de resolución — lo que se conoce del usuario inbound
 * en el momento de la resolución.
 */
export interface AgentResolutionContext {
  /** channelConfigId del canal que recibió el mensaje */
  channelConfigId: string
  /** ID externo del usuario (chat.id de Telegram, userId de webchat) */
  externalUserId:  string
  /**
   * ID del workspace al que pertenece el usuario, si se conoce.
   * Puede estar en GatewaySession.metadata o extraerse de la BD de tenants.
   * Opcional — si no se provee, se omite el scope 'workspace'.
   */
  workspaceId?:    string
  /**
   * ID del tenant al que pertenece el usuario, si se conoce.
   * Opcional — si no se provee, se omite el scope 'tenant'.
   */
  tenantId?:       string
}

/**
 * Resultado de la resolución del agente.
 */
export interface AgentResolutionResult {
  agentId:    string
  /** Scope que produjo la resolución */
  resolvedBy: 'user' | 'tenant' | 'workspace' | 'default' | 'config'
  /**
   * 'config'    → se usó cfg.agentId de ChannelConfig (fallback legacy)
   * 'default'   → se usó el binding scope='default'
   * 'workspace' / 'tenant' / 'user' → match por scope dinámico
   */
  bindingId?: string
}

export type BindingScope = 'default' | 'workspace' | 'tenant' | 'user'
