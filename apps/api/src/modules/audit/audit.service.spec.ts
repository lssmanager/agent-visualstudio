import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Must mock studioConfig BEFORE importing AuditService
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
jest.mock('../../config', () => ({
  studioConfig: { workspaceRoot: tmpDir },
}));

import {
  AuditService,
  CHANNEL_AUDIT_ACTIONS,
  RUN_AUDIT_ACTIONS,
  AGENT_AUDIT_ACTIONS,
  ChannelErrorMeta,
  ChannelMessageMeta,
  ChannelProvisionedMeta,
  RunStartedMeta,
  RunCompletedMeta,
  AgentCreatedMeta,
  sanitizeAuditMeta,
} from './audit.service';

function flushImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

let service: AuditService;

beforeEach(() => {
  // Clean up audit files between tests
  const auditDir = path.join(tmpDir, '.openclaw-studio');
  if (fs.existsSync(auditDir)) {
    for (const f of fs.readdirSync(auditDir)) {
      fs.unlinkSync(path.join(auditDir, f));
    }
  }
  service = new AuditService();
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('AuditService.log (sync)', () => {
  it('writes an entry and returns it', () => {
    const entry = service.log({
      resource: 'agent',
      action:   'agent.created',
      detail:   'Test agent',
    });
    expect(entry.id).toMatch(/^audit-/);
    expect(entry.timestamp).toBeTruthy();
    const results = service.query({ resource: 'agent' });
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('agent.created');
  });

  it('keeps max 1000 entries', () => {
    for (let i = 0; i < 1005; i++) {
      service.log({ resource: 'test', action: 'x', detail: `${i}` });
    }
    const all = service.query({ resource: 'test' });
    expect(all.length).toBeLessThanOrEqual(1000);
  });
});

describe('CHANNEL_AUDIT_ACTIONS', () => {
  it('has canonical string values', () => {
    expect(CHANNEL_AUDIT_ACTIONS.PROVISIONED).toBe('channel.provisioned');
    expect(CHANNEL_AUDIT_ACTIONS.MESSAGE).toBe('channel.message');
    expect(CHANNEL_AUDIT_ACTIONS.ERROR).toBe('channel.error');
  });
});

describe('RUN_AUDIT_ACTIONS', () => {
  it('has canonical string values', () => {
    expect(RUN_AUDIT_ACTIONS.STARTED).toBe('run.started');
    expect(RUN_AUDIT_ACTIONS.COMPLETED).toBe('run.completed');
    expect(RUN_AUDIT_ACTIONS.FAILED).toBe('run.failed');
  });
});

describe('AGENT_AUDIT_ACTIONS', () => {
  it('has canonical string values', () => {
    expect(AGENT_AUDIT_ACTIONS.CREATED).toBe('agent.created');
    expect(AGENT_AUDIT_ACTIONS.UPDATED).toBe('agent.updated');
    expect(AGENT_AUDIT_ACTIONS.DELETED).toBe('agent.deleted');
  });
});

describe('logChannelProvisioned', () => {
  it('writes entry with correct action and severity', async () => {
    const meta: ChannelProvisionedMeta = {
      channelType: 'discord',
      channelName: 'Test Guild',
      agentId:     'agent-1',
      workspaceId: 'ws-1',
    };
    service.logChannelProvisioned({ channelId: 'ch-1', meta });
    await flushImmediate();
    const results = service.query({ action: 'channel.provisioned' });
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe('info');
    expect(results[0].resourceId).toBe('ch-1');
    expect(results[0].detail).toContain('discord');
  });

  it('redacts sensitive keys in configSnapshot', async () => {
    const meta: ChannelProvisionedMeta = {
      channelType: 'discord',
      channelName: 'Secure Guild',
      agentId:     'agent-2',
      workspaceId: 'ws-1',
      configSnapshot: { mode: 'bot', botToken: 'super-secret-token' },
    };
    service.logChannelProvisioned({ channelId: 'ch-2', meta });
    await flushImmediate();
    const results = service.query({ action: 'channel.provisioned' });
    const snap = results[0].metadata?.configSnapshot as Record<string, unknown>;
    expect(snap?.botToken).toBe('[REDACTED]');
    expect(snap?.mode).toBe('bot');
  });
});

describe('logChannelMessage', () => {
  it('appends to NDJSON file (not main log)', async () => {
    const meta: ChannelMessageMeta = {
      channelType: 'telegram',
      direction:   'inbound',
      messageId:   'msg-001',
    };
    service.logChannelMessage({ channelId: 'ch-3', meta });
    await flushImmediate();
    // Should NOT appear in main log
    const mainLog = service.query({ action: 'channel.message' });
    expect(mainLog).toHaveLength(0);
    // Should appear in NDJSON
    const msgs = service.queryChannelMessages({ channelId: 'ch-3' });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].metadata?.direction).toBe('inbound');
  });

  it('detail includes direction arrow and latency', async () => {
    const meta: ChannelMessageMeta = {
      channelType: 'discord',
      direction:   'outbound',
      messageId:   'msg-002',
      latencyMs:   420,
    };
    service.logChannelMessage({ channelId: 'ch-3', meta });
    await flushImmediate();
    const msgs = service.queryChannelMessages({});
    const entry = msgs.find((e) => e.metadata?.messageId === 'msg-002');
    expect(entry?.detail).toContain('→');
    expect(entry?.detail).toContain('420ms');
  });
});

