/**
 * n8n.service.sync.spec.ts
 *
 * Unit tests for N8nService.syncWorkflows().
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encrypt } from '@lss/crypto';
import { N8nService } from '../src/n8n.service';
import type { N8nPrismaClient } from '../src/n8n.types';

const TEST_KEY_HEX = '0'.repeat(64);
const CONNECTION_ID = 'conn-001';
const BASE_URL = 'http://n8n-test.local';
const ENCRYPTED_API_KEY = encrypt('real-n8n-api-key');

function makePrisma(row?: {
  id: string;
  baseUrl: string;
  apiKeyEncrypted: string;
  isActive: boolean;
}): N8nPrismaClient {
  const conn = row ?? {
    id: CONNECTION_ID,
    baseUrl: BASE_URL,
    apiKeyEncrypted: ENCRYPTED_API_KEY,
    isActive: true,
  };

  const prismaObj = {
    n8nConnection: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(conn),
    },
    n8nWorkflow: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    skill: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
  } as unknown as N8nPrismaClient;

  (prismaObj.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) => callback(prismaObj),
  );

  return prismaObj;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  process.env['SECRETS_ENCRYPTION_KEY'] = TEST_KEY_HEX;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env['SECRETS_ENCRYPTION_KEY'];
});

describe('N8nService.syncWorkflows()', () => {
  it('upserts active workflows using decrypt()', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'wf-1',
            name: 'Workflow 1',
            active: true,
            nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: 'hook-1' } }],
          },
        ],
      }) as Response,
    );

    const prisma = makePrisma();
    const svc = new N8nService({ prisma } as never);

    const result = await svc.syncWorkflows(CONNECTION_ID);

    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('throws when the connection is inactive', async () => {
    const prisma = makePrisma({ id: CONNECTION_ID, baseUrl: BASE_URL, apiKeyEncrypted: ENCRYPTED_API_KEY, isActive: false });
    const svc = new N8nService({ prisma } as never);

    await expect(svc.syncWorkflows(CONNECTION_ID)).rejects.toThrow('N8nConnection is inactive');
  });

  it('throws when SECRETS_ENCRYPTION_KEY is missing', async () => {
    delete process.env['SECRETS_ENCRYPTION_KEY'];
    const prisma = makePrisma();
    const svc = new N8nService({ prisma } as never);

    await expect(svc.syncWorkflows(CONNECTION_ID)).rejects.toThrow('SECRETS_ENCRYPTION_KEY');
  });
});
