/**
 * run-repository.ts — Prisma-backed Run persistence
 *
 * HOLISTIC FIX: Aligned with schema canónico v12.
 * - RunStepSpec imported from correct path
 * - RunSpecExtended.flowId is string | null | undefined (schema: String?)
 * - Added all methods called by hierarchy-orchestrator:
 *   startRun, failRun, completeRun, findStep, findDelegationStepsByRun,
 *   createStep (alias), pauseRun, createApproval, waitForApproval,
 *   skipStep, completeStep, failStep, findAgentProfiles, getPrisma,
 *   getRunSteps (called by agent-executor)
 * - outputData field added to RunSpecExtended
 */
import type { PrismaClient, Prisma, RunStatus } from '@prisma/client';

// RunStepSpec defined locally to avoid import path issues across workspaces
export interface RunStepSpec {
  id:        string;
  runId:     string;
  nodeId:    string;
  nodeType:  string;
  agentId?:  string | null;
  status:    string;
  input?:    Record<string, unknown>;
  output?:   Record<string, unknown>;
  error?:    string | null;
}

export interface RunSpec {
  id:          string;
  workspaceId: string;
  agentId?:    string | null;
  flowId?:     string | null;
  status:      string;
  trigger?:    unknown;
  steps?:      RunStepSpec[];
}

export interface CreateRunInput {
  workspaceId:  string;
  agentId?:     string | null;
  sessionId?:   string | null;
  channelKind?: string | null;
  trigger?:     Record<string, unknown>;
  context?:     Record<string, unknown>;
  flowId?:      string | null;
  inputData?:   Record<string, unknown>;
  metadata?:    Record<string, unknown>;
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

export interface RunSpecExtended extends RunSpec {
  sessionId?:   string | null;
  startedAt?:   Date | null;
  completedAt?: Date | null;
  createdAt?:   Date | null;
  inputData?:   unknown;
  outputData?:  unknown;
  metadata?:    unknown;
  [key: string]: unknown;
}

export class RunRepository {
  constructor(private readonly db: PrismaClient) {}

  getPrisma(): PrismaClient {
    return this.db;
  }

  // ── Primary create ───────────────────────────────────────────────────────

  async createRun(data: CreateRunInput): Promise<RunSpecExtended> {
    const run = await this.db.run.create({
      data: {
        workspaceId: data.workspaceId,
        agentId:     data.agentId     ?? null,
        sessionId:   data.sessionId   ?? null,
        channelKind: (data.channelKind ?? null) as Parameters<typeof this.db.run.create>[0]['data']['channelKind'],
        status:      'pending' as RunStatus,
        trigger:     (data.trigger   ?? {}) as Prisma.InputJsonValue,
        context:     (data.context   ?? {}) as Prisma.InputJsonValue,
        flowId:      data.flowId     ?? null,
        ...(data.inputData !== undefined && { inputData: data.inputData as Prisma.InputJsonValue }),
        ...(data.metadata  !== undefined && { metadata:  data.metadata  as Prisma.InputJsonValue }),
      },
    });
    return this._toRunSpecExtended(run, []);
  }

  // ── startRun — transition pending → running ──────────────────────────────

  async startRun(runId: string): Promise<RunSpecExtended> {
    const run = await this.db.run.update({
      where: { id: runId },
      data:  { status: 'running' as RunStatus, startedAt: new Date() },
    });
    return this._toRunSpecExtended(run, []);
  }

  // ── failRun ───────────────────────────────────────────────────────────────

  async failRun(runId: string, error?: string): Promise<RunSpecExtended> {
    const run = await this.db.run.update({
      where: { id: runId },
      data:  { status: 'failed' as RunStatus, completedAt: new Date(), ...(error ? { error } : {}) },
    });
    return this._toRunSpecExtended(run, []);
  }

  // ── completeRun ───────────────────────────────────────────────────────────

  async completeRun(runId: string, output?: Record<string, unknown>): Promise<RunSpecExtended> {
    const run = await this.db.run.update({
      where: { id: runId },
      data:  {
        status:      'completed' as RunStatus,
        completedAt: new Date(),
        ...(output ? { outputData: output as Prisma.InputJsonValue } : {}),
      },
    });
    return this._toRunSpecExtended(run, []);
  }

