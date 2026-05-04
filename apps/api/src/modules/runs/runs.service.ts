/**
 * runs.service.ts  —  F1a / RunsService (Prisma edition)
 *
 * Reemplaza la implementación basada en workspaceStore (JSON) por Prisma + PostgreSQL.
 * RunRepository se construye con PrismaClient (via getPrisma()).
 * FlowExecutor usa { prisma, executeAgent } — sin repository ni stepExecutor propio.
 *
 * Métodos públicos mantenidos para compatibilidad con runs.routes.ts:
 *   findAll()           → findRunsByWorkspace()  (async)
 *   findById(id)        → findRunById(id)        (async)
 *   startRun(...)       → createRun + executeRun (async, no-block)
 *   cancelRun(id)       → runRepository.cancelRun(id)
 *   approveStep(...)    → atomic updateMany (sin race condition)
 *   rejectStep(...)     → atomic updateMany (sin race condition)
 *   getTrace(id)        → findRunById(id)
 *   getReplayMetadata   → findRunById + metadata
 *   replayRun(id)       → createRun + executeRun (guarda flowId nulo)
 *   compareRuns(ids)    → findRunById × N  (usa tokenUsage.input/output)
 *   getRunCost(id)      → findRunById + steps aggregate
 *   getUsage(filters)   → findRunsByWorkspace + aggregate por run
 *   getUsageByAgent()   → findRunsByWorkspace + per-agent aggregate
 */

import { getPrisma } from '../core/db/prisma.service';
import {
  RunRepository,
  FlowExecutor,
  LLMStepExecutor,
} from '@lss/run-engine';
import type { AgentExecutorFn } from '@lss/run-engine';

// ── Singletons (lazy, construidos en la primera llamada) ─────────────────────

let _repo: RunRepository | null = null;

function getRepo(): RunRepository {
  if (!_repo) _repo = new RunRepository(getPrisma());
  return _repo;
}

/**
 * AgentExecutorFn mínima que usa LLMStepExecutor para ejecutar un RunStep.
 */
const executeAgent: AgentExecutorFn = async (stepId: string) => {
  const executor = new LLMStepExecutor({ prisma: getPrisma() });
  return executor.execute(stepId);
};

function getFlowExecutor(): FlowExecutor {
  return new FlowExecutor({
    prisma: getPrisma(),
    executeAgent,
  });
}

// ── RunsService ─────────────────────────────────────────────────────────────

export class RunsService {

  // ── Queries ────────────────────────────────────────────────────────────────

  async findAll(workspaceId: string) {
    return getRepo().findRunsByWorkspace(workspaceId);
  }