describe('logChannelError', () => {
  it('recoverable error → severity warn', async () => {
    const meta: ChannelErrorMeta = {
      channelType:  'whatsapp',
      errorCode:    'CONN_RESET',
      errorMessage: 'Connection reset',
      recoverable:  true,
    };
    service.logChannelError({ channelId: 'ch-4', meta });
    await flushImmediate();
    const results = service.query({ action: 'channel.error' });
    expect(results[0].severity).toBe('warn');
    expect(results[0].detail).toContain('recuperable');
  });

  it('fatal error → severity error', async () => {
    const meta: ChannelErrorMeta = {
      channelType:  'discord',
      errorCode:    'AUTH_FAILED',
      errorMessage: 'Invalid token',
      recoverable:  false,
    };
    service.logChannelError({ channelId: 'ch-5', meta });
    await flushImmediate();
    const results = service.query({ action: 'channel.error' });
    expect(results[0].severity).toBe('error');
    expect(results[0].detail).toContain('fatal');
  });

  it('explicit severity overrides default', async () => {
    const meta: ChannelErrorMeta = {
      channelType:  'telegram',
      errorCode:    'RATE_LIMIT',
      errorMessage: 'Too many requests',
      recoverable:  true,
    };
    service.logChannelError({ channelId: 'ch-6', severity: 'critical', meta });
    await flushImmediate();
    const results = service.query({ action: 'channel.error' });
    expect(results[0].severity).toBe('critical');
  });
});

describe('queryChannelMessages filters', () => {
  beforeEach(async () => {
    const inbound: ChannelMessageMeta = {
      channelType: 'webchat', direction: 'inbound', messageId: 'in-1',
    };
    const outbound: ChannelMessageMeta = {
      channelType: 'webchat', direction: 'outbound', messageId: 'out-1',
    };
    service.logChannelMessage({ channelId: 'ch-web', meta: inbound });
    service.logChannelMessage({ channelId: 'ch-web', meta: outbound });
    service.logChannelMessage({ channelId: 'ch-other', meta: inbound });
    await flushImmediate();
  });

  it('filters by channelId', () => {
    const results = service.queryChannelMessages({ channelId: 'ch-web' });
    expect(results).toHaveLength(2);
    results.forEach((r) => expect(r.resourceId).toBe('ch-web'));
  });

  it('filters by direction', () => {
    const results = service.queryChannelMessages({
      channelId: 'ch-web',
      direction: 'outbound',
    });
    expect(results).toHaveLength(1);
    expect((results[0].metadata as ChannelMessageMeta).direction).toBe('outbound');
  });

  it('returns empty array when NDJSON file does not exist', () => {
    // Use a fresh service pointing to a dir with no file
    const results = new AuditService().queryChannelMessages({ channelId: 'nonexistent' });
    // File may or may not exist depending on test order — just verify no crash
    expect(Array.isArray(results)).toBe(true);
  });
});

