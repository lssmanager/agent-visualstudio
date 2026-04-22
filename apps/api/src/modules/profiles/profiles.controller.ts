import { Router } from 'express';

import { ProfilesService } from './profiles.service';

export function registerProfilesRoutes(router: Router) {
  const service = new ProfilesService();

  router.get('/profiles', async (_req, res) => {
    try {
      const profiles = await service.getAll();
      res.json(profiles);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: 'Failed to load profiles', details: message });
    }
  });

  router.get('/profiles/templates', (_req, res) => {
    res.json({
      status: 'planned',
      available: false,
      mode: 'read_only',
      decision: 'excluded_from_v1',
      message:
        'Templates catalog is explicitly out of V1 scope. Use profiles catalog + workspace bootstrap flows for now.',
      updatedAt: new Date().toISOString(),
    });
  });
}
