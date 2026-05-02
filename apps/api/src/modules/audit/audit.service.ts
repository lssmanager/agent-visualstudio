import fs from 'node:fs';
import path from 'node:path';

import { studioConfig } from '../../config';

// ── Severity ──────────────────────────────────────────────────────────────────
export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical';

// ── Canonical channel action enum ─────────────────────────────────────────────
export const CHANNEL_AUDIT_ACTIONS = {
  PROVISIONED: 'channel.provisioned',
  MESSAGE:     'channel.message',
  ERROR:       'channel.error',
} as const;

export type ChannelAuditAction =
  (typeof CHANNEL_AUDIT_ACTIONS)[keyof typeof CHANNEL_AUDIT_ACTIONS];

// ── Typed metadata per event ──────────────────────────────────────────────────
export interface ChannelProvisionedMeta {
  channelType:      string;
  channelName:      string;
  agentId:          string;
  workspaceId:      string;
  configSnapshot?:  Record<string, unknown>;
}

export interface ChannelMessageMeta {
  channelType:      string;
  direction:        'inbound' | 'outbound';
  messageId:        string;
  agentId?:         string;
  conversationId?:  string;
  tokensUsed?:      number;
  latencyMs?:       number;
  contentHash?:     string;
}

export interface ChannelErrorMeta {
  channelType:   string;
  errorCode:     string;
  errorMessage:  string;
  recoverable:   boolean;
  stackTrace?:   string;
  attemptCount?: number;
}

// ── AuditEntry (backward-compatible: severity is optional) ────────────────────
export interface AuditEntry {
  id:         string;
  timestamp:  string;
  resource:   string;
  resourceId?: string;
  action:     string;
  detail:     string;
  userId?:    string;
  metadata?:  Record<string, unknown>;
  severity?:  AuditSeverity;
}

// ── File paths ────────────────────────────────────────────────────────────────
const AUDIT_FILE = () =>
  path.join(studioConfig.workspaceRoot, '.openclaw-studio', 'audit.log.json');

const CHANNEL_MSG_FILE = () =>
  path.join(studioConfig.workspaceRoot, '.openclaw-studio', 'audit.channel-messages.ndjson');

const MAX_MSG_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// ── Sanitizer ─────────────────────────────────────────────────────────────────
const REDACTED_KEYS = new Set([
  'token', 'secret', 'password', 'apiKey', 'api_key',
  'botToken', 'bot_token', 'accessToken', 'access_token',
  'webhookSecret', 'webhook_secret', 'authToken', 'auth_token',
  'privateKey', 'private_key', 'credential', 'credentials',
]);

