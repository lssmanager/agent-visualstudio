/**
 * n8n-connections.spec.ts
 *
 * Tests unitarios para N8nConnectionsService.
 * Prisma y @lss/crypto mockeados — sin DB real.
 */

import { N8nConnectionsService } from '../n8n-connections.service';

// ── Mocks globales ────────────────────────────────────────────────────

const prismaMock = {
  n8nConnection: {
    findMany:   jest.fn(),
    findUnique: jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    delete:     jest.fn(),
  },
  n8nWorkflow: {
    deleteMany: jest.fn(),
  },
};

jest.mock('../../modules/core/db/prisma.service', () => ({
  prisma: prismaMock,
}));

jest.mock('@lss/crypto', () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => v.replace('enc:', '')),
}));

// ── Helpers ───────────────────────────────────────────────────────────

const mockRow = (overrides: Record<string, unknown> = {}) => ({
  id:              'conn-1',
  name:            'Mi n8n',
  baseUrl:         'http://n8n:5678',
  isActive:        true,
  apiKeyEncrypted: 'enc:secret',
  createdAt:       new Date(),
  updatedAt:       new Date(),
  _count:          { workflows: 3 },
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

// ── Tests ─────────────────────────────────────────────────────────────

describe('N8nConnectionsService', () => {

  it('create() encripta apiKey antes de guardar', async () => {
    prismaMock.n8nConnection.create.mockResolvedValue(mockRow());
    const svc = new N8nConnectionsService();
    await svc.create({
      name:    'Mi n8n',
      baseUrl: 'http://n8n:5678',
      apiKey:  'secret',
    });
    expect(prismaMock.n8nConnection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ apiKeyEncrypted: 'enc:secret' }),
      }),
    );
  });

  it('create() elimina trailing slash de baseUrl', async () => {
    prismaMock.n8nConnection.create.mockResolvedValue(mockRow());
    const svc = new N8nConnectionsService();
    await svc.create({ name: 'X', baseUrl: 'http://n8n:5678/', apiKey: 'k' });
    expect(prismaMock.n8nConnection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ baseUrl: 'http://n8n:5678' }),
      }),
    );
  });

  it('list() nunca expone apiKeyEncrypted', async () => {
    prismaMock.n8nConnection.findMany.mockResolvedValue([mockRow()]);
    const svc = new N8nConnectionsService();
    const result = await svc.list();
    expect(result[0]).not.toHaveProperty('apiKeyEncrypted');
    expect(result[0]?.workflowCount).toBe(3);
  });

  it('delete() elimina workflows antes de la conexión', async () => {
    prismaMock.n8nConnection.findUnique.mockResolvedValue(mockRow());
    prismaMock.n8nWorkflow.deleteMany.mockResolvedValue({ count: 3 });
    prismaMock.n8nConnection.delete.mockResolvedValue({});
    const svc = new N8nConnectionsService();
    expect(await svc.delete('conn-1')).toBe(true);
    expect(prismaMock.n8nWorkflow.deleteMany).toHaveBeenCalledWith(
      { where: { connectionId: 'conn-1' } },
    );
  });

  it('delete() retorna false si no existe', async () => {
    prismaMock.n8nConnection.findUnique.mockResolvedValue(null);
    expect(await new N8nConnectionsService().delete('no-id')).toBe(false);
  });

  it('testConnection() retorna ok:false si decrypt falla', async () => {
    prismaMock.n8nConnection.findUnique.mockResolvedValue(mockRow());
    const { decrypt } = require('@lss/crypto') as { decrypt: jest.Mock };
    decrypt.mockImplementationOnce(() => { throw new Error('fail'); });
    const r = await new N8nConnectionsService().testConnection('conn-1');
    expect(r.ok).toBe(false);
    expect((r as { ok: false; error: string }).error).toContain('decrypt');
  });

  it('testConnection() retorna ok:false si la conexión no existe', async () => {
    prismaMock.n8nConnection.findUnique.mockResolvedValue(null);
    const r = await new N8nConnectionsService().testConnection('no-id');
    expect(r.ok).toBe(false);
  });
});
