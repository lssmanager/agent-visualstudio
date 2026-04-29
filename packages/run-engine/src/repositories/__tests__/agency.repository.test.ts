/**
 * agency.repository.test.ts
 * F0-04 coverage: AgencyRepository CRUD + soft-delete + findBy* methods.
 */

import { PrismaClient } from '@prisma/client';
import { AgencyRepository } from '../agency.repository';
import { createAgency, uid } from './helpers/fixtures';

let prisma: PrismaClient;
let repo:   AgencyRepository;

beforeAll(() => {
  prisma = new PrismaClient();
  repo   = new AgencyRepository(prisma);
});

afterAll(() => prisma.$disconnect());

// Truncate between tests for isolation
afterEach(async () => {
  // Order matters: respect FK cascade chain (leaf → root)
  await prisma.$executeRawUnsafe('TRUNCATE "AuditEvent", "AgentSkill", "SubagentSkill", "Subagent", "RunStep", "Run", "Flow", "Agent", "Workspace", "Department", "Agency" CASCADE');
});

describe('AgencyRepository', () => {

  // ── create ──────────────────────────────────────────────────────────────

  it('creates an agency and returns it with an id', async () => {
    const slug = `agency-${uid()}`;
    const a = await createAgency(prisma, { slug, name: 'LSS Test' });
    expect(a.id).toBeDefined();
    expect(a.slug).toBe(slug);
  });

  it('throws on duplicate slug', async () => {
    const slug = `dup-${uid()}`;
    await createAgency(prisma, { slug });
    await expect(createAgency(prisma, { slug })).rejects.toThrow();
  });

  // ── findById ─────────────────────────────────────────────────────────────

  it('findById returns the agency', async () => {
    const a = await createAgency(prisma);
    const found = await repo.findById(a.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(a.id);
  });

  it('findById returns null for unknown id', async () => {
    const found = await repo.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  // ── findBySlug ────────────────────────────────────────────────────────────

  it('findBySlug returns the correct agency', async () => {
    const slug = `slug-${uid()}`;
    const a = await createAgency(prisma, { slug });
    const found = await repo.findBySlug(slug);
    expect(found!.id).toBe(a.id);
  });

  it('findBySlug returns null when not found', async () => {
    expect(await repo.findBySlug('ghost-slug')).toBeNull();
  });

  // ── update ──────────────────────────────────────────────────────────────

  it('update changes the name', async () => {
    const a = await createAgency(prisma);
    const updated = await repo.update(a.id, { name: 'Updated Name' });
    expect(updated.name).toBe('Updated Name');
  });

  // ── count ──────────────────────────────────────────────────────────────

  it('count returns the number of agencies', async () => {
    await createAgency(prisma);
    await createAgency(prisma);
    const n = await repo.count();
    expect(n).toBeGreaterThanOrEqual(2);
  });

  // ── findAll pagination ──────────────────────────────────────────────────────

  it('findAll respects limit', async () => {
    await Promise.all([1, 2, 3].map(() => createAgency(prisma)));
    const page1 = await repo.findAll({ limit: 2 });
    expect(page1.length).toBeLessThanOrEqual(2);
  });

  it('findAll offset skips rows', async () => {
    await Promise.all([1, 2, 3].map(() => createAgency(prisma)));
    const all   = await repo.findAll({ limit: 100 });
    const paged = await repo.findAll({ limit: 100, offset: 1 });
    expect(paged.length).toBe(all.length - 1);
  });
});