  // ── pauseRun ──────────────────────────────────────────────────────────────

  async pauseRun(runId: string): Promise<RunSpecExtended> {
    const run = await this.db.run.update({
      where: { id: runId },
      data:  { status: 'paused' as RunStatus },
    });
    return this._toRunSpecExtended(run, []);
  }

  // ── findRunById ───────────────────────────────────────────────────────────

  async findRunById(runId: string): Promise<RunSpecExtended | null> {
    const run = await this.db.run.findUnique({
      where:   { id: runId },
      include: { steps: true },
    });
    if (!run) return null;
    return this._toRunSpecExtended(run, run.steps);
  }

  async getRunById(runId: string): Promise<RunSpecExtended | null> {
    return this.findRunById(runId);
  }

  // ── getRunSteps (called by agent-executor) ────────────────────────────────

  async getRunSteps(runId: string): Promise<RunStepSpec[]> {
    const steps = await this.db.runStep.findMany({ where: { runId } });
    return steps.map((s: unknown) => this._toRunStepSpec(s));
  }

  // ── findStep ──────────────────────────────────────────────────────────────

  async findStep(stepId: string): Promise<RunStepSpec | null> {
    const step = await this.db.runStep.findUnique({ where: { id: stepId } });
    if (!step) return null;
    return this._toRunStepSpec(step);
  }

  // ── findDelegationStepsByRun ──────────────────────────────────────────────

  async findDelegationStepsByRun(runId: string): Promise<RunStepSpec[]> {
    const steps = await this.db.runStep.findMany({
      where: { runId, nodeType: { in: ['delegation', 'agent', 'subagent'] } },
    });
    return steps.map((s: unknown) => this._toRunStepSpec(s));
  }

  // ── completeStep ──────────────────────────────────────────────────────────

  async completeStep(
    stepId: string,
    output?: Record<string, unknown>,
  ): Promise<RunStepSpec> {
    const step = await this.db.runStep.update({
      where: { id: stepId },
      data:  {
        status:      'completed',
        completedAt: new Date(),
        ...(output ? { output: output as Prisma.InputJsonValue } : {}),
      },
    });
    return this._toRunStepSpec(step);
  }

  // ── failStep ──────────────────────────────────────────────────────────────

  async failStep(stepId: string, error: string): Promise<RunStepSpec> {
    const step = await this.db.runStep.update({
      where: { id: stepId },
      data:  { status: 'failed', completedAt: new Date(), error },
    });
    return this._toRunStepSpec(step);
  }

  // ── skipStep ──────────────────────────────────────────────────────────────

  async skipStep(stepId: string): Promise<RunStepSpec> {
    const step = await this.db.runStep.update({
      where: { id: stepId },
      data:  { status: 'skipped', completedAt: new Date() },
    });
    return this._toRunStepSpec(step);
  }

  // ── createStep (alias for createRunStep — called by hierarchy-orchestrator) ─

  async createStep(data: {
    runId:    string;
    nodeId:   string;
    nodeType: string;
    agentId?: string | null;
    input?:   Record<string, unknown>;
  }): Promise<RunStepSpec> {
    return this.createRunStep(data);
  }

