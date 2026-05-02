/**
 * Telegram Adapter — Audit hooks
 */
import {
  AuditService,
  ChannelErrorMeta,
  ChannelMessageMeta,
  ChannelProvisionedMeta,
} from '../../../api/src/modules/audit/audit.service';

const auditService = new AuditService();

export function auditTelegramProvisioned(params: {
  channelId:   string;
  channelName: string;
  agentId:     string;
  workspaceId: string;
  userId?:     string;
}): void {
  const meta: ChannelProvisionedMeta = {
    channelType: 'telegram',
    channelName: params.channelName,
    agentId:     params.agentId,
    workspaceId: params.workspaceId,
  };
  auditService.logChannelProvisioned({
    channelId: params.channelId,
    userId:    params.userId,
    meta,
  });
}

export function auditTelegramMessageInbound(params: {
  channelId:      string;
  messageId:      string;
  conversationId?: string;
}): void {
  const meta: ChannelMessageMeta = {
    channelType:    'telegram',
    direction:      'inbound',
    messageId:      params.messageId,
    conversationId: params.conversationId,
  };
  auditService.logChannelMessage({ channelId: params.channelId, meta });
}

export function auditTelegramMessageOutbound(params: {
  channelId:      string;
  messageId:      string;
  agentId?:       string;
  tokensUsed?:    number;
  latencyMs?:     number;
}): void {
  const meta: ChannelMessageMeta = {
    channelType: 'telegram',
    direction:   'outbound',
    messageId:   params.messageId,
    agentId:     params.agentId,
    tokensUsed:  params.tokensUsed,
    latencyMs:   params.latencyMs,
  };
  auditService.logChannelMessage({ channelId: params.channelId, meta });
}

export function auditTelegramError(params: {
  channelId:    string;
  errorCode:    string;
  errorMessage: string;
  recoverable:  boolean;
  retryCount?:  number;
  stack?:       string;
}): void {
  const meta: ChannelErrorMeta = {
    channelType:  'telegram',
    errorCode:    params.errorCode,
    errorMessage: params.errorMessage,
    recoverable:  params.recoverable,
    attemptCount: params.retryCount,
    stackTrace:   params.stack
      ? params.stack.split('\n').slice(0, 4).join('\n')
      : undefined,
  };
  auditService.logChannelError({
    channelId: params.channelId,
    severity:  params.recoverable ? 'warn' : 'error',
    meta,
  });
}
