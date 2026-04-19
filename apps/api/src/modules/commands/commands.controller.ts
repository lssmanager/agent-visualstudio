import { Router } from 'express';

import { CommandsService } from './commands.service';

export function registerCommandsRoutes(router: Router) {
  const service = new CommandsService();

  router.get('/commands', (_req, res) => {
    res.json(service.findAll());
  });

  router.get('/commands/:id', (req, res) => {
    const command = service.findById(req.params.id);
    if (!command) {
      return res.status(404).json({ ok: false, error: 'Command not found' });
    }
    return res.json(command);
  });
}
