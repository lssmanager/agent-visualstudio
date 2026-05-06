import type { RunSpec } from '../../core-types/src';
import type { IRunRepository } from './flow-executor';

/**
 * In-memory implementation of IRunRepository.
 *
 * Used during testing or when Prisma is not available.
 * Each save() deep-clones the RunSpec to prevent aliasing bugs.
 */
export class InMemoryRunRepository implements IRunRepository {
  private readonly store = new Map<string, RunSpec>();

  /** Persist (or overwrite) a run. Deep-clones to prevent aliasing. */
  save(run: RunSpec): void {
    this.store.set(run.id, structuredClone(run));
  }

  /** Return a deep-cloned snapshot of the run, or null if not found. */
  findById(runId: string): RunSpec | null {
    const run = this.store.get(runId);
    return run ? structuredClone(run) : null;
  }

  /**
   * Return all stored runs (deep-cloned).
   * Used by AgentExecutor after execution to iterate steps for Prisma sync.
   */
  getAll(): RunSpec[] {
    return Array.from(this.store.values()).map((r) => structuredClone(r));
  }

  /** Number of runs currently stored. */
  get size(): number {
    return this.store.size;
  }

  /** Clear all stored runs (useful between tests). */
  clear(): void {
    this.store.clear();
  }
}
