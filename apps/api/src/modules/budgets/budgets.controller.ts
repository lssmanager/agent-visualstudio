import { Router } from 'express';

import { BudgetsService } from './budgets.service';

export function registerBudgetsRoutes(router: Router) {
  const service = new BudgetsService();

  // GET /budgets
  router.get('/budgets', (_req, res) => {
    res.json(service.findAll());
  });

  // POST /budgets
  router.post('/budgets', (req, res) => {
    try {
      const budget = service.create(req.body);
      return res.status(201).json(budget);
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  // PUT /budgets/:id
  router.put('/budgets/:id', (req, res) => {
    const budget = service.update(req.params.id, req.body);
    if (!budget) {
      return res.status(404).json({ ok: false, error: 'Budget not found' });
    }
    return res.json(budget);
  });
}
