/**
 * create-channel-config.schema.ts
 *
 * FIX TS2305: Reemplazado import { ChannelKind } from '@prisma/client'
 * por import local de ./channel-kind — no depende de prisma generate.
 */

import { z } from 'zod'
import { ChannelKind } from './channel-kind.js'

export { ChannelKind, ChannelType } from './channel-kind.js'

const channelKindValues = Object.values(ChannelKind) as [ChannelKind, ...ChannelKind[]]

export const CreateChannelConfigSchema = z.object({
  workspaceId: z.string().cuid(),
  kind:        z.enum(channelKindValues),
  name:        z.string().min(1).max(100),
  config:      z.record(z.unknown()).optional().default({}),
  secrets:     z.record(z.unknown()).optional().default({}),
})

export type CreateChannelConfigInput = z.infer<typeof CreateChannelConfigSchema>
