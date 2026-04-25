import { Router } from 'express';

import { SkillsService } from './skills.service';

export function registerSkillsRoutes(router: Router) {
  const service = new SkillsService();

  router.get('/skills', async (_req, res) => {
    res.json(await service.findAll());
  });

  router.get('/skills/:id', async (req, res) => {
    const item = await service.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ ok: false, error: 'Skill not found' });
    }
    return res.json(item);
  });

  router.post('/skills', async (req, res) => {
    try {
      return res.status(201).json(await service.create(req.body));
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  router.put('/skills/:id', async (req, res) => {
    try {
      const item = await service.update(req.params.id, req.body);
      if (!item) {
        return res.status(404).json({ ok: false, error: 'Skill not found' });
      }
      return res.json(item);
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  router.delete('/skills/:id', async (req, res) => {
    const removed = await service.remove(req.params.id);
    if (!removed) {
      return res.status(404).json({ ok: false, error: 'Skill not found' });
    }
    return res.status(204).send();
  });
}
