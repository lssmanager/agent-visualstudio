/**
 * whatsapp-session.store.ts
 * Fix campos canonicos:
 *   externalId   (antes: externalUserId)  -> TS2561
 *   state        (antes: status)           -> TS2353
 *   channelConfigId_externalId (compound)  -> TS2322
 */
import { PrismaService } from './prisma/prisma.service'

export class WhatsAppSessionStore {
  constructor(private readonly db: PrismaService) {}

  async upsert(channelConfigId: string, externalId: string, agentId: string) {
    return this.db.gatewaySession.upsert({
      where:  { channelConfigId_externalId: { channelConfigId, externalId } },
      create: { channelConfigId, externalId, agentId, state: 'active' },
      update: { agentId, state: 'active' },
    })
  }

  async findByChannelAndUser(channelConfigId: string, externalId: string) {
    return this.db.gatewaySession.findUnique({
      where: { channelConfigId_externalId: { channelConfigId, externalId } },
    })
  }

  async close(channelConfigId: string, externalId: string) {
    return this.db.gatewaySession.update({
      where: { channelConfigId_externalId: { channelConfigId, externalId } },
      data:  { state: 'closed' },
    })
  }

  async deleteAllForChannel(channelConfigId: string) {
    return this.db.gatewaySession.deleteMany({ where: { channelConfigId } })
  }
}
