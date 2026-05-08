import { AuditService } from '../audit/audit.service'

export class TelegramAdapterAudit {
  constructor(private readonly audit: AuditService) {}

  async messageReceived(channelId: string, userId: string, meta?: Record<string, unknown>): Promise<void> {
    await this.audit.log({ action: 'message.received', channelType: 'telegram', channelId, userId, meta })
  }

  async messageSent(channelId: string, meta?: Record<string, unknown>): Promise<void> {
    await this.audit.log({ action: 'message.sent', channelType: 'telegram', channelId, meta })
  }

  async error(channelId: string, meta?: Record<string, unknown>): Promise<void> {
    await this.audit.log({ action: 'error', channelType: 'telegram', channelId, meta })
  }
}