function sanitizeAuditMeta(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(meta)) {
    if (REDACTED_KEYS.has(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      result[key] = sanitizeAuditMeta(val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ── AuditService ──────────────────────────────────────────────────────────────
export class AuditService {
  private readLog(): AuditEntry[] {
    const file = AUDIT_FILE();
    if (!fs.existsSync(file)) return [];
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as AuditEntry[];
    } catch {
      return [];
    }
  }

  private writeLog(entries: AuditEntry[]): void {
    const file = AUDIT_FILE();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(entries, null, 2), 'utf-8');
  }

  /** Synchronous log — for low-frequency events (agent.created, config.updated, etc.) */
  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const full: AuditEntry = {
      id:        `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    const entries = this.readLog();
    entries.push(full);
    if (entries.length > 1000) entries.splice(0, entries.length - 1000);
    this.writeLog(entries);
    return full;
  }

  /**
   * Non-blocking log via setImmediate.
   * channel.message → NDJSON file (append-only, no full parse).
   * channel.provisioned / channel.error → main JSON log.
   */
  logAsync(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    const full: AuditEntry = {
      id:        `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    setImmediate(() => {
      try {
        if (full.action === CHANNEL_AUDIT_ACTIONS.MESSAGE) {
          const file = CHANNEL_MSG_FILE();
          const dir  = path.dirname(file);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          // Rotate if file exceeds 10 MB
          try {
            const stat = fs.existsSync(file) ? fs.statSync(file) : null;
            if (stat && stat.size > MAX_MSG_FILE_BYTES) {
              const rotated = file.replace('.ndjson', `.${Date.now()}.ndjson`);
              fs.renameSync(file, rotated);
            }
          } catch { /* rotation failure must not crash audit */ }
          fs.appendFileSync(file, JSON.stringify(full) + '\n', 'utf-8');
        } else {
          const entries = this.readLog();
          entries.push(full);
          if (entries.length > 1000) entries.splice(0, entries.length - 1000);
          this.writeLog(entries);
        }
      } catch (err) {
        console.error('[AuditService] Error writing async log:', err);
      }
    });
  }

  query(filters: {
    resource?:  string;
    action?:    string;
    from?:      string;
    to?:        string;
  }): AuditEntry[] {
    let entries = this.readLog();
    if (filters.resource) entries = entries.filter((e) => e.resource === filters.resource);
    if (filters.action)   entries = entries.filter((e) => e.action   === filters.action);
    if (filters.from) {
      const fromDate = new Date(filters.from).getTime();
      entries = entries.filter((e) => new Date(e.timestamp).getTime() >= fromDate);
    }
    if (filters.to) {
      const toDate = new Date(filters.to).getTime();
      entries = entries.filter((e) => new Date(e.timestamp).getTime() <= toDate);
    }
    return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /** Query from NDJSON tail — efficient for high-volume channel messages */
  queryChannelMessages(filters: {
    channelId?:  string;
    direction?:  'inbound' | 'outbound';
    from?:       string;
    to?:         string;
    limit?:      number;
  }): AuditEntry[] {
    const file   = CHANNEL_MSG_FILE();
    if (!fs.existsSync(file)) return [];
    const lines  = fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
    const limit  = filters.limit ?? 500;
    const results: AuditEntry[] = [];
    for (let i = lines.length - 1; i >= 0 && results.length < limit; i--) {
      try {
        const entry = JSON.parse(lines[i]) as AuditEntry;
        if (filters.channelId && entry.resourceId !== filters.channelId) continue;
        if (filters.direction) {
          const meta = entry.metadata as ChannelMessageMeta | undefined;
          if (meta?.direction !== filters.direction) continue;
        }
        if (filters.from) {
          if (new Date(entry.timestamp).getTime() < new Date(filters.from).getTime()) continue;
        }
        if (filters.to) {
          if (new Date(entry.timestamp).getTime() > new Date(filters.to).getTime()) continue;
        }
        results.push(entry);
      } catch { /* malformed line — skip */ }
    }
    return results;
  }

  // ── High-level channel event helpers ─────────────────────────────────────────

  logChannelProvisioned(params: {
    channelId:  string;
    userId?:    string;
    meta:       ChannelProvisionedMeta;
  }): void {
    this.logAsync({
      resource:   'channel',
      resourceId: params.channelId,
      action:     CHANNEL_AUDIT_ACTIONS.PROVISIONED,
      detail:     `Canal ${params.meta.channelType} "${params.meta.channelName}" provisionado — agente: ${params.meta.agentId}`,
      userId:     params.userId,
      severity:   'info',
      metadata:   sanitizeAuditMeta(params.meta as unknown as Record<string, unknown>),
    });
  }

  /**
   * Log a channel message event.
   * IMPORTANT: Never pass message content — only contentHash if traceability is needed.
   */
  logChannelMessage(params: {
    channelId:  string;
    userId?:    string;
    meta:       ChannelMessageMeta;
  }): void {
    const dir = params.meta.direction === 'inbound' ? '←' : '→';
    this.logAsync({
      resource:   'channel',
      resourceId: params.channelId,
      action:     CHANNEL_AUDIT_ACTIONS.MESSAGE,
      detail:     `${dir} ${params.meta.channelType} msg ${params.meta.messageId}` +
                  (params.meta.latencyMs != null ? ` (${params.meta.latencyMs}ms)` : ''),
      userId:     params.userId,
      severity:   'info',
      metadata:   sanitizeAuditMeta(params.meta as unknown as Record<string, unknown>),
    });
  }

  logChannelError(params: {
    channelId:  string;
    userId?:    string;
    severity?:  AuditSeverity;
    meta:       ChannelErrorMeta;
  }): void {
    this.logAsync({
      resource:   'channel',
      resourceId: params.channelId,
      action:     CHANNEL_AUDIT_ACTIONS.ERROR,
      detail:     `[${params.meta.errorCode}] ${params.meta.errorMessage}` +
                  (params.meta.recoverable ? ' (recuperable)' : ' (fatal)'),
      userId:     params.userId,
      severity:   params.severity ?? (params.meta.recoverable ? 'warn' : 'error'),
      metadata:   sanitizeAuditMeta(params.meta as unknown as Record<string, unknown>),
    });
  }
}
