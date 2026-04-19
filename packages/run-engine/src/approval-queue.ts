export interface PendingApproval {
  runId: string;
  stepId: string;
  enqueuedAt: string;
}

/**
 * In-memory queue for approval nodes.
 * Steps waiting for human approval are parked here.
 */
export class ApprovalQueue {
  private readonly pending = new Map<string, PendingApproval>();

  enqueue(runId: string, stepId: string): void {
    const key = `${runId}:${stepId}`;
    this.pending.set(key, {
      runId,
      stepId,
      enqueuedAt: new Date().toISOString(),
    });
  }

  dequeue(runId: string, stepId: string): PendingApproval | null {
    const key = `${runId}:${stepId}`;
    const item = this.pending.get(key) ?? null;
    this.pending.delete(key);
    return item;
  }

  listPending(): PendingApproval[] {
    return Array.from(this.pending.values());
  }

  hasPending(runId: string, stepId: string): boolean {
    return this.pending.has(`${runId}:${stepId}`);
  }

  clear(): void {
    this.pending.clear();
  }
}
