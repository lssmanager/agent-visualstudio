/**
 * run-queue.service.ts
 *
 * Async execution queue using BullMQ + Redis.
 * Patterns adapted from:
 *   - n8n WorkflowRunner / JobQueue
 *   - LangGraph task scheduling
 *   - Flowise IQueue
 *   - Hermes task-queue pattern
 *
 * Falls back gracefully to in-process execution when
 * REDIS_URL is not configured (dev/Docker-less environments).
 */
import { EventEmitter } from 'node:events';
import type { RunSpec, RunTrigger } from '../../../../../packages/core-types/src';
import { workspaceStore, studioConfig } from '../../config';
import { SseEmitterService } from './sse-emitter.service';

// ── BullMQ is optional — only imported when Redis is available ───────────────
type BullQueue = {
  add(name: string, data: unknown, opts?: unknown): Promise<{ id?: string | null }>;
  process?(concurrency: number, handler: (job: { data: unknown }) => Promise<void>): void;
  close(): Promise<void>;
};

let Queue: (new (name: string, opts: unknown) => BullQueue) | null = null;
let Worker: (new (name: string, handler: (job: { data: unknown; id?: string }) => Promise<void>, opts: unknown) => { close(): Promise<void> }) | null = null;

try {
  // Dynamic import so the API boots without Redis installed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bullmq = require('bullmq') as typeof import('bullmq');
  Queue = bullmq.Queue as unknown as typeof Queue;
  Worker = bullmq.Worker as unknown as typeof Worker;
} catch {
  // BullMQ not installed — use in-process fallback
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface RunJobData {
  runId: string;
  flowId: string;
  trigger: RunTrigger;
  workspaceId: string;
  /**
   * Optional checkpoint to resume from (LangGraph-like durable execution).
   * When present, the executor will skip already-completed steps.
   */
  resumeFromCheckpoint?: string;
}

export type RunJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface RunJobMeta {
  jobId: string;
  runId: string;
  status: RunJobStatus;
  enqueuedAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  attempt: number;
};

// ── Queue name constant ──────────────────────────────────────────────────────
const QUEUE_NAME = 'studio:runs';

// ── In-process fallback (no Redis) ──────────────────────────────────────────
class InProcessFallback {
  private readonly bus = new EventEmitter();

  enqueue(data: RunJobData, onProcess: (data: RunJobData) => Promise<void>): string {
    const jobId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Run asynchronously after current tick
    setImmediate(() => {
      onProcess(data).catch((err: Error) => {
        this.bus.emit('job:failed', { jobId, runId: data.runId, error: err.message });
      });
    });
    return jobId;
  }

  on(event: string, listener: (...args: unknown[]) => void) {
    this.bus.on(event, listener);
  }
}

// ── RunQueueService ──────────────────────────────────────────────────────────

export class RunQueueService {
  private queue: BullQueue | null = null;
  private worker: { close(): Promise<void> } | null = null;
  private readonly fallback = new InProcessFallback();
  private readonly jobMeta = new Map<string, RunJobMeta>();
  private readonly sse: SseEmitterService;

  /** Concurrency: how many runs execute in parallel */
  private readonly concurrency: number;

  constructor(sse: SseEmitterService, concurrency = 3) {
    this.sse = sse;
    this.concurrency = concurrency;
    this._initBullMQ();
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  private _initBullMQ() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl || !Queue || !Worker) {
      console.info('[RunQueue] Redis not configured — using in-process fallback');
      return;
    }

    try {
      const connection = { url: redisUrl };

      this.queue = new Queue(QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 200 },
        },
      });

      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => {
          const data = job.data as RunJobData;
          await this._processJob(data, job.id ?? data.runId);
        },
        { connection, concurrency: this.concurrency },
      );

      console.info(`[RunQueue] BullMQ queue "${QUEUE_NAME}" ready (concurrency=${this.concurrency})`);
    } catch (err) {
      console.warn('[RunQueue] BullMQ init failed — falling back to in-process:', err);
      this.queue = null;
      this.worker = null;
    }
  }

  // ── Enqueue ───────────────────────────────────────────────────────────────

  /**
   * Enqueue a run for async execution.
   * Returns a jobId that can be used to poll status.
   *
   * Inspired by:
   *   - n8n: WorkflowRunner.run() → JobQueue.add()
   *   - Flowise: IQueue.enqueue()
   *   - Hermes: TaskQueue.push()
   */
  async enqueueRun(data: RunJobData): Promise<string> {
    const enqueuedAt = new Date().toISOString();

    if (this.queue) {
      const job = await this.queue.add('run:execute', data, {
        jobId: `run-${data.runId}`,
        priority: 1,
      });
      const jobId = job.id ?? `run-${data.runId}`;
      this._trackJob(jobId, data.runId, enqueuedAt);
      this.sse.emit(data.runId, { event: 'queued', jobId, enqueuedAt });
      return jobId;
    }

    // In-process fallback
    const jobId = this.fallback.enqueue(data, (d) => this._processJob(d, `local-${d.runId}`));
    this._trackJob(jobId, data.runId, enqueuedAt);
    this.sse.emit(data.runId, { event: 'queued', jobId, enqueuedAt });
    return jobId;
  }

  // ── Job processing ────────────────────────────────────────────────────────

  /**
   * Core processing logic — called by worker OR in-process fallback.
   *
   * Orchestration pattern inspired by:
   *   - LangGraph: CompiledGraph.invoke() with checkpoint
   *   - CrewAI: Crew.kickoff() task loop
   *   - AutoGen: GroupChatManager.run()
   *   - Flowise: IAgentFlow.run()
   */
  private async _processJob(data: RunJobData, jobId: string): Promise<void> {
    const meta = this.jobMeta.get(jobId);
    const startedAt = new Date().toISOString();

    if (meta) {
      meta.status = 'processing';
      meta.startedAt = startedAt;
      meta.attempt += 1;
    }

    this.sse.emit(data.runId, { event: 'started', jobId, startedAt, attempt: meta?.attempt ?? 1 });

    try {
      // Dynamically import the executor to avoid circular deps at module load
      const { AgentExecutorService } = await import('./agent-executor.service');
      const executor = new AgentExecutorService(this.sse);

      const run = await executor.executeRun(data);

      const completedAt = new Date().toISOString();
      if (meta) {
        meta.status = run.status === 'failed' ? 'failed' : 'completed';
        meta.completedAt = completedAt;
      }

      this.sse.emit(data.runId, {
        event: run.status === 'failed' ? 'failed' : 'completed',
        jobId,
        completedAt,
        status: run.status,
      });
    } catch (err) {
      const error = (err as Error).message;
      const completedAt = new Date().toISOString();

      if (meta) {
        meta.status = 'failed';
        meta.completedAt = completedAt;
        meta.error = error;
      }

      this.sse.emit(data.runId, { event: 'error', jobId, error, completedAt });
      throw err; // Re-throw so BullMQ triggers retry
    }
  }

  // ── Job tracking ──────────────────────────────────────────────────────────

  private _trackJob(jobId: string, runId: string, enqueuedAt: string) {
    this.jobMeta.set(jobId, {
      jobId,
      runId,
      status: 'queued',
      enqueuedAt,
      attempt: 0,
    });
  }

  getJobMeta(jobId: string): RunJobMeta | undefined {
    return this.jobMeta.get(jobId);
  }

  getJobMetaByRunId(runId: string): RunJobMeta | undefined {
    return Array.from(this.jobMeta.values()).find((m) => m.runId === runId);
  }

  // ── Graceful shutdown ─────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
