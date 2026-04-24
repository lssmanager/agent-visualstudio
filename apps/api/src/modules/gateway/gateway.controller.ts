import { Router } from 'express';

import { GatewayDiagnosticsService } from './gateway-diagnostics.service';
import { GatewayHealthService } from './gateway-health.service';
import { GatewayConnectionStatusService } from './gateway-connection-status.service';
import { GatewayService } from './gateway.service';

export function registerGatewayRoutes(router: Router) {
  const gatewayService = new GatewayService();
  const gatewayHealthService = new GatewayHealthService(gatewayService);
  const gatewayDiagnosticsService = new GatewayDiagnosticsService(gatewayService);
  const gatewayConnectionStatusService = new GatewayConnectionStatusService(gatewayService);

  router.get('/gateway/health', async (_req, res) => {
    res.json(await gatewayHealthService.getHealthSummary());
  });

  router.get('/gateway/diagnostics', async (_req, res) => {
    res.json(await gatewayDiagnosticsService.getDiagnosticsSummary());
  });

  router.get('/gateway/connection-status', async (req, res) => {
    const includeMasked =
      req.query.includeMasked === '1' ||
      req.query.includeMasked === 'true';
    res.json(await gatewayConnectionStatusService.getConnectionStatus(Boolean(includeMasked)));
  });

  router.get('/gateway/agents', async (_req, res) => {
    res.json(await gatewayService.listAgents());
  });

  router.get('/gateway/sessions', async (_req, res) => {
    res.json(await gatewayService.listSessions());
  });

  router.post('/gateway/call', async (req, res) => {
    const { method, params } = req.body as { method: string; params?: Record<string, unknown> };
    if (!method) {
      return res.status(400).json({ ok: false, error: 'method is required' });
    }
    return res.json(await gatewayService.call(method, params));
  });
}
