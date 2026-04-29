/**
 * agent.repository.test.ts
 * F0-04 coverage: AgentRepository + C-20 orchestrator invariant per workspace.
 */

import { PrismaClient }    from '@prisma/client';
import { AgentRepository } from '../agent.repository';
import {
  createAgency, createDepartment, createWorkspace,
  createAgent, uid,
} from './helpers/fixtures';

let prisma: PrismaClient;
let repo:   AgentRepository;

beforeAll(() => {
  prisma = new PrismaClient();
  repo   = new AgentRepository(prisma);
});

afterAll(() => prisma.$disconnect());

afterEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AgentSkill", "Agent", "Workspace", "Department", "Agency" CASCADE'
  );
});

describe('AgentRepository', () => {

  async function buildWorkspace() {
    const agency = await createAgency(prisma);
    const dept   = await createDepartment(prisma, agency.id);
    const ws     = await createWorkspace(prisma, dept.id);
    return { agency, dept, ws };
  }

  it('creates an agent and returns it', async () => {
    const { ws } = await buildWorkspace();
    const agent  = await createAgent(prisma, ws.id, { role: 'specialist' });
    expect(agent.workspaceId).toBe(ws.id);
    expect(agent.role).toBe('specialist');
  });

  it('findById returns the agent', async () => {
    const { ws }  = await buildWorkspace();
    const agent   = await createAgent(prisma, ws.id);
    const found   = await repo.findById(agent.id);
    expect(found!.id).toBe(agent.id);
  });

  it('findById returns null for unknown id', async () => {
    const found = await repo.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('findByWorkspace returns only agents for that workspace', async () => {
    const { ws }  = await buildWorkspace();
    await createAgent(prisma, ws.id);
    await createAgent(prisma, ws.id);
    const agents = await repo.findByWorkspace(ws.id);
    expect(agents.length).toBeGreaterThanOrEqual(2);
    agents.forEach(a => expect(a.workspaceId).toBe(ws.id));
  });

  it('findOrchestrator returns the agent with isLevelOrchestrator=true', async () => {
    const { ws }  = await buildWorkspace();
    const orch    = await createAgent(prisma, ws.id, { isLevelOrchestrator: true, role: 'orchestrator' });
    await createAgent(prisma, ws.id, { isLevelOrchestrator: false });
    const found = await repo.findOrchestrator(ws.id);
    expect(found!.id).toBe(orch.id);
  });

  // C-20
  it('C-20: throws when creating second orchestrator in same workspace', async () => {
    const { ws } = await buildWorkspace();
    await createAgent(prisma, ws.id, { isLevelOrchestrator: true });
    await expect(
      createAgent(prisma, ws.id, { isLevelOrchestrator: true })
    ).rejects.toThrow();
  });

  it('C-20: two different workspaces can each have an orchestrator', async () => {
    const agency = await createAgency(prisma);
    const dept   = await createDepartment(prisma, agency.id);
    const ws1    = await createWorkspace(prisma, dept.id);
    const ws2    = await createWorkspace(prisma, dept.id);
    await createAgent(prisma, ws1.id, { isLevelOrchestrator: true });
    const a2 = await createAgent(prisma, ws2.id, { isLevelOrchestrator: true });
    expect(a2.id).toBeDefined();
  });

  // update
  it('update changes systemPrompt', async () => {
    const { ws }  = await buildWorkspace();
    const agent   = await createAgent(prisma, ws.id);
    const updated = await repo.update(agent.id, { systemPrompt: 'new prompt' });
    expect(updated.systemPrompt).toBe('new prompt');
  });

  // cascade delete
  it('deleting workspace cascades to agents', async () => {
    const { ws }  = await buildWorkspace();
    const agent   = await createAgent(prisma, ws.id);
    await prisma.workspace.delete({ where: { id: ws.id } });
    const found = await repo.findById(agent.id);
    expect(found).toBeNull();
  });
});
