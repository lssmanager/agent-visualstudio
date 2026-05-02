/**
 * discord.adapter.audit.ts — F3a-26 (audit hooks separados)
 *
 * Exporta las funciones de auditoría del adapter Discord.
 * Separadas del adapter principal para no inflar el bundle en tests.
 */

import {
  AuditService,
  type ChannelErrorMeta,
  type ChannelMessageMeta,
  type ChannelProvisionedMeta,
} from '../../../api/src/modules/audit/audit.service';

const auditService = new AuditService();

/** Audita la conexión/reconexión exitosa del bot Discord. */
export function auditDiscordProvisioned(params: {
  channelId:   string;
  channelName: string;
  agentId:     string;
  workspaceId: string;
  guildId?:    string;
  userId?:     string;
}): void {
  const meta: ChannelProvisionedMeta = {
    channelType:    'discord',
    channelName:    params.channelName,
    agentId:        params.agentId,
    workspaceId:    params.workspaceId,
    configSnapshot: { guildId: params.guildId },
  };
  auditService.logChannelProvisioned({ channelId: params.channelId, userId: params.userId, meta });
}

/** Audita un mensaje inbound recibido de Discord. */
export function auditDiscordMessageInbound(params: {
  channelId:       string;
  messageId:       string;
  conversationId?: string;
}): void {
  const meta: ChannelMessageMeta = {
    channelType:    'discord',
    direction:      'inbound',
    messageId:      params.messageId,
    conversationId: params.conversationId,
  };
  auditService.logChannelMessage({ channelId: params.channelId, meta });
}

/** Audita un mensaje outbound enviado desde Discord. */
export function auditDiscordMessageOutbound(params: {
  channelId:       string;
  messageId:       string;
  agentId?:        string;
  conversationId?: string;
  tokensUsed?:     number;
  latencyMs?:      number;
}): void {
  const meta: ChannelMessageMeta = {
    channelType:    'discord',
    direction:      'outbound',
    messageId:      params.messageId,
    agentId:        params.agentId,
    conversationId: params.conversationId,
    tokensUsed:     params.tokensUsed,
    latencyMs:      params.latencyMs,
  };
  auditService.logChannelMessage({ channelId: params.channelId, meta });
}

/** Audita un error del cliente Discord. */
export function auditDiscordError(params: {
  channelId:    string;
  errorCode:    string;
  errorMessage: string;
  recoverable:  boolean;
  retryCount?:  number;
  stack?:       string;
}): void {
  const meta: ChannelErrorMeta = {
    channelType:  'discord',
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
