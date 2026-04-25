import { Router, Request, Response } from 'express';
import type { N8nWebhookPayload, N8nWebhookResponse } from './n8n.types';
import { N8nWorkflowService } from './n8n-workflow.service';

/**
 * Registers n8n integration routes under /n8n/.
 *
 * Routes:
 *  POST /n8n/webhook           — receive inbound events from n8n
 *  GET  /n8n/workflows         — list available n8n workflows (proxy to n8n API)
 *  POST /n8n/workflows/trigger — trigger an n8n workflow from Studio
 */
export function registerN8nRoutes(router: Router): void {
  const workflowService = new N8nWorkflowService();

  /**
   * POST /n8n/webhook
   *
   * Called by n8n Webhook nodes to push events into Studio.
   * The n8n workflow should POST a JSON body matching N8nWebhookPayload.
   *
   * Example n8n Webhook node configuration:
   *   Method: POST
   *   Path:   /api/studio/v1/n8n/webhook
   *   Auth:   Header — Authorization: Bearer <STUDIO_WEBHOOK_SECRET>
   *
   * The shared secret is read from the N8N_WEBHOOK_SECRET environment variable.
   * Requests without a matching Bearer token are rejected with HTTP 401.
   */
  router.post('/n8n/webhook', async (req: Request, res: Response) => {
    // Verify the shared webhook secret when configured.
    const expectedSecret = process.env.N8N_WEBHOOK_SECRET;
    if (expectedSecret) {
      const authHeader = req.headers['authorization'] ?? '';
      const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : '';
      if (token !== expectedSecret) {
        return res.status(401).json({ ok: false, message: 'Unauthorized: invalid or missing webhook secret' });
      }
    }

    const body = req.body as N8nWebhookPayload;

    if (!body?.workflowId || !body?.target?.type || !body?.target?.id) {
      const response: N8nWebhookResponse = {
        ok: false,
        message: 'Invalid webhook payload: workflowId, target.type, and target.id are required',
      };
      return res.status(400).json(response);
    }

    try {
      const result = await workflowService.handleInboundWebhook(body);
      return res.status(200).json(result);
    } catch (error) {
      const response: N8nWebhookResponse = {
        ok: false,
        message: `Webhook processing failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      return res.status(500).json(response);
    }
  });

  /**
   * GET /n8n/workflows
   *
   * Proxies a listing request to the configured n8n instance.
   * Requires N8N_BASE_URL and N8N_API_KEY environment variables.
   */
  router.get('/n8n/workflows', async (_req: Request, res: Response) => {
    try {
      const workflows = await workflowService.listWorkflows();
      return res.json({ ok: true, workflows });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        message: `Failed to fetch n8n workflows: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });

  /**
   * POST /n8n/workflows/trigger
   *
   * Trigger an n8n workflow from Studio.
   * Body: { workflowId: string, data: Record<string, unknown> }
   */
  router.post('/n8n/workflows/trigger', async (req: Request, res: Response) => {
    const { workflowId, data } = req.body ?? {};

    if (!workflowId) {
      return res.status(400).json({ ok: false, message: 'workflowId is required' });
    }

    try {
      const result = await workflowService.triggerWorkflow(workflowId, data ?? {});
      return res.status(200).json(result);
    } catch (error) {
      return res.status(502).json({
        ok: false,
        message: `Failed to trigger n8n workflow: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });
}