  async findById(id: string) {
    return getRepo().findRunById(id);
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  async startRun(params: {
    workspaceId: string;
    flowId:      string;
    agentId?:    string;
    inputData?:  Record<string, unknown>;
    metadata?:   Record<string, unknown>;
  }) {
    const repo = getRepo();

    const run = await repo.createRun({
      workspaceId: params.workspaceId,
      flowId:      params.flowId,
      agentId:     params.agentId,
      inputData:   params.inputData ?? {},
      metadata:    params.metadata  ?? {},
    });

    // Fire-and-forget — no bloquea la respuesta HTTP
    getFlowExecutor()
      .executeRun(run.id)
      .catch((err) => console.error(`[RunsService] executeRun(${run.id}) failed:`, err));

    return run;
  }

  async cancelRun(id: string) {
    return getRepo().cancelRun(id);
  }

  /**
   * approveStep — actualización atómica para evitar doble-decisión bajo concurrencia.
   */
  async approveStep(runId: string, stepId: string) {
    const prisma = getPrisma();

    const { count } = await prisma.approval.updateMany({
      where: { runId, stepId, status: 'pending' },
      data:  { status: 'approved', decidedAt: new Date() },
    });

    if (count === 0) {
      throw new Error(`No pending approval for run=${runId} step=${stepId}`);
    }

    return prisma.approval.findFirst({
      where:   { runId, stepId },
      orderBy: { decidedAt: 'desc' },
    });
  }

  /**
   * rejectStep — mismo patrón atómico que approveStep.
   */
  async rejectStep(runId: string, stepId: string, reason?: string) {
    const prisma = getPrisma();

    const { count } = await prisma.approval.updateMany({
      where: { runId, stepId, status: 'pending' },
      data:  { status: 'rejected', decidedAt: new Date(), reason: reason ?? null },
    });

    if (count === 0) {
      throw new Error(`No pending approval for run=${runId} step=${stepId}`);
    }

    return prisma.approval.findFirst({
      where:   { runId, stepId },
      orderBy: { decidedAt: 'desc' },
    });
  }

  // ── Trace & Replay ─────────────────────────────────────────────────────────

  async getTrace(id: string) {
    return getRepo().findRunById(id);
  }

  async getReplayMetadata(id: string) {
    const run = await getRepo().findRunById(id);
    if (!run) return null;

    const metadata = (run.metadata ?? {}) as Record<string, unknown>;
    const topologyEvents   = Array.isArray(metadata['topologyEvents'])   ? metadata['topologyEvents']   : [];
    const handoffs         = Array.isArray(metadata['handoffs'])         ? metadata['handoffs']         : [];
    const redirects        = Array.isArray(metadata['redirects'])        ? metadata['redirects']        : [];
    const stateTransitions = Array.isArray(metadata['stateTransitions']) ? metadata['stateTransitions'] : [];

    return {
      topologyEvents,
      handoffs,
      redirects,
      stateTransitions,
      replay: {
        sourceRunId: typeof metadata['sourceRunId'] === 'string' ? metadata['sourceRunId'] : undefined,
        replayType:  typeof metadata['replayType']  === 'string' ? metadata['replayType']  : undefined,
      },
    };
  }

  async replayRun(id: string) {
    const original = await getRepo().findRunById(id);
    if (!original) throw new Error(`Run not found: ${id}`);

    // status comparison as plain string (RunStatus enum removed from @prisma/client)
    const status = original.status as string;
    if (status !== 'completed' && status !== 'failed') {
      throw new Error('Can only replay completed or failed runs');
    }

    if (!original.flowId) {
      throw new Error(
        `Cannot replay run ${id}: original run has no flowId. ` +
        'The flow may have been deleted.',
      );
    }

    return this.startRun({
      workspaceId: original.workspaceId,
      flowId:      original.flowId,
      agentId:     original.agentId ?? undefined,
      inputData:   (original.inputData as Record<string, unknown>) ?? {},
      metadata: {
        ...((original.metadata as Record<string, unknown>) ?? {}),
        replayType:  'replay',
        sourceRunId: original.id,
      },
    });
  }

  // ── Analytics ──────────────────────────────────────────────────────────────

  async compareRuns(ids: string[]) {
    const repo = getRepo();
    const runs = await Promise.all(ids.map((id) => repo.findRunById(id)));

    const summaries = runs.map((run) => {
      if (!run) throw new Error(`Run not found`);
      const steps = run.steps ?? [];
      const totalCost = steps.reduce((s, st) => s + ((st as any).costUsd ?? 0), 0);
      const totalTokens = steps.reduce(
        (acc, st) => ({
          input:  acc.input  + ((st as any).tokenUsage?.input  ?? 0),
          output: acc.output + ((st as any).tokenUsage?.output ?? 0),
        }),
        { input: 0, output: 0 },
      );
      return {
        id:          run.id,
        flowId:      run.flowId,
        status:      run.status,
        startedAt:   run.startedAt,
        completedAt: run.completedAt,
        totalCost,
        totalTokens,
        stepCount:   steps.length,
      };
    });

    const diffs: Array<{ field: string; values: Record<string, unknown> }> = [];
    for (const field of ['status', 'stepCount', 'totalCost'] as const) {
      const values: Record<string, unknown> = {};
      summaries.forEach((s) => { values[s.id] = s[field]; });
      const unique = new Set(Object.values(values).map(String));
      if (unique.size > 1) diffs.push({ field, values });
    }

    return { runs: summaries, diffs };
  }

  async getRunCost(id: string) {
    const run = await getRepo().findRunById(id);
    if (!run) return null;

    const steps = (run.steps ?? []).map((s: any) => ({
      stepId:     s.id,
      nodeId:     s.nodeId,
      nodeType:   s.nodeType,
      agentId:    s.agentId,
      costUsd:    s.costUsd ?? 0,
      tokenUsage: {
        input:  s.tokenUsage?.input  ?? 0,
        output: s.tokenUsage?.output ?? 0,
      },
    }));

    const totalCost   = steps.reduce((sum, s) => sum + s.costUsd, 0);
    const totalTokens = steps.reduce(
      (acc, s) => ({ input: acc.input + s.tokenUsage.input, output: acc.output + s.tokenUsage.output }),
      { input: 0, output: 0 },
    );

    return { runId: run.id, totalCost, totalTokens, steps };
  }

  async getUsage(workspaceId: string, filters?: { from?: string; to?: string; groupBy?: string }) {
    let runs = await getRepo().findRunsByWorkspace(workspaceId, { limit: 1000 });

    if (filters?.from) {
      const fromDate = new Date(filters.from).getTime();
      runs = runs.filter((r) => r.createdAt && new Date(r.createdAt).getTime() >= fromDate);
    }
    if (filters?.to) {
      const toDate = new Date(filters.to).getTime();
      runs = runs.filter((r) => r.createdAt && new Date(r.createdAt).getTime() <= toDate);
    }

    const groupBy = filters?.groupBy ?? 'flow';
    const groupMap = new Map<string, { cost: number; tokens: { input: number; output: number }; runs: number }>();

    const fullRuns = await Promise.all(
      runs.map((r) => getRepo().findRunById(r.id)),
    );

    for (const run of fullRuns) {
      if (!run) continue;
      const key = groupBy === 'agent'
        ? (run.agentId ?? 'unassigned')
        : groupBy === 'model' ? 'by-model'
        : (run.flowId ?? 'no-flow');

      if (!groupMap.has(key)) groupMap.set(key, { cost: 0, tokens: { input: 0, output: 0 }, runs: 0 });
      const entry = groupMap.get(key)!;
      entry.runs += 1;

      const steps = run.steps ?? [];
      for (const st of steps as any[]) {
        entry.cost              += st.costUsd              ?? 0;
        entry.tokens.input      += st.tokenUsage?.input    ?? 0;
        entry.tokens.output     += st.tokenUsage?.output   ?? 0;
      }
    }

    const groups = Array.from(groupMap.entries())
      .map(([key, data]) => ({ key, ...data }))
      .sort((a, b) => b.cost - a.cost);

    const totalCost   = groups.reduce((s, g) => s + g.cost, 0);
    const totalTokens = groups.reduce(
      (acc, g) => ({ input: acc.input + g.tokens.input, output: acc.output + g.tokens.output }),
      { input: 0, output: 0 },
    );

    return { totalCost, totalTokens, totalRuns: runs.length, groups };
  }

  async getUsageByAgent(workspaceId: string) {
    const runs = await getRepo().findRunsByWorkspace(workspaceId, { limit: 1000 });
    const agentMap = new Map<string, { cost: number; tokens: { input: number; output: number }; runs: number }>();

    const fullRuns = await Promise.all(
      runs.map((r) => getRepo().findRunById(r.id)),
    );

    for (const run of fullRuns) {
      if (!run) continue;
      const agentId = run.agentId ?? 'unassigned';
      if (!agentMap.has(agentId)) agentMap.set(agentId, { cost: 0, tokens: { input: 0, output: 0 }, runs: 0 });
      const entry = agentMap.get(agentId)!;
      entry.runs += 1;

      const steps = run.steps ?? [];
      for (const st of steps as any[]) {
        entry.cost              += st.costUsd              ?? 0;
        entry.tokens.input      += st.tokenUsage?.input    ?? 0;
        entry.tokens.output     += st.tokenUsage?.output   ?? 0;
      }
    }

    return Array.from(agentMap.entries())
      .map(([agentId, data]) => ({ agentId, ...data }))
      .sort((a, b) => b.cost - a.cost);
  }
}
