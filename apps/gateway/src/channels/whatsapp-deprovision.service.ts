/**
 * whatsapp-deprovision.service.ts
 * Fix TS2561: usa 'isActive' (nombre canonico) en lugar de 'active'.
 */
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class WhatsAppDeprovisionService {
  constructor(private readonly db: PrismaService) {}

  async deprovision(channelConfigId: string): Promise<void> {
    await this.db.channelConfig.update({
      where: { id: channelConfigId },
      data:  { isActive: false },
    })
    console.info(`[WhatsAppDeprovision] Channel ${channelConfigId} deprovisioned`)
  }

  async provision(channelConfigId: string): Promise<void> {
    await this.db.channelConfig.update({
      where: { id: channelConfigId },
      data:  { isActive: true },
    })
    console.info(`[WhatsAppDeprovision] Channel ${channelConfigId} provisioned`)
  }

  async listInactive(): Promise<{ id: string; channel: string; workspaceId: string }[]> {
    return this.db.channelConfig.findMany({
      where:  { isActive: false },
      select: { id: true, channel: true, workspaceId: true },
    })
  }
}
