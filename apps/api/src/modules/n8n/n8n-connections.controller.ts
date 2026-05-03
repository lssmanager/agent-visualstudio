/**
 * n8n-connections.controller.ts
 *
 * GET    /n8n/connections          → listar todas
 * POST   /n8n/connections          → crear
 * GET    /n8n/connections/:id      → obtener por id
 * PATCH  /n8n/connections/:id      → actualizar (partial)
 * DELETE /n8n/connections/:id      → eliminar
 * POST   /n8n/connections/:id/test → probar conectividad
 */

import type { Router, Request, Response } from 'express';
import { N8nConnectionsService }           from './n8n-connections.service';

const connectionsService = new N8nConnectionsService();

export function registerN8nConnectionRoutes(router: Router): void {

  // GET /n8n/connections
  router.get('/n8n/connections', async (_req: Request, res: Response) => {
    try {
      res.json(await connectionsService.list());
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /n8n/connections/:id
  router.get('/n8n/connections/:id', async (req: Request, res: Response) => {
    try {
      const conn = await connectionsService.findById(req.params.id);
      if (!conn) {
        res.status(404).json({ error: 'N8nConnection not found' });
        return;
      }
      res.json(conn);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // POST /n8n/connections
  router.post('/n8n/connections', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        name?: string;
        baseUrl?: string;
        apiKey?: string;
        isActive?: boolean;
      };
      if (!body.name || !body.baseUrl || !body.apiKey) {
        res.status(400).json({ error: 'name, baseUrl y apiKey son requeridos' });
        return;
      }
      const conn = await connectionsService.create({
        name:     body.name,
        baseUrl:  body.baseUrl,
        apiKey:   body.apiKey,
        isActive: body.isActive,
      });
      res.status(201).json(conn);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // PATCH /n8n/connections/:id
  router.patch('/n8n/connections/:id', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        name?: string;
        baseUrl?: string;
        apiKey?: string;
        isActive?: boolean;
      };
      const conn = await connectionsService.update(req.params.id, body);
      if (!conn) {
        res.status(404).json({ error: 'N8nConnection not found' });
        return;
      }
      res.json(conn);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // DELETE /n8n/connections/:id
  router.delete('/n8n/connections/:id', async (req: Request, res: Response) => {
    try {
      const deleted = await connectionsService.delete(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'N8nConnection not found' });
        return;
      }
      res.status(204).send();
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // POST /n8n/connections/:id/test
  router.post(
    '/n8n/connections/:id/test',
    async (req: Request, res: Response) => {
      try {
        const result = await connectionsService.testConnection(req.params.id);
        res.status(result.ok ? 200 : 502).json(result);
      } catch (err: unknown) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );
}
