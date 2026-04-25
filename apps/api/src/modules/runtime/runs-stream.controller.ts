/**
 * runs-stream.controller.ts
 *
 * Registers SSE streaming and async-enqueue routes.
 * Import and register this alongside registerRunsRoutes().
 *
 * New routes added:
 *   GET  /runs/:id/stream       — SSE stream for real-time run updates
 *   POST /runs/:id/enqueue      — Enqueue run for async execution
 *   GET  /runs/jobs/:jobId      — Poll job status
 *   GET  /checkpoints           — List all durable checkpoints
 *   DEL  /checkpoints/:runId    — Delete a checkpoint
 */
import { Router } from 'express';
import { sseEmitter } from './sse-emitter.service';
import { RunQueueService, RunJobData } from './run-queue.service';
import { RunCheckpointRepository } from './run-checkpoint.repository';
import { workspaceStore, studioConfig } from '../../config';

// Singletons — one queue and checkpoint repo per API process
const queue = new RunQueueService(sseEmitter);
const checkpoints = new RunCheckpointRepository(studioConfig.workspaceRoot);

export function registerRunsStreamRoutes(router: Router) {

  // ── SSE: GET /runs/:id/stream ──────────────────────────────────────────
  // Flowise-style: GET /prediction/:id/stream
  // n8n-style:     GET /executions/:id/stream
  router.get('/runs/:id/stream', (req, res) => {
    sseEmitter.streamHandler(req, res);
  });

  // ── Async enqueue: POST /runs/:id/enqueue ─────────────────────────────
  // Instead of running synchronously inside the HTTP handler,
  // offload to BullMQ/in-process queue and return immediately.
  router.post('/runs/:id/enqueue', async (req, res) => {
    try {
      const runId = req.params.id;
      const { flowId, trigger, resumeFromCheckpoint } = req.body as Partial<RunJobData>;

      if (!flowId) {
        return res.status(400).json({ ok: false, error: 'flowId is required' });
      }

      const workspace = workspaceStore.readWorkspace?.();
      const workspaceId = (workspace as { id?: string } | null)?.id ?? 'default';

      const jobId = await queue.enqueueRun({
        runId,
        flowId,
        trigger: trigger ?? { type: 'manual' },
        workspaceId,
        resumeFromCheckpoint,
      });

      return res.status(202).json({
        ok: true,
        jobId,
        runId,
        streamUrl: `${studioConfig.apiPrefix}/runs/${runId}/stream`,
      });
    } catch (err) {
      return res.status(422).json({ ok: false, error: (err as Error).message });
    }
  });

  // ── Job status poll: GET /runs/jobs/:jobId ────────────────────────────
  router.get('/runs/jobs/:jobId', (req, res) => {
    const meta = queue.getJobMeta(req.params.jobId);
    if (!meta) {
      return res.status(404).json({ ok: false, error: 'Job not found' });
    }
    return res.json({ ok: true, ...meta });
  });

  // ── Checkpoints: GET /checkpoints ─────────────────────────────────────
  router.get('/checkpoints', async (_req, res) => {
    const list = await checkpoints.listCheckpoints();
    return res.json({ ok: true, checkpoints: list });
  });

  // ── Delete checkpoint: DELETE /checkpoints/:runId ─────────────────────
  router.delete('/checkpoints/:runId', async (req, res) => {
    await checkpoints.deleteCheckpoint(req.params.runId);
    return res.json({ ok: true });
  });

  // ── Load checkpoint: GET /checkpoints/:runId ──────────────────────────
  router.get('/checkpoints/:runId', async (req, res) => {
    const cp = await checkpoints.loadCheckpoint(req.params.runId);
    if (!cp) {
      return res.status(404).json({ ok: false, error: 'Checkpoint not found' });
    }
    return res.json({ ok: true, checkpoint: cp });
  });
}
