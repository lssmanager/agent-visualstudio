import { Router } from 'express';

import { workspaceStore } from '../../config'; // @deprecated(F0-08) — export-only bridge, keep DualFormatStore for file output

/**
 * POST /export — returns a JSON bundle of the entire workspace
 * (agents, flows, skills, policies, workspace config).
 * A ZIP-based export can be layered on top in P2.
 */
export function registerExportRoutes(router: Router) {
  router.post('/export', (_req, res) => {
    const workspace = workspaceStore.readWorkspace();
    if (!workspace) {
      return res.status(404).json({ ok: false, error: 'No workspace found' });
    }

    const bundle = {
      version: '1' as const,
      exportedAt: new Date().toISOString(),
      workspace,
      agents: workspaceStore.listAgents(),
      flows: workspaceStore.listFlows(),
      skills: workspaceStore.listSkills(),
      policies: workspaceStore.listPolicies(),
    };

    return res.json(bundle);
  });
}
