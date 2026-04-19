import { Router } from 'express';

import { EffectiveConfigService } from './effective-config.service';

export function registerConfigRoutes(router: Router) {
  const service = new EffectiveConfigService();

  router.get('/config/effective', (_req, res) => {
    const config = service.resolveForWorkspace();
    if (!config) {
      return res.status(404).json({ ok: false, error: 'No workspace found' });
    }
    return res.json(config);
  });

  router.get('/config/effective/:agentId', async (req, res) => {
    try {
      const config = await service.resolveForAgent(req.params.agentId);
      if (!config) {
        return res.status(404).json({ ok: false, error: 'Agent or workspace not found' });
      }
      return res.json(config);
    } catch (error) {
      return res.status(500).json({ ok: false, error: (error as Error).message });
    }
  });
}
