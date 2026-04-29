/**
 * run-step.repository.test.ts
 * F0-05 coverage: RunStepRepository bulk create, status transitions.
 */

import { PrismaClient }      from '@prisma/client';
import { RunStepRepository } from '../run-step.repository';
import {
  createAgency, createDepartment, createWorkspace,
  createAgent, createFlow, createRun, createRunStep,
} from './helpers/fixtures';

let prisma: PrismaClient;
let repo:   RunStepRepository;

beforeAll(() => {
  prisma = new PrismaClient();
  repo   = new RunStepRepository(prisma);
});

afterAll(() => prisma.$disconnect());

afterEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "RunStep", "Run", "Flow", "Agent", "Workspace", "Department", "Agency" CASCADE'
  );
});

async function buildRun() {
  const agency = await createAgency(prisma);
  const dept   = await createDepartment(prisma, agency.id);
  const ws     = await createWorkspace(prisma, dept.id);
  const agent  = await createAgent(prisma, ws.id);
  const flow   = await createFlow(prisma, agent.id);
  const run    = await createRun(prisma, flow.id, agency.id);
  return { agency, dept, ws, agent, flow, run };
}

describe('RunStepRepository', () => {

  it('creates a run step linked to a run', async () => {
    const { run, agent } = await buildRun();
    const step = await createRunStep(prisma, run.id, agent.id);
    expect(step.runId).toBe(run.id);
    expect(step.status).toBe('queued');
  });

  it('findByRun returns all steps for a run', async () => {
    const { run, agent } = await buildRun();
    await createRunStep(prisma, run.id, agent.id, { nodeId: 'n1' });
    await createRunStep(prisma, run.id, agent.id, { nodeId: 'n2' });
    const steps = await repo.findByRun(run.id);
    expect(steps.length).toBeGreaterThanOrEqual(2);
  });

  it('markStepRunning transitions step to running', async () => {
    const { run, agent } = await buildRun();
    const step    = await createRunStep(prisma, run.id, agent.id);
    const updated = await repo.markRunning(step.id);
    expect(updated.status).toBe('running');
  });

  it('markStepCompleted stores output and costUsd', async () => {
    const { run, agent } = await buildRun();
    const step    = await createRunStep(prisma, run.id, agent.id);
    const output  = { result: 'done', tokensUsed: 100 };
    const updated = await repo.markCompleted(step.id, {
      output,
      tokenUsage: { input: 50, output: 50 },
      costUsd:    0.003,
    });
    expect(updated.status).toBe('completed');
    expect(updated.costUsd).toBeCloseTo(0.003);
    expect(updated.completedAt).not.toBeNull();
  });

  it('markStepFailed stores error', async () => {
    const { run, agent } = await buildRun();
    const step    = await createRunStep(prisma, run.id, agent.id);
    const updated = await repo.markFailed(step.id, 'Tool timeout');
    expect(updated.status).toBe('failed');
    expect(updated.error).toBe('Tool timeout');
  });

  it('bulkCreate inserts multiple steps atomically', async () => {
    const { run, agent } = await buildRun();
    const steps = await repo.bulkCreate([
      { runId: run.id, agentId: agent.id, nodeId: 'step-a', nodeType: 'agent',     input: {} },
      { runId: run.id, agentId: agent.id, nodeId: 'step-b', nodeType: 'condition', input: {} },
      { runId: run.id, agentId: agent.id, nodeId: 'step-c', nodeType: 'tool',      input: {} },
    ]);
    expect(steps.length).toBe(3);
    expect(steps.map(s => s.nodeId)).toContain('step-a');
  });

  it('deleting run cascades to steps', async () => {
    const { run, agent } = await buildRun();
    const step = await createRunStep(prisma, run.id, agent.id);
    await prisma.run.delete({ where: { id: run.id } });
    const found = await prisma.runStep.findUnique({ where: { id: step.id } });
    expect(found).toBeNull();
  });

  it('retryCount increments correctly', async () => {
    const { run, agent } = await buildRun();
    const step = await createRunStep(prisma, run.id, agent.id);
    const bumped = await repo.incrementRetry(step.id);
    expect(bumped.retryCount).toBe(1);
    const bumped2 = await repo.incrementRetry(step.id);
    expect(bumped2.retryCount).toBe(2);
  });
});
