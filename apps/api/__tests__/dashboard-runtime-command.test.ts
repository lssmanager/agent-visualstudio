import express, { Router } from 'express';
import request from 'supertest';
import { registerDashboardRoutes } from '../src/modules/dashboard/dashboard.controller';
import { DashboardService } from '../src/modules/dashboard/dashboard.service';

/**
 * HTTP contract tests for POST /dashboard/runtime/command.
 *
 * Key contract invariant (fixed in prior session):
 *   HTTP 200 for ALL operational outcomes (applied / partial / unsupported_by_runtime / rejected).
 *   HTTP 4xx/5xx are reserved for request validation failures and unexpected server errors.
 */

// Build a minimal express app with the dashboard routes mounted
function buildApp(serviceOverride?: Partial<DashboardService>): express.Application {
  const app = express();
  app.use(express.json());

  // Patch DashboardService prototype before registering routes so the
  // new DashboardService() inside registerDashboardRoutes picks up our mock.
  if (serviceOverride) {
    Object.assign(DashboardService.prototype, serviceOverride);
  }

  const router = Router();
  registerDashboardRoutes(router);
  app.use(router);

  // Restore prototype after app is built to avoid test pollution
  return app;
}

const VALID_COMMAND_BODY = {
  level: 'workspace',
  id: 'workspace-1',
  action: 'connect',
  target: { level: 'agent', id: 'agent-1' },
};

describe('POST /dashboard/runtime/command – HTTP semantics', () => {
  afterEach(() => {
    // Ensure we don't leave prototype patches lingering
    jest.restoreAllMocks();
  });

  it('returns HTTP 200 with status=applied when action succeeds', async () => {
    const mockResult = {
      command: 'connect',
      scope: { level: 'workspace', id: 'workspace-1' },
      result: {
        action: 'connect',
        status: 'applied',
        runtimeSupported: true,
        message: 'Topology action "connect" applied successfully',
        requestedAt: new Date().toISOString(),
        appliedAt: new Date().toISOString(),
      },
    };

    jest.spyOn(DashboardService.prototype, 'executeRuntimeCommand').mockResolvedValue(mockResult as any);

    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send(VALID_COMMAND_BODY);

    expect(res.status).toBe(200);
    expect(res.body.result.status).toBe('applied');
    expect(res.body.result.runtimeSupported).toBe(true);
    expect(res.body.result.appliedAt).toBeTruthy();
  });

  it('returns HTTP 200 (NOT 501) with status=unsupported_by_runtime', async () => {
    const mockResult = {
      command: 'connect',
      scope: { level: 'workspace', id: 'workspace-1' },
      result: {
        action: 'connect',
        status: 'unsupported_by_runtime',
        runtimeSupported: false,
        message: 'Topology action "connect" is unsupported by runtime',
        requestedAt: new Date().toISOString(),
        errorCode: 'UNSUPPORTED_BY_RUNTIME',
      },
    };

    jest.spyOn(DashboardService.prototype, 'executeRuntimeCommand').mockResolvedValue(mockResult as any);

    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send(VALID_COMMAND_BODY);

    // CRITICAL: must be 200, not 501
    expect(res.status).toBe(200);
    expect(res.status).not.toBe(501);
    expect(res.body.result.status).toBe('unsupported_by_runtime');
    expect(res.body.result.runtimeSupported).toBe(false);
    expect(res.body.result.errorCode).toBe('UNSUPPORTED_BY_RUNTIME');
  });

  it('returns HTTP 200 (NOT 4xx) with status=rejected and reason in message', async () => {
    const mockResult = {
      command: 'disconnect',
      scope: { level: 'workspace', id: 'workspace-1' },
      result: {
        action: 'disconnect',
        status: 'rejected',
        runtimeSupported: true,
        message: 'Runtime rejected action "disconnect": Agent is not connected',
        requestedAt: new Date().toISOString(),
        errorCode: 'RUNTIME_REJECTED',
      },
    };

    jest.spyOn(DashboardService.prototype, 'executeRuntimeCommand').mockResolvedValue(mockResult as any);

    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send({ ...VALID_COMMAND_BODY, action: 'disconnect' });

    expect(res.status).toBe(200);
    expect(res.body.result.status).toBe('rejected');
    expect(res.body.result.runtimeSupported).toBe(true);
    expect(res.body.result.message).toContain('Agent is not connected');
    expect(res.body.result.errorCode).toBe('RUNTIME_REJECTED');
  });

  it('returns HTTP 200 with custom errorCode when runtime provides code field', async () => {
    const mockResult = {
      command: 'pause',
      scope: { level: 'workspace', id: 'workspace-1' },
      result: {
        action: 'pause',
        status: 'rejected',
        runtimeSupported: true,
        message: 'Runtime rejected action "pause": Not allowed',
        requestedAt: new Date().toISOString(),
        errorCode: 'TOPOLOGY_FORBIDDEN',
      },
    };

    jest.spyOn(DashboardService.prototype, 'executeRuntimeCommand').mockResolvedValue(mockResult as any);

    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send({ ...VALID_COMMAND_BODY, action: 'pause' });

    expect(res.status).toBe(200);
    expect(res.body.result.errorCode).toBe('TOPOLOGY_FORBIDDEN');
  });

  it('returns HTTP 200 with status=partial when runtime applies only part of the request', async () => {
    const mockResult = {
      command: 'redirect',
      scope: { level: 'workspace', id: 'workspace-1' },
      result: {
        action: 'redirect',
        status: 'partial',
        runtimeSupported: true,
        message: 'Redirect applied for primary target, fallback target remains pending',
        requestedAt: new Date().toISOString(),
        errorCode: 'FALLBACK_PENDING',
      },
    };

    jest.spyOn(DashboardService.prototype, 'executeRuntimeCommand').mockResolvedValue(mockResult as any);

    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send({ ...VALID_COMMAND_BODY, action: 'redirect' });

    expect(res.status).toBe(200);
    expect(res.body.result.status).toBe('partial');
    expect(res.body.result.runtimeSupported).toBe(true);
    expect(res.body.result.errorCode).toBe('FALLBACK_PENDING');
  });
});

