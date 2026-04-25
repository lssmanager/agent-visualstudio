import { Router } from 'express';

import { PoliciesService } from './policies.service';

export function registerPoliciesRoutes(router: Router) {
  const service = new PoliciesService();

  router.get('/policies', async (_req, res) => {
    res.json(await service.findAll());
  });

  router.get('/policies/:id', async (req, res) => {
    const item = await service.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ ok: false, error: 'Policy not found' });
    }
    return res.json(item);
  });

  router.post('/policies', async (req, res) => {
    try {
      return res.status(201).json(await service.create(req.body));
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  router.put('/policies/:id', async (req, res) => {
    try {
      const item = await service.update(req.params.id, req.body);
      if (!item) {
        return res.status(404).json({ ok: false, error: 'Policy not found' });
      }
      return res.json(item);
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  router.delete('/policies/:id', async (req, res) => {
    const removed = await service.remove(req.params.id);
    if (!removed) {
      return res.status(404).json({ ok: false, error: 'Policy not found' });
    }
    return res.status(204).send();
  });
}
