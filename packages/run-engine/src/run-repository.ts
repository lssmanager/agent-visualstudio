/**
 * run-repository.ts — Prisma-backed Run persistence
 *
 * Fix B: Added findRunById, findRunsByWorkspace, cancelRun, createRun (with
 * inputData/metadata/flowId fields) to satisfy RunsService, hierarchy-orchestrator
 * and agent-executor.service without patching those consumers.
 */
import type { PrismaClient, Prisma } from '@prisma/client';
import type { RunSpec, RunStepSpec } from '../../core-types/src';

export interface CreateRunInput {
  workspaceId: string;
  agentId?:    string | null;
  sessionId?:  string | null;
  channelKind?: string | null;
  trigger?:    Record<string, unknown>;
  context?:    Record<string, unknown>;
  flowId?:     string | null;
  /** Used by RunsService.startRun */
  inputData?:  Record<string, unknown>;
  /** Used by RunsService.startRun */
  metadata?:   Record<string, unknown>;
}

export interface UpsertStepInput {
  runId:    string;
  nodeId:   string;
  nodeType: string;
  agentId?: string | null;
  input?:   Record<string, unknown>;
}

export interface CompleteStepInput {
  output?:      Record<string, unknown>;
  completedAt?: Date;
}

export interface FailStepInput {
  error:        string;
  completedAt?: Date;
}

// Extended RunSpec for fields needed by service layer
export interface RunSpecExtended extends RunSpec {
  flowId?:      string | null;
  agentId?:     string;
  startedAt?:   Date | null;
  completedAt?: Date | null;
  createdAt?:   Date | null;
  inputData?:   unknown;
  metadata?:    unknown;
}

export class RunRepository {
  constructor(private readonly db: PrismaClient) {}

  // ── Primary create — full field set ─────────────────────────────────────

  async createRun(data: CreateRunInput): Promise<RunSpecExtended> {
    const run = await this.db.run.create({
      data: {
        workspaceId: data.workspaceId,
        agentId:     data.agentId     ?? null,
        sessionId:   data.sessionId   ?? null,
        channelKind: data.channelKind as string ?? null,
        status:      'pending',
        trigger:     (data.trigger   ?? {}) as unknown as Prisma.InputJsonValue,
        context:     (data.context   ?? {}) as unknown as Prisma.InputJsonValue,
        flowId:      data.flowId     ?? null,
        // inputData / metadata stored in context if schema lacks dedicated columns
        ...(data.inputData !== undefined && { inputData: data.inputData as unknown as Prisma.InputJsonValue }),
        ...(data.metadata  !== undefined && { metadata:  data.metadata  as unknown as Prisma.InputJsonValue }),
      },
    });

    return this._toRunSpecExtended(run, []);
  }

  // ── findRunById (alias of getRunById, used by RunsService) ───────────────

  async findRunById(runId: string): Promise<RunSpecExtended | null> {
    const run = await this.db.run.findUnique({
      where:   { id: runId },
      include: { steps: true },
    });
    if (!run) return null;
    return this._toRunSpecExtended(run, run.steps);
  }

  // ── findRunsByWorkspace (used by RunsService.findAll + getUsage) ─────────

  async findRunsByWorkspace(
    workspaceId: string,
    opts?: { limit?: number },
  ): Promise<RunSpecExtended[]> {
    const runs = await this.db.run.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: 'desc' },
      take:    opts?.limit,
    });
    return runs.map((r) => this._toRunSpecExtended(r, []));
  }

  // ── cancelRun (used by RunsService.cancelRun) ────────────────────────────

  async cancelRun(runId: string): Promise<RunSpecExtended | null> {
    const run = await this.db.run.update({
      where: { id: runId },
      data:  { status: 'cancelled', completedAt: new Date() },
    }).catch(() => null);
    if (!run) return null;
    return this._toRunSpecExtended(run, []);
  }

  // ── Legacy getRunById (kept for internal use) ────────────────────────────

  async getRunById(runId: string): Promise<RunSpec | null> {
    return this.findRunById(runId);
  }

  // ── updateRunStatus ──────────────────────────────────────────────────────

  async updateRunStatus(
    runId: string,
    status: string,
    extra?: Partial<{ startedAt: Date; completedAt: Date; error: string }>,
  ): Promise<void> {
    await this.db.run.update({
      where: { id: runId },
      data:  { status, ...extra },
    });
  }

  // ── createRunStep ────────────────────────────────────────────────────────

  async createRunStep(data: {
    runId:    string;
    nodeId:   string;
    nodeType: string;
    agentId?: string | null;
    input?:   Record<string, unknown>;
  }): Promise<RunStepSpec> {
    const step = await this.db.runStep.create({
      data: {
        runId:    data.runId,
        nodeId:   data.nodeId,
        nodeType: data.nodeType,
        agentId:  data.agentId ?? null,
        status:   'pending',
        input:    (data.input ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
    return this._toRunStepSpec(step);
  }

  // ── updateRunStepStatus ──────────────────────────────────────────────────

  async updateRunStepStatus(
    stepId: string,
    status: string,
    extra?: Partial<{ output: Record<string, unknown>; error: string; completedAt: Date }>,
  ): Promise<void> {
    const data: Record<string, unknown> = { status };
    if (extra?.output)      data['output']      = extra.output as unknown as Prisma.InputJsonValue;
    if (extra?.error)       data['error']       = extra.error;
    if (extra?.completedAt) data['completedAt'] = extra.completedAt;
    await this.db.runStep.update({ where: { id: stepId }, data });
  }

  // ── findActiveRunsForAgent ───────────────────────────────────────────────

  async findActiveRunsForAgent(agentId: string): Promise<RunSpecExtended[]> {
    const runs = await this.db.run.findMany({
      where:   { agentId, status: { in: ['pending', 'running'] } },
      include: { steps: true },
    });
    return runs.map((r) => this._toRunSpecExtended(r, r.steps));
  }

  // ── getRunStepById ───────────────────────────────────────────────────────

  async getRunStepById(stepId: string): Promise<RunStepSpec | null> {
    const step = await this.db.runStep.findUnique({ where: { id: stepId } });
    if (!step) return null;
    return this._toRunStepSpec(step);
  }

  // ── Private mappers ──────────────────────────────────────────────────────

  private _toRunSpecExtended(run: any, steps: any[]): RunSpecExtended {
    return {
      id:          run.id,
      workspaceId: run.workspaceId,
      agentId:     run.agentId   ?? undefined,
      flowId:      run.flowId    ?? null,
      status:      run.status    as RunSpec['status'],
      trigger:     run.trigger   as RunSpec['trigger'],
      startedAt:   run.startedAt   ?? null,
      completedAt: run.completedAt ?? null,
      createdAt:   run.createdAt   ?? null,
      inputData:   run.inputData   ?? undefined,
      metadata:    run.metadata    ?? undefined,
      steps: steps.map((s) => this._toRunStepSpec(s)),
    };
  }

  private _toRunStepSpec(s: any): RunStepSpec {
    return {
      id:       s.id,
      runId:    s.runId,
      nodeId:   s.nodeId   ?? '',
      nodeType: s.nodeType ?? '',
      agentId:  s.agentId  ?? undefined,
      status:   s.status   as RunStepSpec['status'],
      input:    s.input    as Record<string, unknown>,
      output:   s.output   as Record<string, unknown> | undefined,
    };
  }
}
