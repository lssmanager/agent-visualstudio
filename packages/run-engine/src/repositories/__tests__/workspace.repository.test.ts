/**
 * workspace.repository.test.ts
 * F0-04 coverage: WorkspaceRepository + C-20 orchestrator invariant.
 */

import { PrismaClient }        from '@prisma/client';
import { WorkspaceRepository } from '../workspace.repository';
import {
  createAgency, createDepartment, createWorkspace, uid,
} from './helpers/fixtures';

let prisma: PrismaClient;
let repo:   WorkspaceRepository;

beforeAll(() => {
  prisma = new PrismaClient();
  repo   = new WorkspaceRepository(prisma);
});

afterAll(() => prisma.$disconnect());

afterEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "Workspace", "Department", "Agency" CASCADE');
});

describe('WorkspaceRepository', () => {

  async function buildDept() {
    const agency = await createAgency(prisma);
    const dept   = await createDepartment(prisma, agency.id);
    return { agency, dept };
  }

  it('creates a workspace linked to a department', async () => {
    const { dept } = await buildDept();
    const ws = await createWorkspace(prisma, dept.id, { name: 'My WS' });
    expect(ws.departmentId).toBe(dept.id);
  });

  it('findByDepartment returns workspaces for that department', async () => {
    const { dept } = await buildDept();
    await createWorkspace(prisma, dept.id);
    await createWorkspace(prisma, dept.id);
    const list = await repo.findByDepartment(dept.id);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('findById returns the workspace', async () => {
    const { dept } = await buildDept();
    const ws = await createWorkspace(prisma, dept.id);
    const found = await repo.findById(ws.id);
    expect(found!.id).toBe(ws.id);
  });

  it('findById returns null for unknown id', async () => {
    const found = await repo.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  // C-20 workspace orchestrator
  it('C-20: throws when creating second orchestrator in same department', async () => {
    const { dept } = await buildDept();
    await createWorkspace(prisma, dept.id, { isLevelOrchestrator: true });
    await expect(
      createWorkspace(prisma, dept.id, { isLevelOrchestrator: true })
    ).rejects.toThrow();
  });

  it('C-20: different departments can each have an orchestrator workspace', async () => {
    const agency = await createAgency(prisma);
    const d1     = await createDepartment(prisma, agency.id);
    const d2     = await createDepartment(prisma, agency.id);
    await createWorkspace(prisma, d1.id, { isLevelOrchestrator: true });
    const ws2 = await createWorkspace(prisma, d2.id, { isLevelOrchestrator: true });
    expect(ws2.id).toBeDefined();
  });

  // Cascade delete
  it('deleting department cascades to workspaces', async () => {
    const { dept } = await buildDept();
    const ws = await createWorkspace(prisma, dept.id);
    await prisma.department.delete({ where: { id: dept.id } });
    const found = await repo.findById(ws.id);
    expect(found).toBeNull();
  });
});
