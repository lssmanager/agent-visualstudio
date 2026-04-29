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

// Respuestas del API

export interface ChannelListResponse {
  ok:   boolean;
  data: ChannelConfig[];
}

export interface ChannelDetailResponse {
  ok:   boolean;
  data: ChannelConfig;
}
