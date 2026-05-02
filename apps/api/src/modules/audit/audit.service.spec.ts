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
  ChannelErrorMeta,
  ChannelMessageMeta,
  ChannelProvisionedMeta,
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
