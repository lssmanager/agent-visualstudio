import { Router } from 'express';
import { VersionsService } from './versions.service';

const service = new VersionsService();

export function registerVersionsRoutes(router: Router) {
  // GET /versions — list all snapshots (metadata only)
  router.get('/versions', (_req, res) => {
    const snapshots = service.listSnapshots();
    res.json(snapshots);
  });

  // GET /versions/:id — full snapshot with specs
  router.get('/versions/:id', (req, res) => {
    const snapshot = service.getSnapshot(req.params.id);
    if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
    res.json(snapshot);
  });

  // POST /versions — create new snapshot
  router.post('/versions', (req, res) => {
    const { label } = req.body ?? {};
    const snapshot = service.createSnapshot(label);
    res.status(201).json(snapshot);
  });

  // GET /versions/:id/diff — diff snapshot vs current state
  router.get('/versions/:id/diff', (req, res) => {
    const diff = service.getDiff(req.params.id);
    if (!diff) return res.status(404).json({ error: 'Snapshot not found' });
    res.json(diff);
  });

  // POST /versions/:id/rollback — restore from snapshot
  router.post('/versions/:id/rollback', (req, res) => {
    const ok = service.rollback(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Snapshot not found' });
    res.json({ ok: true, message: `Rolled back to snapshot ${req.params.id}` });
  });

  // POST /versions/publish — create labeled published snapshot
  router.post('/versions/publish', (req, res) => {
    const { label, notes } = req.body ?? {};
    if (!label) return res.status(400).json({ error: 'Label is required' });
    const snapshot = service.publish(label, notes);
    res.status(201).json(snapshot);
  });

  // POST /import — import workspace data
  router.post('/import', (req, res) => {
    const { workspace, agents, flows, skills, policies } = req.body ?? {};
    if (!workspace) return res.status(400).json({ error: 'workspace is required' });
    const result = service.importWorkspace({
      workspace,
      agents: agents ?? [],
      flows: flows ?? [],
      skills: skills ?? [],
      policies: policies ?? [],
    });
    res.status(201).json(result);
  });
}
