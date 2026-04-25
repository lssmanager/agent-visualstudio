import { Router } from 'express';

import { AgentsService } from './agents.service';

export function registerAgentsRoutes(router: Router) {
  const service = new AgentsService();

  router.get('/agents', async (req, res) => {
    let agents = await service.findAll();
    const kind = req.query.kind as string | undefined;
    if (kind) {
      agents = agents.filter((a) => (a.kind ?? 'agent') === kind);
    }
    res.json(agents);
  });

  router.get('/agents/:id', async (req, res) => {
    const item = await service.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }
    return res.json(item);
  });

  router.post('/agents', async (req, res) => {
    try {
      res.status(201).json(await service.create(req.body));
    } catch (error) {
      res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  router.put('/agents/:id', async (req, res) => {
    try {
      const updated = await service.update(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Agent not found' });
      }
      return res.json(updated);
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  router.delete('/agents/:id', async (req, res) => {
    const removed = await service.remove(req.params.id);
    if (!removed) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }
    return res.status(204).send();
  });
}
