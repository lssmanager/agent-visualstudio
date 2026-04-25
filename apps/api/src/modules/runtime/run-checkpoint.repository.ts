/**
 * run-checkpoint.repository.ts
 *
 * Durable checkpoint storage for run resumption.
 *
 * Directly inspired by LangGraph's PostgresSaver / MemorySaver pattern:
 *   - Save a snapshot of RunSpec after each step
 *   - Load snapshot to skip already-completed steps on retry/resume
 *   - Works with JSON files on disk (matches existing RunRepository pattern)
 *   - Designed to swap to Prisma/PostgreSQL when DB is wired
 *
 * References:
 *   - LangGraph: langgraph/checkpoint/postgres.py (PostgresSaver.put/get)
 *   - LangGraph: langgraph/checkpoint/memory.py (MemorySaver)
 *   - n8n: ExecutionRepository.save() + findById()
 *   - Flowise: IExecutionEntity checkpoint
 */
import fs from 'node:fs';
import path from 'node:path';
import type { RunSpec } from '../../../../../packages/core-types/src';

export interface RunCheckpoint {
  runId: string;
  runSnapshot: RunSpec;
  completedStepIds: string[];
  savedAt: string;
  /** LangGraph-compatible: thread_ts / checkpoint_ns equivalents */
  threadTs?: string;
  checkpointNs?: string;
}

export class RunCheckpointRepository {
  private readonly checkpointDir: string;

  constructor(workspaceRoot: string) {
    this.checkpointDir = path.join(workspaceRoot, '.data', 'checkpoints');
    this._ensureDir();
  }

  /**
   * Persist a checkpoint after a step completes.
   * Equivalent to LangGraph PostgresSaver.put(config, checkpoint, metadata)
   */
  async saveCheckpoint(checkpoint: RunCheckpoint): Promise<void> {
    const filePath = this._checkpointPath(checkpoint.runId);
    const enriched: RunCheckpoint = {
      ...checkpoint,
      threadTs: new Date().toISOString(),
      checkpointNs: `run:${checkpoint.runId}`,
    };
    await fs.promises.writeFile(filePath, JSON.stringify(enriched, null, 2), 'utf-8');
  }

  /**
   * Load the latest checkpoint for a run.
   * Equivalent to LangGraph PostgresSaver.get(config)
   */
  async loadCheckpoint(runId: string): Promise<RunCheckpoint | null> {
    const filePath = this._checkpointPath(runId);
    try {
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as RunCheckpoint;
    } catch {
      return null;
    }
  }

  /**
   * Delete checkpoint after successful completion.
   * Equivalent to LangGraph cleanup after graph exit.
   */
  async deleteCheckpoint(runId: string): Promise<void> {
    const filePath = this._checkpointPath(runId);
    await fs.promises.unlink(filePath).catch(() => undefined);
  }

  /**
   * List all checkpoints (for admin/debug views).
   * Equivalent to LangGraph PostgresSaver.list(config)
   */
  async listCheckpoints(): Promise<Array<{ runId: string; savedAt: string; completedSteps: number }>> {
    try {
      const files = await fs.promises.readdir(this.checkpointDir);
      const results: Array<{ runId: string; savedAt: string; completedSteps: number }> = [];

      for (const file of files.filter((f) => f.endsWith('.checkpoint.json'))) {
        try {
          const raw = await fs.promises.readFile(path.join(this.checkpointDir, file), 'utf-8');
          const cp = JSON.parse(raw) as RunCheckpoint;
          results.push({
            runId: cp.runId,
            savedAt: cp.savedAt,
            completedSteps: cp.completedStepIds.length,
          });
        } catch {
          // Skip corrupted checkpoints
        }
      }

      return results.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    } catch {
      return [];
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _checkpointPath(runId: string): string {
    // Sanitize runId to prevent path traversal
    const safe = runId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.checkpointDir, `${safe}.checkpoint.json`);
  }

  private _ensureDir(): void {
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true });
    }
  }
}
