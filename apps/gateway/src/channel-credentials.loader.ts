/**
 * channel-credentials.loader.ts
 * Usa 'channel' y 'credentials' (nombres canonicos del schema actual).
 * Eliminadas: ChannelType (enum borrado), secretsEncrypted, @lss/crypto.
 */
import { PrismaService } from './prisma/prisma.service'

export interface ChannelCredentials {
  channelConfigId: string
  channel:         string
  credentials:     Record<string, unknown>
}

export class ChannelCredentialsLoader {
  constructor(private readonly db: PrismaService) {}

  async load(channelConfigId: string): Promise<ChannelCredentials> {
    const row = await this.db.channelConfig.findUniqueOrThrow({
      where:  { id: channelConfigId },
      select: { id: true, channel: true, credentials: true },
    })

    return {
      channelConfigId: row.id,
      channel:         row.channel,
      credentials:     (row.credentials as Record<string, unknown>) ?? {},
    }
  }
}
