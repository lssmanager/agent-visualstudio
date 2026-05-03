/**
 * n8n.service.create.spec.ts
 *
 * Tests for N8nService.createWorkflow() — F4a-01
 */

import { N8nService } from '../n8n.service';
import type { N8nPrismaClient } from '../n8n.types';

// ── Prisma mock ─────────────────────────────────────────────────────────────

const mockTransactionFn = jest.fn();
const prismaMock = {
  n8nConnection: {
    findUniqueOrThrow: jest.fn(),
  },
  n8nWorkflow: {
    upsert: jest.fn(),
  },
  skill: {
    upsert: jest.fn(),
  },
  $transaction: mockTransactionFn,
} as unknown as N8nPrismaClient;

// ── crypto mock ─────────────────────────────────────────────────────────────

jest.mock('@lss/crypto', () => ({
  decrypt: jest.fn().mockReturnValue('test-api-key'),
}));

// ── fetch mock ──────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── helpers ─────────────────────────────────────────────────────────────────

const activeConn = {
  id:              'conn-1',
  baseUrl:         'https://n8n.example.com',
  apiKeyEncrypted: 'encrypted-key',
  isActive:        true,
};

function makeService(): N8nService {
  return new N8nService({
    baseUrl: 'https://n8n.example.com',
    apiKey:  'irrelevant-for-createWorkflow',
    prisma:  prismaMock,
  });
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('createWorkflow()', () => {
  let service: N8nService;

  beforeEach(() => {
    service = makeService();
    mockFetch.mockReset();
    jest.clearAllMocks();
    (prismaMock.n8nConnection.findUniqueOrThrow as jest.Mock).mockResolvedValue(activeConn);
  });

  // ── happy path ─────────────────────────────────────────────────────────

  it('crea un workflow y retorna n8nWorkflowId', async () => {
    mockFetch.mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ id: 'wf-123', name: 'Test WF', active: false }),
    });

    const result = await service.createWorkflow({
      connectionId: 'conn-1',
      name:         'Test WF',
      nodes: [{
        id:          'n1',
        name:        'Start',
        type:        'n8n-nodes-base.start',
        typeVersion: 1,
        position:    [0, 0],
      }],
    });

    expect(result.n8nWorkflowId).toBe('wf-123');
    expect(result.name).toBe('Test WF');
    expect(result.active).toBe(false);
    expect(result.webhookUrl).toBeUndefined();
    expect(result.prismaWorkflowId).toBeUndefined();
    // fetch called once — POST create only, no activate
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://n8n.example.com/api/v1/workflows',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  // ── activate=true ──────────────────────────────────────────────────────

  it('activa el workflow cuando activate=true', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok:   true,
        json: async () => ({ id: 'wf-456', name: 'Active WF', active: false }),
      })
      .mockResolvedValueOnce({ ok: true }); // POST activate

    const result = await service.createWorkflow({
      connectionId: 'conn-1',
      name:         'Active WF',
      nodes:        [],
      activate:     true,
    });

    expect(result.active).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://n8n.example.com/api/v1/workflows/wf-456/activate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('no lanza error si activate falla — solo warn', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch
      .mockResolvedValueOnce({
        ok:   true,
        json: async () => ({ id: 'wf-789', name: 'WF', active: false }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500 }); // activate fails

    const result = await service.createWorkflow({
      connectionId: 'conn-1',
      name:         'WF',
      nodes:        [],
      activate:     true,
    });

    // Workflow was still created — active stays false because activation failed
    expect(result.active).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('activation failed'));
    warnSpy.mockRestore();
  });

  // ── syncToSkills=true ─────────────────────────────────────────────────

  it('sincroniza Skill en Prisma cuando syncToSkills=true y hay webhook node', async () => {
    mockFetch.mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ id: 'wf-hook', name: 'Webhook WF', active: true }),
    });

    // $transaction calls the callback with tx mock
    mockTransactionFn.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        n8nWorkflow: { upsert: jest.fn().mockResolvedValue({ id: 'prisma-wf-1' }) },
        skill:       { upsert: jest.fn().mockResolvedValue({}) },
      };
      return fn(txMock);
    });

    const result = await service.createWorkflow({
      connectionId: 'conn-1',
      name:         'Webhook WF',
      nodes: [{
        id:          'n-wh',
        name:        'Webhook',
        type:        'n8n-nodes-base.webhook',
        typeVersion: 1,
        position:    [0, 0],
        parameters:  { path: 'my-hook', httpMethod: 'POST' },
      }],
      syncToSkills: true,
    });

    expect(result.webhookUrl).toBe('https://n8n.example.com/webhook/my-hook');
    expect(result.prismaWorkflowId).toBe('prisma-wf-1');
    expect(mockTransactionFn).toHaveBeenCalled();
  });

  it('omite upsert Prisma cuando syncToSkills=true pero no hay webhook node', async () => {
    mockFetch.mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ id: 'wf-nohook', name: 'No Hook', active: false }),
    });

    const result = await service.createWorkflow({
      connectionId: 'conn-1',
      name:         'No Hook',
      nodes: [{
        id: 'n1', name: 'Start', type: 'n8n-nodes-base.start',
        typeVersion: 1, position: [0, 0],
      }],
      syncToSkills: true,
    });

    expect(result.webhookUrl).toBeUndefined();
    expect(result.prismaWorkflowId).toBeUndefined();
    expect(mockTransactionFn).not.toHaveBeenCalled();
  });

  // ── error handling ────────────────────────────────────────────────────

  it('lanza error cuando n8n API retorna 4xx', async () => {
    mockFetch.mockResolvedValueOnce({
      ok:     false,
      status: 400,
      text:   async () => 'Bad Request',
    });

    await expect(
      service.createWorkflow({ connectionId: 'conn-1', name: 'X', nodes: [] }),
    ).rejects.toThrow('createWorkflow failed (400)');
  });

  it('lanza error cuando la conexión está inactiva', async () => {
    (prismaMock.n8nConnection.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      ...activeConn,
      isActive: false,
    });

    await expect(
      service.createWorkflow({ connectionId: 'conn-1', name: 'X', nodes: [] }),
    ).rejects.toThrow('N8nConnection is inactive');
  });

  it('lanza error si prisma no está disponible', async () => {
    const serviceNoPrisma = new N8nService({
      baseUrl: 'https://n8n.example.com',
      apiKey:  'key',
    });

    await expect(
      serviceNoPrisma.createWorkflow({ connectionId: 'conn-1', name: 'X', nodes: [] }),
    ).rejects.toThrow('prisma client is required');
  });
});
