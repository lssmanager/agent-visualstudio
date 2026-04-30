/**
 * department.repository.test.ts
 * F0-04 coverage: DepartmentRepository + C-20 orchestrator invariant.
 */

import { PrismaClient } from '@prisma/client';
import { DepartmentRepository } from '../department.repository';
import { createAgency, createDepartment, uid } from './helpers/fixtures';

let prisma: PrismaClient;
let repo:   DepartmentRepository;

beforeAll(() => {
  prisma = new PrismaClient();
  repo   = new DepartmentRepository(prisma);
});

afterAll(() => prisma.$disconnect());

afterEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "Department", "Agency" CASCADE');
});

describe('DepartmentRepository', () => {

  it('creates a department linked to an agency', async () => {
    const agency = await createAgency(prisma);
    const dept   = await createDepartment(prisma, agency.id, { name: 'Eng' });
    expect(dept.agencyId).toBe(agency.id);
    expect(dept.name).toBe('Eng');
  });

  it('findByAgency returns all departments for an agency', async () => {
    const agency = await createAgency(prisma);
    await createDepartment(prisma, agency.id);
    await createDepartment(prisma, agency.id);
    const depts = await repo.findByAgency(agency.id);
    expect(depts.length).toBeGreaterThanOrEqual(2);
  });

  it('findByAgency does not return departments of another agency', async () => {
    const a1 = await createAgency(prisma);
    const a2 = await createAgency(prisma);
    await createDepartment(prisma, a1.id);
    const depts = await repo.findByAgency(a2.id);
    expect(depts.length).toBe(0);
  });

  it('findOrchestrator returns the isLevelOrchestrator department', async () => {
    const agency = await createAgency(prisma);
    const orch   = await createDepartment(prisma, agency.id, { isLevelOrchestrator: true });
    await createDepartment(prisma, agency.id, { isLevelOrchestrator: false });
    const found = await repo.findOrchestrator(agency.id);
    expect(found!.id).toBe(orch.id);
  });

  // C-20: partial unique index prevents two orchestrators in the same agency
  it('C-20: throws when creating a second orchestrator for the same agency', async () => {
    const agency = await createAgency(prisma);
    await createDepartment(prisma, agency.id, { isLevelOrchestrator: true });
    await expect(
      createDepartment(prisma, agency.id, { isLevelOrchestrator: true })
    ).rejects.toThrow();
  });

  it('C-20: allows orchestrator=true in different agencies', async () => {
    const a1 = await createAgency(prisma);
    const a2 = await createAgency(prisma);
    await createDepartment(prisma, a1.id, { isLevelOrchestrator: true });
    // Should NOT throw
    const d2 = await createDepartment(prisma, a2.id, { isLevelOrchestrator: true });
    expect(d2).toBeDefined();
  });

  it('@@unique([agencyId, slug]) prevents duplicate slug within agency', async () => {
    const agency = await createAgency(prisma);
    const slug = `same-slug-${uid()}`;
    await createDepartment(prisma, agency.id, { slug });
    await expect(createDepartment(prisma, agency.id, { slug })).rejects.toThrow();
  });

  it('update changes department name', async () => {
    const agency = await createAgency(prisma);
    const dept   = await createDepartment(prisma, agency.id);
    const updated = await repo.update(dept.id, { name: 'New Name' });
    expect(updated.name).toBe('New Name');
  });
});