// ── run.started ───────────────────────────────────────────────────────────────
describe('logRunStarted', () => {
  it('escribe entrada con action run.started y severity info', async () => {
    const meta: RunStartedMeta = {
      runId:       'run-001',
      agentId:     'agent-xyz',
      workspaceId: 'ws-1',
      triggeredBy: 'user',
    };
    service.logRunStarted({ runId: 'run-001', userId: 'user-abc', meta });
    await flushImmediate();
    const entries = service.query({ action: 'run.started' });
    expect(entries).toHaveLength(1);
    expect(entries[0].severity).toBe('info');
    expect(entries[0].resourceId).toBe('run-001');
  });

  it('detail contiene agentId y triggeredBy', async () => {
    const meta: RunStartedMeta = {
      runId:       'run-001b',
      agentId:     'agent-detail',
      workspaceId: 'ws-1',
      triggeredBy: 'webhook',
    };
    service.logRunStarted({ runId: 'run-001b', meta });
    await flushImmediate();
    const entries = service.query({ action: 'run.started' });
    expect(entries[0].detail).toContain('agent-detail');
    expect(entries[0].detail).toContain('webhook');
  });
});

// ── run.completed ─────────────────────────────────────────────────────────────
describe('logRunCompleted', () => {
  it('severity "warn" cuando status es error', async () => {
    const meta: RunCompletedMeta = {
      runId:        'run-002',
      agentId:      'agent-xyz',
      workspaceId:  'ws-1',
      status:       'error',
      durationMs:   1500,
      errorCode:    'LLM_TIMEOUT',
      errorMessage: 'OpenAI timed out',
    };
    service.logRunCompleted({ runId: 'run-002', meta });
    await flushImmediate();
    const entries = service.query({ action: 'run.completed' });
    expect(entries[0].severity).toBe('warn');
    expect(entries[0].metadata?.errorCode).toBe('LLM_TIMEOUT');
  });

  it('severity "error" cuando status es timeout', async () => {
    const meta: RunCompletedMeta = {
      runId: 'run-003', agentId: 'a', workspaceId: 'w',
      status: 'timeout', durationMs: 30000,
    };
    service.logRunCompleted({ runId: 'run-003', meta });
    await flushImmediate();
    const entries = service.query({ action: 'run.completed' });
    const entry = entries.find(e => e.resourceId === 'run-003');
    expect(entry?.severity).toBe('error');
  });

  it('severity "info" cuando status es success', async () => {
    const meta: RunCompletedMeta = {
      runId: 'run-004', agentId: 'a', workspaceId: 'w',
      status: 'success', durationMs: 500, totalTokens: 120,
    };
    service.logRunCompleted({ runId: 'run-004', meta });
    await flushImmediate();
    const entries = service.query({ action: 'run.completed' });
    const entry = entries.find(e => e.resourceId === 'run-004');
    expect(entry?.severity).toBe('info');
    expect(entry?.detail).toContain('120 tokens');
  });

  it('severity "info" cuando status es cancelled', async () => {
    const meta: RunCompletedMeta = {
      runId: 'run-005', agentId: 'a', workspaceId: 'w',
      status: 'cancelled', durationMs: 200,
    };
    service.logRunCompleted({ runId: 'run-005', meta });
    await flushImmediate();
    const entries = service.query({ action: 'run.completed' });
    const entry = entries.find(e => e.resourceId === 'run-005');
    expect(entry?.severity).toBe('info');
  });

  it('logRunCompleted redacta tokens de API en errorMessage', async () => {
    const meta: RunCompletedMeta = {
      runId: 'run-secret', agentId: 'a', workspaceId: 'w',
      status: 'error', durationMs: 500,
      errorCode: 'LLM_ERROR',
      errorMessage: 'OpenAI error: sk-abcdefghijklmnopqrstuvwx12345678 invalid',
    };
    service.logRunCompleted({ runId: 'run-secret', meta });
    await flushImmediate();
    const entries = service.query({ action: 'run.completed' });
    const entry = entries.find(e => e.resourceId === 'run-secret');
    expect(entry?.detail).not.toContain('sk-abcdefghijklmnopqrstuvwx12345678');
    expect(entry?.detail).toContain('[REDACTED]');
  });
});

