import { Router } from 'express';

import { McpService } from './mcp.service';

export function registerMcpRoutes(router: Router) {
  const service = new McpService();

  // GET /mcp/servers
  router.get('/mcp/servers', (_req, res) => {
    res.json(service.findAll());
  });

  // POST /mcp/servers
  router.post('/mcp/servers', (req, res) => {
    try {
      const server = service.create(req.body);
      return res.status(201).json(server);
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  // DELETE /mcp/servers/:id
  router.delete('/mcp/servers/:id', (req, res) => {
    const removed = service.remove(req.params.id);
    if (!removed) {
      return res.status(404).json({ ok: false, error: 'MCP server not found' });
    }
    return res.status(204).send();
  });
}