describe('POST /dashboard/runtime/command – request validation', () => {
  it('returns HTTP 400 when level is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send({ id: 'workspace-1', action: 'connect' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/level/i);
  });

  it('returns HTTP 400 when id is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send({ level: 'workspace', action: 'connect' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/id/i);
  });

  it('returns HTTP 400 when action is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send({ level: 'workspace', id: 'workspace-1' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/action/i);
  });

  it('returns HTTP 400 when body is empty', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('returns HTTP 400 when level is unsupported', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send({ ...VALID_COMMAND_BODY, level: 'team' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/unsupported level/i);
  });

  it('returns HTTP 400 when action is unsupported', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send({ ...VALID_COMMAND_BODY, action: 'restart' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/unsupported runtime action/i);
  });

  it('returns HTTP 400 when connect action is missing target', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send({ level: 'workspace', id: 'workspace-1', action: 'connect' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/target is required/i);
  });

  it('returns HTTP 400 when target level is unsupported', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send({
        ...VALID_COMMAND_BODY,
        target: { level: 'team', id: 'x' },
      });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/unsupported target level/i);
  });
});

describe('POST /dashboard/runtime/command – server error handling', () => {
  it('returns HTTP 500 with structured error when service throws', async () => {
    jest.spyOn(DashboardService.prototype, 'executeRuntimeCommand').mockRejectedValue(
      new Error('Gateway connection timeout'),
    );

    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send(VALID_COMMAND_BODY);

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain('Gateway connection timeout');
    expect(res.body.command).toBe('connect');
  });

  it('returns HTTP 500 with generic message when service throws non-Error', async () => {
    jest.spyOn(DashboardService.prototype, 'executeRuntimeCommand').mockRejectedValue(
      'unexpected string throw',
    );

    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send(VALID_COMMAND_BODY);

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(typeof res.body.error).toBe('string');
  });
});

describe('POST /dashboard/runtime/command – response shape', () => {
  it('always includes command and scope fields in 200 response', async () => {
    const mockResult = {
      command: 'connect',
      scope: { level: 'workspace', id: 'workspace-1' },
      result: {
        action: 'connect',
        status: 'applied',
        runtimeSupported: true,
        message: 'ok',
        requestedAt: new Date().toISOString(),
        appliedAt: new Date().toISOString(),
      },
    };

    jest.spyOn(DashboardService.prototype, 'executeRuntimeCommand').mockResolvedValue(mockResult as any);

    const app = buildApp();
    const res = await request(app)
      .post('/dashboard/runtime/command')
      .send(VALID_COMMAND_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('command');
    expect(res.body).toHaveProperty('scope');
    expect(res.body).toHaveProperty('result');
    expect(res.body.result).toHaveProperty('status');
    expect(res.body.result).toHaveProperty('runtimeSupported');
    expect(res.body.result).toHaveProperty('requestedAt');
  });
});
