import express, { Router } from 'express';
import request from 'supertest';

import { registerProfilesRoutes } from '../src/modules/profiles/profiles.controller';

function buildApp() {
  const app = express();
  const router = Router();
  registerProfilesRoutes(router);
  app.use(router);
  return app;
}

describe('GET /profiles/templates', () => {
  it('returns the explicit planned V1 templates surface', async () => {
    const app = buildApp();
    const res = await request(app).get('/profiles/templates');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('planned');
    expect(res.body.available).toBe(false);
    expect(res.body.mode).toBe('read_only');
    expect(res.body.decision).toBe('excluded_from_v1');
    expect(res.body.message).toMatch(/use profiles/i);
  });
});
