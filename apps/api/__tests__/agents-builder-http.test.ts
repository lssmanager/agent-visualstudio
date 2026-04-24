import express, { Router } from 'express';
import request from 'supertest';

import { registerAgentsRoutes } from '../src/modules/agents/agents.controller';
import { AgentsService } from '../src/modules/agents/agents.service';

function buildApp() {
  const app = express();
  app.use(express.json());
  const router = Router();
  registerAgentsRoutes(router);
  app.use(router);
  return app;
}

describe('agents builder endpoints', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns readiness envelope', async () => {
    jest.spyOn(AgentsService.prototype, 'getReadiness').mockReturnValue({
      agentId: 'agent-1',
      state: 'ready_to_publish',
      checks: {
        identityComplete: true,
        behaviorComplete: true,
        toolsAssigned: true,
        routingConfigured: true,
        hooksConfigured: true,
        operationsConfigured: true,
        versionsReady: true,
      },
      missingFields: [],
      score: 100,
    } as any);

    const app = buildApp();
    const res = await request(app).get('/agents/agent-1/readiness');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ agentId: 'agent-1', state: 'ready_to_publish', score: 100 }));
  });

  it('returns generated core files artifacts', async () => {
    jest.spyOn(AgentsService.prototype, 'generateCoreFiles').mockReturnValue({
      artifacts: [{ id: 'a-1', type: 'prompt-file', name: 'IDENTITY.md', path: 'agents/agent-1/IDENTITY.md', content: '# IDENTITY.md' }],
      diagnostics: [],
      diff: [{ path: 'agents/agent-1/IDENTITY.md', status: 'updated' }],
    } as any);

    const app = buildApp();
    const res = await request(app).post('/agents/agent-1/core-files/generate');

    expect(res.status).toBe(200);
    expect(res.body.artifacts).toHaveLength(1);
    expect(res.body.artifacts[0]).toEqual(expect.objectContaining({ name: 'IDENTITY.md' }));
  });
});

