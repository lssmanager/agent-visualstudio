import { Router } from 'express';

import { HooksService } from './hooks.service';

export function registerHooksRoutes(router: Router) {
  const service = new HooksService();

  // GET /hooks
  router.get('/hooks', (_req, res) => {
    res.json(service.findAll());
  });

  // GET /hooks/:id
  router.get('/hooks/:id', (req, res) => {
    const hook = service.findById(req.params.id);
    if (!hook) {
      return res.status(404).json({ ok: false, error: 'Hook not found' });
    }
    return res.json(hook);
  });

  // POST /hooks
  router.post('/hooks', (req, res) => {
    try {
      const hook = service.create(req.body);
      return res.status(201).json(hook);
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  // PUT /hooks/:id
  router.put('/hooks/:id', (req, res) => {
    const hook = service.update(req.params.id, req.body);
    if (!hook) {
      return res.status(404).json({ ok: false, error: 'Hook not found' });
    }
    return res.json(hook);
  });

  // DELETE /hooks/:id
  router.delete('/hooks/:id', (req, res) => {
    const removed = service.remove(req.params.id);
    if (!removed) {
      return res.status(404).json({ ok: false, error: 'Hook not found' });
    }
    return res.status(204).send();
  });
}
