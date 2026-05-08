/**
 * audit/audit.service.ts - wrapper local de AuditService
 * Resuelve TS6059: los *.adapter.audit.ts importaban desde apps/api cruzando rootDir.
 */

export interface AuditEventPayload {
  action:      string
  channelType: string
  channelId:   string
  userId?:     string
  meta?:       Record<string, unknown>
}

export class AuditService {
  async log(payload: AuditEventPayload): Promise<void> {
    console.info('[AuditService]', JSON.stringify(payload))
  }
}
