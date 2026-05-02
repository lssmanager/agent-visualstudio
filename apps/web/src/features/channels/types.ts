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

// ── SSE — Estado de canal en tiempo real ─────────────────────────────────────

/** Payload del evento SSE "channel:status" */
export interface ChannelStatusEvent {
  channelId:      string;
  connected:      boolean;           // el canal tiene conexión activa con el proveedor
  latencyMs:      number | null;     // null si no hay ping reciente
  messagesPerMin: number;            // ventana de 60s
  lastError:      string | null;     // último mensaje de error o null
  lastErrorAt:    string | null;     // ISO timestamp del último error
  sessionState?:  WhatsAppSessionState; // solo para tipo 'whatsapp' con authMode='qr'
  updatedAt:      string;            // ISO timestamp del evento
}

/** Estado de sesión WhatsApp QR */
export interface WhatsAppSessionState {
  status:      'waiting_qr' | 'qr_ready' | 'connected' | 'disconnected' | 'expired';
  qrDataUrl:   string | null;     // data:image/png;base64,... o null
  qrExpiresAt: string | null;     // ISO timestamp de expiración del QR
  phone?:      string;            // número vinculado (cuando status='connected')
}

/** Evento SSE "channel:error" */
export interface ChannelErrorEvent {
  channelId:   string;
  code:        string;
  message:     string;
  recoverable: boolean;
  timestamp:   string;
}

/** Estado consolidado que maneja useChannelStatus */
export interface ChannelLiveStatus {
  // Estado de la conexión SSE
  sseState:   'connecting' | 'connected' | 'reconnecting' | 'error' | 'closed';
  sseError:   string | null;

  // Datos del canal (actualizados por eventos SSE)
  channelStatus: ChannelStatusEvent | null;

  // Reconexión
  reconnectIn:  number | null;   // segundos hasta el próximo intento (null si no reconectando)
  attemptCount: number;
}
