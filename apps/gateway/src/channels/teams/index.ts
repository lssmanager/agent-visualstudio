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
