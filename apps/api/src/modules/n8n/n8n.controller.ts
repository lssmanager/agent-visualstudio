/**
 * n8n.controller.ts
 * Endpoints REST para listar / disparar workflows de n8n desde el canvas.
 */

import { Router, Request, Response } from 'express';
import { N8nService } from './n8n.service';

const n8nService = new N8nService();

export function registerN8nRoutes(router: Router): void {
  // GET /n8n/health
  router.get('/n8n/health', async (_req: Request, res: Response) => {
    try {
      const ok = await n8nService.ping();
      res.json({ ok, timestamp: new Date().toISOString() });
    } catch (err: unknown) {
      res.status(502).json({ ok: false, error: String(err) });
    }
  });

  // GET /n8n/workflows
  router.get('/n8n/workflows', async (_req: Request, res: Response) => {
    try {
      const workflows = await n8nService.listWorkflows();
      res.json({ workflows });
    } catch (err: unknown) {
      res.status(502).json({ error: String(err) });
    }
  });

  // GET /n8n/workflows/:id
  router.get('/n8n/workflows/:id', async (req: Request, res: Response) => {
    try {
      const wf = await n8nService.getWorkflow(req.params.id);
      res.json({ workflow: wf });
    } catch (err: unknown) {
      res.status(502).json({ error: String(err) });
    }
  });

  // POST /n8n/workflows
  router.post('/n8n/workflows', async (req: Request, res: Response) => {
    try {
      const { name, nodes, connections } = req.body ?? {};
      if (!name) return res.status(400).json({ error: 'name required' });
      const wf = await n8nService.createWorkflow(name, nodes ?? [], connections ?? {});
      res.status(201).json({ workflow: wf });
    } catch (err: unknown) {
      res.status(502).json({ error: String(err) });
    }
  });

  // POST /n8n/workflows/:id/run
  router.post('/n8n/workflows/:id/run', async (req: Request, res: Response) => {
    try {
      const result = await n8nService.executeWorkflow(req.params.id, req.body?.inputData);
      res.json({ execution: result });
    } catch (err: unknown) {
      res.status(502).json({ error: String(err) });
    }
  });

  // POST /n8n/webhook  (proxy de webhook hacia n8n)
  router.post('/n8n/webhook', async (req: Request, res: Response) => {
    try {
      const { webhookUrl, method, body, headers, timeoutMs } = req.body ?? {};
      if (!webhookUrl) return res.status(400).json({ error: 'webhookUrl required' });
      const result = await n8nService.triggerWebhook({ webhookUrl, method, body, headers, timeoutMs });
      res.json({ result });
    } catch (err: unknown) {
      res.status(502).json({ error: String(err) });
    }
  });

  // GET /n8n/executions
  router.get('/n8n/executions', async (req: Request, res: Response) => {
    try {
      const executions = await n8nService.listExecutions(req.query.workflowId as string | undefined);
      res.json({ executions });
    } catch (err: unknown) {
      res.status(502).json({ error: String(err) });
    }
  });

  // GET /n8n/executions/:id
  router.get('/n8n/executions/:id', async (req: Request, res: Response) => {
    try {
      const execution = await n8nService.getExecution(req.params.id);
      res.json({ execution });
    } catch (err: unknown) {
      res.status(502).json({ error: String(err) });
    }
  });
}
