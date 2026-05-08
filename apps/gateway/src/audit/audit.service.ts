/**
 * audit/audit.service.ts — stub local de AuditService para apps/gateway
 *
 * Resuelve TS6059: los *.adapter.audit.ts importaban desde apps/api cruzando rootDir.
 * Este módulo es self-contained dentro de src/ y no depende de ningún paquete externo.
 *
 * Contrato: firma log() compatible con todos los *.adapter.audit.ts del gateway.
 * Cuando se implemente @lss/audit, reemplazar este stub por:
 *   export { AuditService, AuditEventPayload } from '@lss/audit';
 */

export interface AuditEventPayload {
  action:      string;
  channelType: string;
  channelId:   string;
  userId?:     string;
  meta?:       Record<string, unknown>;
}

export class AuditService {
  async log(payload: AuditEventPayload): Promise<void> {
    // TODO: reemplazar por escritura real a base de datos cuando se implemente @lss/audit
    console.info('[AuditService]', JSON.stringify(payload));
  }
}
