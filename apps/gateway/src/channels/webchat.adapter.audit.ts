import { AuditService } from '../audit/audit.service'

export class WebChatAdapterAudit {
  constructor(private readonly audit: AuditService) {}

  async messageReceived(channelId: string, userId: string, meta?: Record<string, unknown>): Promise<void> {
    await this.audit.log({ action: 'message.received', channelType: 'webchat', channelId, userId, meta })
  }

  async messageSent(channelId: string, meta?: Record<string, unknown>): Promise<void> {
    await this.audit.log({ action: 'message.sent', channelType: 'webchat', channelId, meta })
  }

  async error(channelId: string, meta?: Record<string, unknown>): Promise<void> {
    await this.audit.log({ action: 'error', channelType: 'webchat', channelId, meta })
  }
}
