import { Router } from 'express';

import type {
  BindProfileRequestDto,
  ProfileOverrideRequestDto,
  RuntimeCommandRequestDto,
  UnbindProfileRequestDto,
} from './dashboard.dto';
import { DashboardService } from './dashboard.service';

function parseScope(req: { query: Record<string, unknown> }) {
  return {
    level: typeof req.query.level === 'string' ? req.query.level : undefined,
    id: typeof req.query.id === 'string' ? req.query.id : undefined,
  };
}

export function registerDashboardRoutes(router: Router) {
  const service = new DashboardService();

  router.get('/dashboard/overview', async (req, res) => {
    res.json(await service.getOverview(parseScope(req as any)));
  });

  router.get('/dashboard/connections', async (req, res) => {
    res.json(await service.getConnections(parseScope(req as any)));
  });

  router.get('/dashboard/inspector', async (req, res) => {
    res.json(await service.getInspector(parseScope(req as any)));
  });

  router.get('/dashboard/operations', async (req, res) => {
    res.json(await service.getOperations(parseScope(req as any)));
  });

  router.get('/dashboard/effective-profile', async (req, res) => {
    res.json(await service.getEffectiveProfile(parseScope(req as any)));
  });

  router.post('/dashboard/profile/bind', (req, res) => {
    const payload = req.body as BindProfileRequestDto;
    if (!payload?.level || !payload?.id || !payload?.profileId) {
      return res.status(400).json({ ok: false, error: 'level, id and profileId are required' });
    }

    return res.json(service.bindProfile(payload));
  });

  router.post('/dashboard/profile/unbind', (req, res) => {
    const payload = req.body as UnbindProfileRequestDto;
    if (!payload?.level || !payload?.id) {
      return res.status(400).json({ ok: false, error: 'level and id are required' });
    }

    return res.json(service.unbindProfile(payload));
  });

  router.post('/dashboard/profile/override', (req, res) => {
    const payload = req.body as ProfileOverrideRequestDto;
    if (!payload?.level || !payload?.id) {
      return res.status(400).json({ ok: false, error: 'level and id are required' });
    }

    return res.json(service.setProfileOverride(payload));
  });

  router.post('/dashboard/runtime/command', async (req, res) => {
    const payload = req.body as RuntimeCommandRequestDto;
    if (!payload?.level || !payload?.id || !payload?.action) {
      return res.status(400).json({ ok: false, error: 'level, id and action are required' });
    }

    try {
      const result = await service.executeRuntimeCommand(payload);
      // Always return 200 — the result.result.status field carries the operational outcome:
      //   'applied'               → action succeeded
      //   'unsupported_by_runtime'→ runtime does not support this action (expected, not an error)
      //   'rejected'              → runtime supported it but rejected the request (e.g. wrong state)
      // HTTP 4xx/5xx are reserved for request validation failures and unexpected server errors.
      return res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error executing runtime command';
      return res.status(500).json({
        ok: false,
        error: message,
        command: payload.action,
      });
    }
  });
}

