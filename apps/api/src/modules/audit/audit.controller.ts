import { Router } from 'express';

import { AuditService } from './audit.service';

export function registerAuditRoutes(router: Router) {
  const service = new AuditService();

  // GET /audit?resource=&action=&from=&to=
  router.get('/audit', (req, res) => {
    const entries = service.query({
      resource: req.query.resource as string | undefined,
      action: req.query.action as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(entries);
  });
}
