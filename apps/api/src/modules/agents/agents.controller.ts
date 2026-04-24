import { Router } from 'express';

import { AgentsService } from './agents.service';

export function registerAgentsRoutes(router: Router) {
  const service = new AgentsService();

  router.get('/agents', (req, res) => {
    let agents = service.findAll();
    const kind = req.query.kind as string | undefined;
    if (kind) {
      agents = agents.filter((a) => (a.kind ?? 'agent') === kind);
    }
    res.json(agents);
  });

  router.get('/agents/:id', (req, res) => {
    const item = service.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }
    return res.json(item);
  });

  router.get('/agents/:id/readiness', (req, res) => {
    const readiness = service.getReadiness(req.params.id);
    if (!readiness) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }
    return res.json(readiness);
  });

  router.post('/agents/:id/core-files/generate', (req, res) => {
    const generated = service.generateCoreFiles(req.params.id);
    if (!generated) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }
    return res.json(generated);
  });

  router.post('/agents', (req, res) => {
    try {
      res.status(201).json(service.create(req.body));
    } catch (error) {
      res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  router.put('/agents/:id', (req, res) => {
    try {
      const updated = service.update(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Agent not found' });
      }
      return res.json(updated);
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  router.patch('/agents/:id', (req, res) => {
    try {
      const updated = service.update(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Agent not found' });
      }
      return res.json(updated);
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  router.delete('/agents/:id', (req, res) => {
    const removed = service.remove(req.params.id);
    if (!removed) {
      return res.status(404).json({ ok: false, error: 'Agent not found' });
    }
    return res.status(204).send();
  });
}
