/**
 * n8n.service.sync.spec.ts
 *
 * Unit tests for N8nService.syncWorkflows().
 *
 * Strategy:
 *  - Prisma is mocked via a plain object with vi.fn() methods.
 *  - fetch is mocked via vi.spyOn(global, 'fetch').
 *  - AES-256-GCM encrypt helper creates valid payloads for the decrypt path.
 *
 * Test matrix (F1b-06 DoD):
 *  1. 2 active workflows  → upserted=2, skipped=0, errors=[]
 *  2. 1 active + 1 inactive → upserted=1, skipped=1
 *  3. Inactive connection  → throws 'N8nConnection is inactive'
 *  4. n8n returns 401     → errors contains entry, method returns (no throw)
 *  5. N8N_SECRET missing  → throws 'N8N_SECRET not configured'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCipheriv, randomBytes }                      from 'crypto';
import { N8nService }                                       from '../src/n8n.service';
import type { N8nPrismaClient }                             from '../src/n8n.types';

// ── Crypto helpers ────────────────────────────────────────────────────────

/** Master key used in all tests: 32-byte key as 64 hex chars */
const TEST_KEY_HEX = '0'.repeat(64);

/**
 * Creates a valid AES-256-GCM encrypted hex string.
 * Format: [12b IV][16b authTag][Nb ciphertext]
 */
function encryptApiKey(plaintext: string): string {
  const key      = Buffer.from(TEST_KEY_HEX, 'hex');
  const iv       = randomBytes(12);
  const cipher   = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag  = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('hex');
}

const ENCRYPTED_API_KEY = encryptApiKey('real-n8n-api-key');

// ── Fixtures ──────────────────────────────────────────────────────────────

const BASE_URL       = 'http://n8n-test.local';
const CONNECTION_ID  = 'conn-001';

const activeConnection = {
  id:              CONNECTION_ID,
  baseUrl:         BASE_URL,
  apiKeyEncrypted: ENCRYPTED_API_KEY,
  isActive:        true,
};

const inactiveConnection = { ...activeConnection, isActive: false };

/** Factory for a minimal workflow DTO */
function makeWorkflow(id: string, active: boolean, path?: string) {
  return {
    id,
    name:   `Workflow ${id}`,
    active,
    nodes:  path
      ? [{ type: 'n8n-nodes-base.webhook', parameters: { path, httpMethod: 'POST' } }]
      : [],
  };
}

/** Creates a mock Response with JSON body */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Mock Prisma factory ───────────────────────────────────────────────────

function makePrisma(
  connectionRow: typeof activeConnection | typeof inactiveConnection = activeConnection,
): N8nPrismaClient {
  const prismaObj = {
    n8nConnection: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(connectionRow),
    },
    n8nWorkflow: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    skill: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
  } as unknown as N8nPrismaClient;

  // Callback-form transaction: passes the same prisma object so spy assertions work
  (prismaObj.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) => callback(prismaObj),
  );

  return prismaObj;
}

// ── Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  // Set the master key env var before each test
  process.env['N8N_SECRET'] = TEST_KEY_HEX;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env['N8N_SECRET'];
  delete process.env['CHANNEL_SECRET'];
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('N8nService.syncWorkflows()', () => {

  // ── 1. Happy path: 2 active workflows ─────────────────────────────────

  it('2 workflows activos → upserted=2, skipped=0, errors=[]', async () => {
    const prisma = makePrisma();
    const svc    = new N8nService({
      baseUrl: BASE_URL, apiKey: 'dummy', prisma,
    });

    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          makeWorkflow('wf-a', true, 'hook-a'),
          makeWorkflow('wf-b', true, 'hook-b'),
        ],
      }),
    );

    const res = await svc.syncWorkflows(CONNECTION_ID);

    expect(res.upserted).toBe(2);
    expect(res.skipped).toBe(0);
    expect(res.errors).toHaveLength(0);

    // Verify upserts were called for both workflows
    expect((prisma.n8nWorkflow.upsert as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
    expect((prisma.skill.upsert as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);

    // Verify skill name format 'n8n:{connectionId}:{workflowId}'
    const skillCalls = (prisma.skill.upsert as ReturnType<typeof vi.fn>).mock.calls as Array<Array<Record<string, unknown>>>;
    const skillNames = skillCalls.map((call) => (call[0] as { where: { name: string } }).where.name);
    expect(skillNames).toContain(`n8n:${CONNECTION_ID}:wf-a`);
    expect(skillNames).toContain(`n8n:${CONNECTION_ID}:wf-b`);
  });

  // ── 2. Mixed: 1 active + 1 inactive ────────────────────────────────────

  it('1 activo + 1 inactivo → upserted=1, skipped=1', async () => {
    const prisma = makePrisma();
    const svc    = new N8nService({
      baseUrl: BASE_URL, apiKey: 'dummy', prisma,
    });

    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          makeWorkflow('wf-active',   true),
          makeWorkflow('wf-inactive', false),
        ],
      }),
    );

    const res = await svc.syncWorkflows(CONNECTION_ID);

    expect(res.upserted).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.errors).toHaveLength(0);

    // Only the active workflow should have been upserted
    expect((prisma.n8nWorkflow.upsert as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  // ── 3. Inactive connection → throw ─────────────────────────────────────

  it('conexión inactiva → throw "N8nConnection is inactive"', async () => {
    const prisma = makePrisma(inactiveConnection);
    const svc    = new N8nService({
      baseUrl: BASE_URL, apiKey: 'dummy', prisma,
    });

    await expect(svc.syncWorkflows(CONNECTION_ID))
      .rejects
      .toThrow('N8nConnection is inactive');

    // fetch should never be called
    const fetchSpy = vi.spyOn(global, 'fetch');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── 4. n8n returns 401 → errors[] entry, no throw ──────────────────────

  it('n8n responde 401 → errors contiene entry, no lanza excepción', async () => {
    const prisma = makePrisma();
    const svc    = new N8nService({
      baseUrl: BASE_URL, apiKey: 'dummy', prisma,
    });

    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'Unauthorized' }, 401),
    );

    const res = await svc.syncWorkflows(CONNECTION_ID);

    // Should NOT throw — returns with an error entry
    expect(res.upserted).toBe(0);
    expect(res.skipped).toBe(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]?.reason).toMatch(/n8n API error: 401/);

    // No DB writes should have happened
    expect((prisma.n8nWorkflow.upsert as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((prisma.skill.upsert as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  // ── 5. N8N_SECRET not set → throw ──────────────────────────────────────

  it('N8N_SECRET no configurado → throw "N8N_SECRET not configured"', async () => {
    delete process.env['N8N_SECRET'];
    delete process.env['CHANNEL_SECRET'];

    const prisma = makePrisma();
    const svc    = new N8nService({
      baseUrl: BASE_URL, apiKey: 'dummy', prisma,
    });

    await expect(svc.syncWorkflows(CONNECTION_ID))
      .rejects
      .toThrow('N8N_SECRET not configured');
  });

  // ── Bonus: per-workflow upsert error does not abort the loop ────────────

  it('error de upsert en un workflow no detiene el loop', async () => {
    const prisma = makePrisma();
    (prisma.n8nWorkflow.upsert as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('DB constraint violation'))
      .mockResolvedValue({});

    const svc = new N8nService({
      baseUrl: BASE_URL, apiKey: 'dummy', prisma,
    });

    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          makeWorkflow('wf-fail', true),
          makeWorkflow('wf-ok',   true),
        ],
      }),
    );

    const res = await svc.syncWorkflows(CONNECTION_ID);

    expect(res.upserted).toBe(1);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]?.workflowId).toBe('wf-fail');
    expect(res.errors[0]?.reason).toMatch(/DB constraint/);
  });

  // ── 6. CHANNEL_SECRET fallback ─────────────────────────────────────────

  it('usa CHANNEL_SECRET como fallback cuando N8N_SECRET no está configurado', async () => {
    delete process.env['N8N_SECRET'];
    process.env['CHANNEL_SECRET'] = TEST_KEY_HEX;

    const prisma = makePrisma();
    const svc    = new N8nService({
      baseUrl: BASE_URL, apiKey: 'dummy', prisma,
    });

    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ data: [makeWorkflow('wf-ch', true, 'hook-ch')] }),
    );

    const res = await svc.syncWorkflows(CONNECTION_ID);

    expect(res.upserted).toBe(1);
    expect(res.errors).toHaveLength(0);
  });

});