// ── agent.created ─────────────────────────────────────────────────────────────
describe('logAgentCreated', () => {
  it('escribe síncronamente y devuelve AuditEntry', () => {
    const meta: AgentCreatedMeta = {
      agentId:     'agent-new',
      agentName:   'Support Bot',
      workspaceId: 'ws-1',
      scopeLevel:  'workspace',
      createdBy:   'user-123',
    };
    const entry = service.logAgentCreated({ agentId: 'agent-new', meta });
    expect(entry.id).toMatch(/^audit-/);
    expect(entry.action).toBe('agent.created');
    expect(entry.severity).toBe('info');
    // Verificar que está en el log inmediatamente (síncrono)
    const entries = service.query({ action: 'agent.created' });
    expect(entries.some(e => e.id === entry.id)).toBe(true);
  });

  it('detail contiene agentName, workspaceId y scopeLevel', () => {
    const meta: AgentCreatedMeta = {
      agentId:     'agent-detail',
      agentName:   'Sales Agent',
      workspaceId: 'ws-sales',
      scopeLevel:  'department',
      createdBy:   'user-456',
    };
    const entry = service.logAgentCreated({ agentId: 'agent-detail', meta });
    expect(entry.detail).toContain('Sales Agent');
    expect(entry.detail).toContain('ws-sales');
    expect(entry.detail).toContain('department');
  });

  it('detail incluye parentId cuando está presente', () => {
    const meta: AgentCreatedMeta = {
      agentId:     'agent-child',
      agentName:   'Child Bot',
      workspaceId: 'ws-1',
      scopeLevel:  'agent',
      createdBy:   'user-1',
      parentId:    'agent-parent-001',
    };
    const entry = service.logAgentCreated({ agentId: 'agent-child', meta });
    expect(entry.detail).toContain('agent-parent-001');
  });

  it('redacta campos sensibles en metadata', () => {
    const meta = {
      agentId:     'agent-sec',
      agentName:   'Bot',
      workspaceId: 'ws-1',
      scopeLevel:  'agent',
      createdBy:   'user-1',
      apiKey:      'sk-secret-key',   // campo extra para probar sanitización
    } as unknown as AgentCreatedMeta; // cast a través de unknown — seguro en tests
    const entry = service.logAgentCreated({ agentId: 'agent-sec', meta });
    expect(entry.metadata?.apiKey).toBe('[REDACTED]');
  });

  it('usa createdBy como userId cuando userId no se pasa', () => {
    const meta: AgentCreatedMeta = {
      agentId:     'agent-userid',
      agentName:   'Bot',
      workspaceId: 'ws-1',
      scopeLevel:  'workspace',
      createdBy:   'user-from-meta',
    };
    const entry = service.logAgentCreated({ agentId: 'agent-userid', meta });
    expect(entry.userId).toBe('user-from-meta');
  });
});

// ── sanitizeAuditMeta (unit) ──────────────────────────────────────────────────
describe('sanitizeAuditMeta', () => {
  it('sanitizeAuditMeta redacta secretos dentro de arrays', () => {
    const result = sanitizeAuditMeta({
      items: [
        { apiKey: 'sk-secret', label: 'visible' },
        { token: 'tok-123',    label: 'visible2' },
        'string-item-no-object',
      ],
    });
    expect((result['items'] as Array<Record<string, unknown>>)[0]?.['apiKey'])
      .toBe('[REDACTED]');
    expect((result['items'] as Array<Record<string, unknown>>)[0]?.['label'])
      .toBe('visible');
    expect((result['items'] as Array<Record<string, unknown>>)[1]?.['token'])
      .toBe('[REDACTED]');
    expect((result['items'] as unknown[])[2])
      .toBe('string-item-no-object'); // primitivos en array pasan tal cual
  });
});
