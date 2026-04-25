/**
 * n8n.controller.ts
 * Registers /n8n/* routes following the register*Routes pattern used
 * throughout the codebase (see routes.ts).
 */

import type { Router, Request, Response } from 'express';
import { N8nService } from './n8n.service';
import { FlowsService } from '../flows/flows.service';

const n8nService   = new N8nService();
const flowsService = new FlowsService();

export function registerN8nRoutes(router: Router): void {

  // ── Workflow CRUD ──────────────────────────────────────────────────────────

  // GET /n8n/workflows
  router.get('/n8n/workflows', async (_req: Request, res: Response) => {
    try {
      const workflows = await n8nService.listWorkflows();
      res.json(workflows);
    } catch (err: unknown) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // GET /n8n/workflows/:workflowId
  router.get('/n8n/workflows/:workflowId', async (req: Request, res: Response) => {
    try {
      const workflow = await n8nService.getWorkflow(req.params.workflowId);
      res.json(workflow);
    } catch (err: unknown) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // POST /n8n/sync-flow/:flowId
  // Converts a FlowSpec canvas to an n8n workflow and creates/updates it.
  router.post('/n8n/sync-flow/:flowId', async (req: Request, res: Response) => {
    try {
      const flow = flowsService.findById(req.params.flowId);
      if (!flow) { res.status(404).json({ error: 'Flow not found' }); return; }

      const { workflowId } = req.body as { workflowId?: string };
      const result = workflowId
        ? await n8nService.updateWorkflowFromFlow(flow, workflowId)
        : await n8nService.createWorkflowFromFlow(flow);

      res.status(workflowId ? 200 : 201).json(result);
    } catch (err: unknown) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // POST /n8n/workflows/:workflowId/activate
  router.post('/n8n/workflows/:workflowId/activate', async (req: Request, res: Response) => {
    try {
      await n8nService.activateWorkflow(req.params.workflowId);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // POST /n8n/workflows/:workflowId/deactivate
  router.post('/n8n/workflows/:workflowId/deactivate', async (req: Request, res: Response) => {
    try {
      await n8nService.deactivateWorkflow(req.params.workflowId);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // ── Webhooks ───────────────────────────────────────────────────────────────

  // POST /n8n/webhooks/:path(*)
  router.post('/n8n/webhooks/:path(*)', async (req: Request, res: Response) => {
    try {
      const webhookPath = `/${req.params.path}`;
      const result = await n8nService.triggerWebhook(webhookPath, req.body as Record<string, unknown>, 'POST');
      res.json(result);
    } catch (err: unknown) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // GET /n8n/webhooks/:path(*)
  router.get('/n8n/webhooks/:path(*)', async (req: Request, res: Response) => {
    try {
      const webhookPath = `/${req.params.path}`;
      const result = await n8nService.triggerWebhook(webhookPath, req.query as Record<string, unknown>, 'GET');
      res.json(result);
    } catch (err: unknown) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // ── Executions ─────────────────────────────────────────────────────────────

  // GET /n8n/executions?workflowId=xxx
  router.get('/n8n/executions', async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.query as { workflowId?: string };
      const executions = await n8nService.listExecutions(workflowId);
      res.json(executions);
    } catch (err: unknown) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // GET /n8n/executions/:executionId
  router.get('/n8n/executions/:executionId', async (req: Request, res: Response) => {
    try {
      const execution = await n8nService.getExecution(req.params.executionId);
      res.json(execution);
    } catch (err: unknown) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // ── Node-ID cross-reference ────────────────────────────────────────────────

  // GET /n8n/node-map/:flowId
  router.get('/n8n/node-map/:flowId', (req: Request, res: Response) => {
    const flow = flowsService.findById(req.params.flowId);
    if (!flow) { res.status(404).json({ error: 'Flow not found' }); return; }
    const map = n8nService.getNodeIdMap(flow);
    res.json(Object.fromEntries(map));
  });
}
