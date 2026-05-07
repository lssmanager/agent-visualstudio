/**
 * FlowExecutor — F1a-08
 *
 * Ejecuta un Run completo siguiendo el grafo definido en Flow.spec.
 * Usa AgentExecutorFn como único punto de entrada para RunSteps.
 */
import type { PrismaClient } from '@prisma/client';
import type { AgentExecutorFn } from './agent-executor.service';
import type { RunSpec, FlowEdge, FlowNode, FlowSpec } from '../../core-types/src';
import { ApprovalQueue } from './approval-queue';
import { RunRepository } from './run-repository';

/** Re-export FlowSpec from core-types so callers get the canonical type */
export type { FlowSpec };

export interface IRunRepository {
  save(run: RunSpec): void;
  findById(runId: string): RunSpec | null;
  getAll(): RunSpec[];
}

export interface FlowExecutorDeps {
  prisma?: PrismaClient;
  executeAgent?: AgentExecutorFn;
  workspaceId?: string;
  repository?: RunRepository;
  approvalQueue?: ApprovalQueue;
  db?: PrismaClient;
  maxToolRounds?: number;
}

export class FlowExecutor {
  private readonly deps: FlowExecutorDeps;

  constructor(deps: FlowExecutorDeps) {
    this.deps = deps;
  }

  async startRun(
    flow: FlowSpec,
    /**
     * Accepts both RunTrigger ({ type, payload }) and legacy ({ event, payload }).
     * AgentExecutor passes RunTrigger; direct callers may pass { event }.
     */
    trigger: { type?: string; event?: string; payload?: Record<string, unknown> },
    opts?: { agentId?: string; sessionId?: string; channelKind?: string },
  ): Promise<RunSpec> {
    const prisma = this.deps.db ?? this.deps.prisma;
    if (!prisma) throw new Error('FlowExecutor: no prisma/db client provided');

    const workspaceId = this.deps.workspaceId ?? '';

    const run = await prisma.run.create({
      data: {
        workspaceId,
        agentId:     opts?.agentId    ?? null,
        sessionId:   opts?.sessionId  ?? null,
        channelKind: opts?.channelKind as string ?? null,
        status:      'pending',
        trigger:     {
          type:    trigger.type ?? trigger.event ?? 'manual',
          payload: trigger.payload ?? {},
        } as unknown as import('@prisma/client').Prisma.InputJsonValue,
        flowId: null,
      },
    });

    const runSpec: RunSpec = {
      id:          run.id,
      workspaceId: run.workspaceId,
      agentId:     run.agentId ?? undefined,
      status:      run.status as RunSpec['status'],
      trigger:     { type: trigger.type ?? trigger.event ?? 'manual', payload: trigger.payload },
      steps:       [],
    };

    setImmediate(() => {
      void this.executeRun(run.id).catch((err: unknown) => {
        console.error('[FlowExecutor] async execution error:', err);
      });
    });

    return runSpec;
  }

  async executeRun(runId: string): Promise<void> {
    const prisma = this.deps.db ?? this.deps.prisma;
    const executeAgent = this.deps.executeAgent;
    if (!prisma) throw new Error('FlowExecutor: no prisma/db client provided');
    if (!executeAgent) throw new Error('FlowExecutor: no executeAgent function provided');

    await prisma.run.update({
      where: { id: runId },
      data: { status: 'running', startedAt: new Date() },
    });

    try {
      const run = await prisma.run.findUniqueOrThrow({
        where: { id: runId },
        include: { flow: true },
      });

      if (!run.flow) throw new Error('Run has no associated Flow');

      const spec = run.flow.spec as unknown as FlowSpec;
      const nodes = spec?.nodes ?? [];
      if (nodes.length === 0) throw new Error('Flow.spec has no nodes');

      const entryNodeId =
        spec.entryNodeId ??
        nodes.find((n) => n.type === 'input')?.id ??
        nodes[0]!.id;

      await this._traverseGraph(runId, spec, entryNodeId, executeAgent, prisma);

      await prisma.run.update({
        where: { id: runId },
        data: { status: 'completed', completedAt: new Date() },
      });
    } catch (err) {
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      });
      throw err;
    }
  }

  private async _traverseGraph(
    runId: string,
    spec: FlowSpec,
    startNodeId: string,
    executeAgent: AgentExecutorFn,
    prisma: PrismaClient,
  ): Promise<void> {
    const nodeMap = new Map<string, FlowNode>(spec.nodes.map((n) => [n.id, n]));
    const edgeMap = this._buildEdgeMap(spec);

    const queue: string[] = [startNodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (!node) throw new Error(`Node ${nodeId} not found in Flow.spec`);

      if (node.type === 'input' || node.type === 'output') {
        const nextIds = edgeMap.get(nodeId) ?? [];
        queue.push(...nextIds);
        continue;
      }

      const runStep = await prisma.runStep.create({
        data: {
          runId,
          nodeId,
          nodeType: node.type,
          agentId:  node.agentId,
          status:   'pending',
          input: {
            conditionExpr: node.conditionExpr ?? null,
          } as unknown as import('@prisma/client').Prisma.InputJsonValue,
        },
      });

      const result = await executeAgent(runStep.id);

      if (node.type === 'condition') {
        const branch = result.branch ?? ((result.output as Record<string, unknown>)?.['conditionResult'] ? 'true' : 'false');
        const nextNodeId = node.branches?.[branch as 'true' | 'false'];
        if (nextNodeId) queue.push(nextNodeId);
      } else {
        const nextIds = edgeMap.get(nodeId) ?? [];
        queue.push(...nextIds);
      }
    }
  }

  private _buildEdgeMap(spec: FlowSpec): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const edge of (spec.edges ?? []) as FlowEdge[]) {
      // Support both canonical (source/target) and legacy (from/to)
      const src = edge.source ?? edge.from;
      const tgt = edge.target ?? edge.to;
      if (!src || !tgt) continue;
      if (!map.has(src)) map.set(src, []);
      map.get(src)!.push(tgt);
    }
    return map;
  }
}
