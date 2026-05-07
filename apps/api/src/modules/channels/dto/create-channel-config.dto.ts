/**
 * DTO para POST /channels — crea un nuevo ChannelConfig.
 *
 * CreateChannelConfigSchema vive en @lss/crypto (source of truth).
 * Este archivo solo re-exporta para backward-compat dentro de apps/api.
 */

export {
  CreateChannelConfigSchema,
  type CreateChannelConfigDto,
} from '@lss/crypto'
