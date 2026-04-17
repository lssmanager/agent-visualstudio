import { Router } from 'express';

import { WorkspacesCompiler } from './workspaces.compiler';
import { WorkspacesService } from './workspaces.service';

export function registerWorkspacesRoutes(router: Router) {
  const service = new WorkspacesService();
  const compiler = new WorkspacesCompiler();

  router.get('/workspaces/current', (_req, res) => {
    res.json(service.getCurrent());
  });

  router.post('/workspaces', (req, res) => {
    const { id, name, slug, profileId } = req.body as {
      id: string;
      name: string;
      slug: string;
      profileId?: string;
    };

    if (!id || !name || !slug) {
      return res.status(400).json({ message: 'id, name and slug are required' });
    }

    return res.status(201).json(service.createFromPreset({ id, name, slug, profileId }));
  });

  router.post('/workspaces/bootstrap', async (req, res) => {
    try {
      const { profileId, workspaceSpec } = req.body;

      if (!workspaceSpec) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'workspaceSpec is required',
        });
      }

      if (!workspaceSpec.name) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'workspaceSpec.name is required',
        });
      }

      const workspace = await service.bootstrap({ profileId, workspaceSpec });
      return res.status(201).json({
        workspaceSpec: workspace,
        created: true,
        message: profileId
          ? `Workspace bootstrapped from profile '${profileId}'`
          : 'Workspace created from specification',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        return res.status(404).json({
          error: 'PROFILE_NOT_FOUND',
          message: `Profile '${req.body.profileId}' not found in markdown catalog`,
          profileId: req.body.profileId,
          timestamp: new Date().toISOString(),
        });
      }
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid workspace specification',
        details: [message],
        timestamp: new Date().toISOString(),
      });
    }
  });

  router.put('/workspaces/current', (req, res) => {
    try {
      const updated = service.updateCurrent(req.body);
      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Workspace not found' });
      }
      return res.json(updated);
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  router.get('/workspaces/compile', async (_req, res) => {
    const result = await compiler.compileCurrent();
    res.json(result);
  });

  router.post('/compile', async (_req, res) => {
    const result = await compiler.compileCurrent();
    if (result.diagnostics.length > 0) {
      return res.status(422).json(result);
    }
    return res.json(result);
  });
}
