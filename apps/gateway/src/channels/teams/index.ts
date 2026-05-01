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
} from './teams-mode.strategy.js'

export {
  IncomingWebhookStrategy,
  BotFrameworkStrategy,
  createTeamsModeStrategy,
  buildAdaptiveTextCard,
  buildAdaptiveRichCard,
} from './teams-mode.strategy.js'

// Re-export del adapter (F3a-32)
export { TeamsAdapter } from './teams-bot.adapter.js'
export type { TeamsAdapterConfig } from './teams-bot.adapter.js'