  // ── createRunStep ─────────────────────────────────────────────────────────

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
        input:    (data.input ?? {}) as Prisma.InputJsonValue,
      },
    });
    return this._toRunStepSpec(step);
  }

  // ── createApproval ────────────────────────────────────────────────────────

  async createApproval(data: {
    runId:   string;
    stepId?: string;
    reason?: string;
  }): Promise<{ id: string; runId: string; status: string }> {
    const approval = await this.db.runApproval.create({
      data: {
        runId:  data.runId,
        stepId: data.stepId ?? null,
        reason: data.reason ?? null,
        status: 'pending',
      },
    });
    return { id: approval.id, runId: approval.runId, status: approval.status };
  }

  // ── waitForApproval ───────────────────────────────────────────────────────

  async waitForApproval(
    approvalId: string,
    timeoutMs = 300_000,
  ): Promise<{ status: string }> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const approval = await this.db.runApproval.findUnique({
        where: { id: approvalId },
      });
      if (approval && approval.status !== 'pending') {
        return { status: approval.status };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return { status: 'expired' };
  }

  // ── findAgentProfiles (used by hierarchy-orchestrator) ────────────────────

  async findAgentProfiles(workspaceId: string): Promise<unknown[]> {
    return this.db.agent.findMany({
      where:   { workspaceId, isEnabled: true },
      include: { workspace: true },
    });
  }

  // ── findRunsByWorkspace ───────────────────────────────────────────────────

  async findRunsByWorkspace(
    workspaceId: string,
    opts?: { limit?: number },
  ): Promise<RunSpecExtended[]> {
    const runs = await this.db.run.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: 'desc' },
      take:    opts?.limit,
    });
    return runs.map((r: unknown) => this._toRunSpecExtended(r, []));
  }

  // ── cancelRun ─────────────────────────────────────────────────────────────

  async cancelRun(runId: string): Promise<RunSpecExtended | null> {
    const run = await this.db.run.update({
      where: { id: runId },
      data:  { status: 'cancelled' as RunStatus, completedAt: new Date() },
    }).catch(() => null);
    if (!run) return null;
    return this._toRunSpecExtended(run, []);
  }

  // ── updateRunStatus ───────────────────────────────────────────────────────

  async updateRunStatus(
    runId: string,
    status: string,
    extra?: Partial<{ startedAt: Date; completedAt: Date; error: string }>,
  ): Promise<void> {
    await this.db.run.update({
      where: { id: runId },
      data:  { status: status as RunStatus, ...extra },
    });
  }

  // ── updateRunStepStatus ───────────────────────────────────────────────────

  async updateRunStepStatus(
    stepId: string,
    status: string,
    extra?: Partial<{ output: Record<string, unknown>; error: string; completedAt: Date }>,
  ): Promise<void> {
    const data: Record<string, unknown> = { status };
    if (extra?.output)      data['output']      = extra.output as Prisma.InputJsonValue;
    if (extra?.error)       data['error']       = extra.error;
    if (extra?.completedAt) data['completedAt'] = extra.completedAt;
    await this.db.runStep.update({ where: { id: stepId }, data });
  }

  // ── findActiveRunsForAgent ────────────────────────────────────────────────

  async findActiveRunsForAgent(agentId: string): Promise<RunSpecExtended[]> {
    const runs = await this.db.run.findMany({
      where:   { agentId, status: { in: ['pending', 'running'] } },
      include: { steps: true },
    });
    return runs.map((r: unknown & { steps?: unknown[] }) =>
      this._toRunSpecExtended(r, r.steps ?? []),
    );
  }

  // ── getRunStepById ────────────────────────────────────────────────────────

  async getRunStepById(stepId: string): Promise<RunStepSpec | null> {
    const step = await this.db.runStep.findUnique({ where: { id: stepId } });
    if (!step) return null;
    return this._toRunStepSpec(step);
  }

  // ── Private mappers ───────────────────────────────────────────────────────

  private _toRunSpecExtended(run: any, steps: any[]): RunSpecExtended {
    return {
      id:          run.id,
      workspaceId: run.workspaceId,
      agentId:     run.agentId   ?? undefined,
      flowId:      run.flowId    ?? null,
      status:      run.status,
      trigger:     run.trigger,
      sessionId:   run.sessionId   ?? null,
      startedAt:   run.startedAt   ?? null,
      completedAt: run.completedAt ?? null,
      createdAt:   run.createdAt   ?? null,
      inputData:   run.inputData   ?? undefined,
      outputData:  run.outputData  ?? undefined,
      metadata:    run.metadata    ?? undefined,
      steps:       steps.map((s: any) => this._toRunStepSpec(s)),
    };
  }

  private _toRunStepSpec(s: any): RunStepSpec {
    return {
      id:       s.id,
      runId:    s.runId,
      nodeId:   s.nodeId   ?? '',
      nodeType: s.nodeType ?? '',
      agentId:  s.agentId  ?? undefined,
      status:   s.status,
      input:    s.input    as Record<string, unknown>,
      output:   s.output   as Record<string, unknown> | undefined,
      error:    s.error    ?? null,
    };
  }
}
