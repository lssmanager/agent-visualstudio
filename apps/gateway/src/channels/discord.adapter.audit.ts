import { AuditService } from '../audit/audit.service'

export class DiscordAdapterAudit {
  constructor(private readonly audit: AuditService) {}

  async messageReceived(channelId: string, userId: string, meta?: Record<string, unknown>): Promise<void> {
    await this.audit.log({ action: 'message.received', channelType: 'discord', channelId, userId, meta })
  }

  async messageSent(channelId: string, meta?: Record<string, unknown>): Promise<void> {
    await this.audit.log({ action: 'message.sent', channelType: 'discord', channelId, meta })
  }

  async error(channelId: string, meta?: Record<string, unknown>): Promise<void> {
    await this.audit.log({ action: 'error', channelType: 'discord', channelId, meta })
  }
}
