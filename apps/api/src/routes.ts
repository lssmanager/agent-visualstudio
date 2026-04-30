import { Express, Router } from 'express';

import { studioConfig } from './config';
import { prisma } from './modules/core/db/prisma.service';
import { registerAgentsRoutes } from './modules/agents/agents.controller';
import { registerChannelsRoutes } from './modules/channels/channels.controller';
import { registerDeployRoutes } from './modules/deploy/deploy.controller';
import { registerFlowsRoutes } from './modules/flows/flows.controller';
import { registerGatewayRoutes } from './modules/gateway/gateway.controller';
import { registerPoliciesRoutes } from './modules/policies/policies.controller';
import { registerProfilesRoutes } from './modules/profiles/profiles.controller';
import { registerRoutinesRoutes } from './modules/routines/routines.controller';
import { registerRoutingRoutes } from './modules/routing/routing.controller';
import { registerSkillsRoutes } from './modules/skills/skills.controller';
import { registerStudioRoutes } from './modules/studio/studio.controller';
import { registerWorkspacesRoutes } from './modules/workspaces/workspaces.controller';
import { registerConfigRoutes } from './modules/config/config.controller';
import { registerCommandsRoutes } from './modules/commands/commands.controller';
import { registerExportRoutes } from './modules/export/export.controller';
import { registerRunsRoutes } from './modules/runs/runs.controller';
import { registerHooksRoutes } from './modules/hooks/hooks.controller';
import { registerAuditRoutes } from './modules/audit/audit.controller';
import { registerBudgetsRoutes } from './modules/budgets/budgets.controller';
import { registerMcpRoutes } from './modules/mcp/mcp.controller';
import { registerVersionsRoutes } from './modules/versions/versions.controller';
import { registerTopologyRoutes } from './modules/topology/topology.controller';
import { registerCorefilesRoutes } from './modules/corefiles/corefiles.controller';
import { registerBuilderAgentRoutes } from './modules/builder-agent/builder-agent.controller';
import { registerRuntimeInspectionRoutes } from './modules/runtime/runtime-inspection.controller';
import { registerRunsStreamRoutes } from './modules/runtime/runs-stream.controller';
import { registerDashboardRoutes } from './modules/dashboard/dashboard.controller';
import { registerLlmProvidersRoutes } from './modules/llm-providers/llm-providers.controller';
import { registerCatalogRoutes } from './modules/catalog/catalog.controller';
import { registerSettingsRoutes } from './modules/settings/settings.controller';

export function registerRoutes(app: Express) {
  const router = Router();

  router.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'openclaw-studio-api', timestamp: new Date().toISOString() });
  });

  registerStudioRoutes(router);
  registerWorkspacesRoutes(router);
  registerAgentsRoutes(router);
  registerSkillsRoutes(router);
  registerFlowsRoutes(router);
  registerPoliciesRoutes(router);
  registerProfilesRoutes(router);
  registerProfilesRoutes(router);
  registerRoutinesRoutes(router);
  registerRoutingRoutes(router);
  registerDeployRoutes(router);
  registerGatewayRoutes(router);
  registerChannelsRoutes(router);
  registerConfigRoutes(router);
  registerCommandsRoutes(router);
  registerExportRoutes(router);
  registerRunsRoutes(router);
  registerHooksRoutes(router);
  registerAuditRoutes(router);
  registerBudgetsRoutes(router);
  registerMcpRoutes(router);
  registerVersionsRoutes(router);
  registerTopologyRoutes(router);
  registerCorefilesRoutes(router);
  registerBuilderAgentRoutes(router);
  registerRuntimeInspectionRoutes(router);
  registerRunsStreamRoutes(router);
  registerDashboardRoutes(router, prisma);
  // LLM Providers + OAuth
  registerLlmProvidersRoutes(router);
  // Model Catalog (ModelCatalogEntry + ProviderCredential sync)
  registerCatalogRoutes(router);
  // Settings: API keys de providers LLM + conexión n8n
  registerSettingsRoutes(router);

  app.use(studioConfig.apiPrefix, router);
}
