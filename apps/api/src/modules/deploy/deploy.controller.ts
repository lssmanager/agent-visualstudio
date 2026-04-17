import { Router } from 'express';

import { DeployableArtifact } from '../../../../../packages/core-types/src';
import { WorkspacesCompiler } from '../workspaces/workspaces.compiler';
import { DeployDiffService } from './deploy-diff.service';
import { DeployService } from './deploy.service';

export function registerDeployRoutes(router: Router) {
  const compiler = new WorkspacesCompiler();
  const diffService = new DeployDiffService();
  const deployService = new DeployService();

  router.get('/deploy/preview', async (_req, res) => {
    const compileResult = await compiler.compileCurrent();
    const diff = diffService.diffArtifacts(compileResult.artifacts);

    res.json({
      ...compileResult,
      diff,
    });
  });

  router.post('/deploy/apply', async (req, res) => {
    const provided = req.body as { artifacts?: DeployableArtifact[]; applyRuntime?: boolean };
    const compileResult = await compiler.compileCurrent();
    if (compileResult.diagnostics.length > 0) {
      return res.status(422).json({ ok: false, diagnostics: compileResult.diagnostics });
    }

    const artifacts = provided.artifacts ?? compileResult.artifacts;
    const writeResult = deployService.applyArtifacts(artifacts);
    const runtime = provided.applyRuntime ? await deployService.triggerRuntimeReload() : null;

    return res.json({ ok: true, writeResult, runtime });
  });
}
