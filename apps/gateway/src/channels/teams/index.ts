/**
 * teams/index.ts — Barrel exports para el módulo Teams
 * Importar desde aquí en lugar de rutas profundas.
 */

export type {
  TeamsMode,
  TeamsConfig,
  TeamsSecrets,
  TeamsIncomingWebhookSecrets,
  TeamsBotFrameworkSecrets,
  TeamsActivity,
  TeamsAttachment,
  TeamsOutgoingPayload,
  TeamsSendResult,
  ITeamsModeStrategy,
} from './teams-mode.strategy'

export {
  IncomingWebhookStrategy,
  BotFrameworkStrategy,
  createTeamsModeStrategy,
  buildAdaptiveTextCard,
  buildAdaptiveRichCard,
} from './teams-mode.strategy'

// Re-export del adapter bidireccional (F3a-32)
export { TeamsAdapter } from './teams-bot.adapter'
export type { TeamsAdapterConfig } from './teams-bot.adapter'

// TeamsWebhookAdapter — solo-envío, notificaciones de sistema (F3a-33)
export {
  TeamsWebhookAdapter,
  sendTeamsNotification,
} from './teams-webhook.adapter'

export type {
  TeamsWebhookConfig,
  TeamsWebhookSendResult,
  TeamsNotification,
} from './teams-webhook.adapter'
