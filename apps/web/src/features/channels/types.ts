/**
 * features/channels/types.ts
 * Tipos TypeScript para el feature de gestión de canales.
 * Refleja el schema Prisma ChannelConfig + ChannelBinding del gateway.
 */

export type ChannelType =
  | 'webchat'
  | 'telegram'
  | 'whatsapp'
  | 'slack'
  | 'discord'
  | 'teams'
  | 'webhook';

export interface ChannelBinding {
  id:              string;
  channelConfigId: string;
  agentId:         string;
  scopeLevel:      string;
  scopeId:         string;
  isDefault:       boolean;
  createdAt:       string;
  agent?: {
    id:   string;
    name: string;
    slug: string;
  };
}

export interface ChannelConfig {
  id:         string;
  type:       ChannelType;
  name:       string;
  config:     Record<string, unknown>;
  hasSecrets: boolean; // secretsEncrypted presente (nunca expuesto)
  isActive:   boolean;
  createdAt:  string;
  updatedAt:  string;
  bindings?:  ChannelBinding[];
}

// Payloads

export interface CreateChannelPayload {
  type:        ChannelType;
  name:        string;
  agentId:     string;
  config?:     Record<string, unknown>;
  secrets?:    Record<string, unknown>;
  scopeLevel?: string;
  scopeId?:    string;
  isDefault?:  boolean;
}

export interface AddBindingPayload {
  agentId:     string;
  scopeLevel?: string;
  scopeId?:    string;
  isDefault?:  boolean;
}

/** Payload para PATCH de un canal existente */
export interface PatchChannelPayload {
  name?:    string;
  config?:  Record<string, unknown>;
  secrets?: Record<string, unknown>; // nunca se devuelven, solo se envían
}

/** Resultado de un test de conexión */
export interface ChannelTestResult {
  ok:      boolean;
  latency: number; // ms
  message: string;
}

/** Campos de configuración pública por tipo (no secrets) */
export interface ChannelConfigFields {
  telegram: {
    webhookMode:    'polling' | 'webhook';
    allowedUserIds: string[];
    parseMode:      'HTML' | 'Markdown' | 'MarkdownV2';
  };
  whatsapp: {
    phoneId:             string;
    verifyToken:         string;
    apiVersion:          string;
    allowedPhoneNumbers: string[];
  };
  discord: {
    applicationId:  string;
    guildId?:       string;
    commandPrefix?: string;
  };
  teams: {
    tenantId:        string;
    appId:           string;
    serviceMode:     'bot_framework' | 'incoming_webhook';
    webhookUrl?:     string;
    welcomeMessage?: string;
  };
}

// Respuestas del API

export interface ChannelListResponse {
  ok:   boolean;
  data: ChannelConfig[];
}

export interface ChannelDetailResponse {
  ok:   boolean;
  data: ChannelConfig;
}
