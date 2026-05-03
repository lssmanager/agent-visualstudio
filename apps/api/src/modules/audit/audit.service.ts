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

// ── Run action enum ────────────────────────────────────────────────────────────
export const RUN_AUDIT_ACTIONS = {
  STARTED:   'run.started',
  COMPLETED: 'run.completed',
  FAILED:    'run.failed',
} as const;

export type RunAuditAction =
  (typeof RUN_AUDIT_ACTIONS)[keyof typeof RUN_AUDIT_ACTIONS];

// ── Agent action enum ──────────────────────────────────────────────────────────
export const AGENT_AUDIT_ACTIONS = {
  CREATED:   'agent.created',
  UPDATED:   'agent.updated',
  DELETED:   'agent.deleted',
} as const;

export type AgentAuditAction =
  (typeof AGENT_AUDIT_ACTIONS)[keyof typeof AGENT_AUDIT_ACTIONS];

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

// ── Run metadata ──────────────────────────────────────────────────────────────
export interface RunStartedMeta {
  runId:           string;
  agentId:         string;
  workspaceId:     string;
  triggeredBy:     'user' | 'schedule' | 'webhook' | 'api' | 'chain';
  channelType?:    string;
  conversationId?: string;
  inputTokens?:    number;
}

export interface RunCompletedMeta {
  runId:          string;
  agentId:        string;
  workspaceId:    string;
  status:         'success' | 'error' | 'cancelled' | 'timeout';
  durationMs:     number;
  totalTokens?:   number;
  outputTokens?:  number;
  stepCount?:     number;
  errorCode?:     string;
  errorMessage?:  string;
}

// ── Agent metadata ─────────────────────────────────────────────────────────────
export interface AgentCreatedMeta {
  agentId:      string;
  agentName:    string;
  workspaceId:  string;
  scopeLevel:   string;
  parentId?:    string;
  templateId?:  string;
  createdBy:    string;
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

/** Recursively redact sensitive keys from a metadata object, including inside arrays. */
export function sanitizeAuditMeta(
  meta: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(meta)) {
    if (REDACTED_KEYS.has(key)) {
      result[key] = '[REDACTED]';
    } else if (Array.isArray(val)) {
      result[key] = val.map((item) =>
        typeof item === 'object' && item !== null
          ? sanitizeAuditMeta(item as Record<string, unknown>)
          : item,
      );
    } else if (typeof val === 'object' && val !== null) {
      result[key] = sanitizeAuditMeta(val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Truncate and strip common secret patterns from a free-text error message
 * before persisting it in the audit detail string.
 *
 * Patterns covered:
 *   - OpenAI keys:  sk-<20+ alphanum>
 *   - Bearer tokens: Bearer <10+ non-whitespace chars>
 *   - GitHub PATs:  ghp_<30+ alphanum>
 * Result is capped at 200 characters.
 */
function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED]')
    .replace(/Bearer\s+\S{10,}/gi,   '[REDACTED]')
    .replace(/ghp_[a-zA-Z0-9]{30,}/g, '[REDACTED]')
    .substring(0, 200);
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

  /** Query audit entries from the main log with optional filters. */
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

  /** Log channel.provisioned — non-blocking. */
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

  /** Log channel.error — non-blocking. Severity escalates based on recoverability. */
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

  // ── High-level run event helpers ──────────────────────────────────────────────

  /**
   * Log run.started — non-blocking.
   * Llamar al iniciar la ejecución de un agente, antes del primer LLM call.
   */
  logRunStarted(params: {
    runId:    string;
    userId?:  string;
    meta:     RunStartedMeta;
  }): void {
    this.logAsync({
      resource:   'run',
      resourceId: params.runId,
      action:     RUN_AUDIT_ACTIONS.STARTED,
      detail:     `Run ${params.runId} iniciado — agente: ${params.meta.agentId} ` +
                  `(trigger: ${params.meta.triggeredBy})`,
      userId:     params.userId,
      severity:   'info',
      metadata:   sanitizeAuditMeta(params.meta as unknown as Record<string, unknown>),
    });
  }

  /**
   * Log run.completed — non-blocking.
   * Llamar al finalizar la ejecución (éxito, error o cancelación).
   * El status 'error' eleva severity a 'warn'; 'timeout' a 'error'.
   * errorMessage es truncado y sanitizado antes de persistirse en detail.
   */
  logRunCompleted(params: {
    runId:    string;
    userId?:  string;
    meta:     RunCompletedMeta;
  }): void {
    const severityMap: Record<RunCompletedMeta['status'], AuditSeverity> = {
      success:   'info',
      error:     'warn',
      cancelled: 'info',
      timeout:   'error',
    };

    const safeErrorMessage = params.meta.errorMessage
      ? sanitizeErrorMessage(params.meta.errorMessage)
      : undefined;

    const detail = params.meta.status === 'success'
      ? `Run ${params.runId} completado en ${params.meta.durationMs}ms` +
        (params.meta.totalTokens != null ? ` — ${params.meta.totalTokens} tokens` : '')
      : `Run ${params.runId} terminó con status "${params.meta.status}"` +
        (params.meta.errorCode    ? ` [${params.meta.errorCode}]`  : '') +
        (safeErrorMessage         ? `: ${safeErrorMessage}`         : '');

    this.logAsync({
      resource:   'run',
      resourceId: params.runId,
      action:     RUN_AUDIT_ACTIONS.COMPLETED,
      detail,
      userId:     params.userId,
      severity:   severityMap[params.meta.status],
      metadata:   sanitizeAuditMeta(params.meta as unknown as Record<string, unknown>),
    });
  }

  // ── High-level agent event helpers ────────────────────────────────────────────

  /**
   * Log agent.created — SÍNCRONO (low-frequency, necesita confirmación).
   * Llamar justo después de que el agente sea persistido en Prisma.
   */
  logAgentCreated(params: {
    agentId:  string;
    userId?:  string;
    meta:     AgentCreatedMeta;
  }): AuditEntry {
    return this.log({
      resource:   'agent',
      resourceId: params.agentId,
      action:     AGENT_AUDIT_ACTIONS.CREATED,
      detail:     `Agente "${params.meta.agentName}" creado en workspace ` +
                  `${params.meta.workspaceId} (scope: ${params.meta.scopeLevel})` +
                  (params.meta.parentId ? ` — padre: ${params.meta.parentId}` : ''),
      userId:     params.userId ?? params.meta.createdBy,
      severity:   'info',
      metadata:   sanitizeAuditMeta(params.meta as unknown as Record<string, unknown>),
    });
  }
}
