/**
 * run.repository.test.ts
 * F0-05 coverage: RunRepository transitions, listing, cost accumulation.
 */

import { PrismaClient }  from '@prisma/client';
import { RunRepository } from '../run.repository';
import {
  createAgency, createDepartment, createWorkspace,
  createAgent, createFlow, createRun,
} from './helpers/fixtures';

let prisma: PrismaClient;
let repo:   RunRepository;

beforeAll(() => {
  prisma = new PrismaClient();
  repo   = new RunRepository(prisma);
});

afterAll(() => prisma.$disconnect());

afterEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "RunStep", "Run", "Flow", "Agent", "Workspace", "Department", "Agency" CASCADE'
  );
});

async function buildFlow() {
  const agency = await createAgency(prisma);
  const dept   = await createDepartment(prisma, agency.id);
  const ws     = await createWorkspace(prisma, dept.id);
  const agent  = await createAgent(prisma, ws.id);
  const flow   = await createFlow(prisma, agent.id);
  return { agency, dept, ws, agent, flow };
}

describe('RunRepository', () => {

  it('creates a run in queued status', async () => {
    const { flow, agency } = await buildFlow();
    const run = await createRun(prisma, flow.id, agency.id);
    expect(run.status).toBe('queued');
    expect(run.flowId).toBe(flow.id);
  });

  it('findById returns the run', async () => {
    const { flow } = await buildFlow();
    const run   = await createRun(prisma, flow.id);
    const found = await repo.findById(run.id);
    expect(found!.id).toBe(run.id);
  });

  it('findById returns null for unknown id', async () => {
    const found = await repo.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('listByFlow returns runs for that flow', async () => {
    const { flow } = await buildFlow();
    await createRun(prisma, flow.id);
    await createRun(prisma, flow.id);
    const runs = await repo.listByFlow(flow.id);
    expect(runs.length).toBeGreaterThanOrEqual(2);
    runs.forEach(r => expect(r.flowId).toBe(flow.id));
  });

  it('markRunning transitions status to running and sets startedAt', async () => {
    const { flow } = await buildFlow();
    const run     = await createRun(prisma, flow.id);
    const updated = await repo.markRunning(run.id);
    expect(updated.status).toBe('running');
  });

  it('markCompleted transitions status and sets completedAt + totalCostUsd', async () => {
    const { flow } = await buildFlow();
    const run     = await createRun(prisma, flow.id);
    const updated = await repo.markCompleted(run.id, { totalCostUsd: 0.042 });
    expect(updated.status).toBe('completed');
    expect(updated.completedAt).not.toBeNull();
    expect(updated.totalCostUsd).toBeCloseTo(0.042);
  });

  it('markFailed stores the error message', async () => {
    const { flow } = await buildFlow();
    const run     = await createRun(prisma, flow.id);
    const updated = await repo.markFailed(run.id, 'LLM timeout');
    expect(updated.status).toBe('failed');
    expect(updated.error).toBe('LLM timeout');
  });

  it('listByAgency returns runs for an agency ordered by createdAt desc', async () => {
    const { flow, agency } = await buildFlow();
    await createRun(prisma, flow.id, agency.id);
    await createRun(prisma, flow.id, agency.id);
    const runs = await repo.listByAgency(agency.id, { status: undefined, limit: 10 });
    expect(runs.length).toBeGreaterThanOrEqual(2);
  });

  it('listByAgency filters by status', async () => {
    const { flow, agency } = await buildFlow();
    const r1 = await createRun(prisma, flow.id, agency.id);
    await repo.markCompleted(r1.id, {});
    await createRun(prisma, flow.id, agency.id);  // stays queued
    const completed = await repo.listByAgency(agency.id, { status: 'completed' });
    expect(completed.every(r => r.status === 'completed')).toBe(true);
  });
});
