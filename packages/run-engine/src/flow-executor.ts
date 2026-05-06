/**
 * FlowExecutor — F1a-08
 *
 * Ejecuta un Run completo siguiendo el grafo definido en Flow.spec.
 * Usa AgentExecutor como único punto de entrada para RunSteps, eliminando
 * la dependencia circular que existía con LLMStepExecutor.
 *
 * Orden de ejecución:
 *  1. Cargar el Run con su Flow.spec y RunSteps existentes
 *  2. Iterar nodos del grafo en orden topológico
 *  3. Para cada nodo crear (o reusar) un RunStep y delegarlo a AgentExecutor
 *  4. Manejar nodos de tipo `condition` ramificando el grafo
 *  5. Marcar el Run como completed o failed según el resultado
 */
import type { PrismaClient } from '@prisma/client';
import type { AgentExecutorFn } from './agent-executor.service';
import type { RunSpec } from '../../core-types/src';
import { ApprovalQueue } from './approval-queue';
import { RunRepository } from './run-repository';

/** Nodo mínimo del Flow.spec */
export interface FlowNode {
  id: string;
  type: 'agent' | 'condition' | 'input' | 'output' | 'approval' | 'subflow' | 'n8n_workflow' | string;
  /** Para nodos condition: rama 'true' / 'false' → nodeId siguiente */
  branches?: { true?: string; false?: string };
  /** Para nodos agent: expresión de condición (cuando type === 'condition') */
  conditionExpr?: string;
  /** ID del agente o subagente asignado a este nodo */
  agentId?: string;
  /** Config adicional del nodo */
  config?: Record<string, unknown>;
}

/** Spec mínima del Flow */
export interface FlowSpec {
  nodes: FlowNode[];
  edges: Array<{ source: string; target: string; label?: string }>;
  entryNodeId?: string;
}

/**
 * IRunRepository — interfaz para persistencia de runs en memoria o Prisma.
 * Exportada aquí para que InMemoryRunRepository la implemente.
 */
export interface IRunRepository {
  save(run: RunSpec): void;
  findById(runId: string): RunSpec | null;
  getAll(): RunSpec[];
}

export interface FlowExecutorDeps {
  /** Prisma client para persistencia directa */
  prisma?: PrismaClient;
  /** Función de ejecución de agentes */
  executeAgent?: AgentExecutorFn;
  /** workspaceId del flow en ejecución */
  workspaceId?: string;
  /** Repositorio de runs (in-memory o Prisma) */
  repository?: RunRepository;
  /** Cola de aprobaciones HITL */
  approvalQueue?: ApprovalQueue;
  /** DB client (alias de prisma para compatibilidad) */
  db?: PrismaClient;
  /** Max rondas de tool calls */
  maxToolRounds?: number;
}

export class FlowExecutor {
  private readonly deps: FlowExecutorDeps;

  constructor(deps: FlowExecutorDeps) {
    this.deps = deps;
  }

  /**
   * Inicia la ejecución de un flow creando el Run en Prisma
   * y disparando el recorrido del grafo de forma asíncrona.
   * Retorna el RunSpec con el id del Run creado.
   */
  async startRun(
    flow: FlowSpec,
    trigger: { event: string; payload?: Record<string, unknown> },
    opts?: { agentId?: string; sessionId?: string; channelKind?: string },
  ): Promise<RunSpec> {
    const prisma = this.deps.db ?? this.deps.prisma;
    if (!prisma) throw new Error('FlowExecutor: no prisma/db client provided');

    // Buscar o resolver el workspaceId desde el flow si está embebido
    const workspaceId = this.deps.workspaceId ?? '';

    // Crear el Run en Prisma
    const run = await prisma.run.create({
      data: {
        workspaceId,
        agentId:     opts?.agentId    ?? null,
        sessionId:   opts?.sessionId  ?? null,
        channelKind: opts?.channelKind ?? null,
        status:      'pending',
        trigger:     { event: trigger.event, payload: trigger.payload ?? {} },
        flowId:      null, // sin flow persistido, spec viaja en trigger.payload
      },
    });

    const runSpec: RunSpec = {
      id:          run.id,
      workspaceId: run.workspaceId,
      agentId:     run.agentId ?? undefined,
      status:      run.status as RunSpec['status'],
      trigger:     trigger,
      steps:       [],
    };

    // Disparar ejecución async (fire-and-forget)
    setImmediate(() => {
      void this.executeRun(run.id).catch((err: unknown) => {
        console.error('[FlowExecutor] async execution error:', err);
      });
    });

    return runSpec;
  }

  /**
   * Ejecuta el Run identificado por `runId`.
   * Actualiza Run.status → 'running' al inicio y 'completed'|'failed' al final.
   */
  async executeRun(runId: string): Promise<void> {
    const prisma = this.deps.db ?? this.deps.prisma;
    const executeAgent = this.deps.executeAgent;
    if (!prisma) throw new Error('FlowExecutor: no prisma/db client provided');
    if (!executeAgent) throw new Error('FlowExecutor: no executeAgent function provided');

    // Marcar Run como running
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

      // Determinar nodo de entrada
      const entryNodeId =
        spec.entryNodeId ??
        nodes.find((n) => n.type === 'input')?.id ??
        nodes[0]!.id;

      // Ejecutar el grafo en orden topológico (BFS)
      await this._traverseGraph(runId, spec, entryNodeId, executeAgent, prisma);

      // Completar el Run
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

  /**
   * Recorre el grafo BFS desde `currentNodeId`.
   * Para nodos condition toma la rama según el resultado booleano.
   */
  private async _traverseGraph(
    runId: string,
    spec: FlowSpec,
    startNodeId: string,
    executeAgent: AgentExecutorFn,
    prisma: PrismaClient,
  ): Promise<void> {
    const nodeMap = new Map(spec.nodes.map((n) => [n.id, n]));
    const edgeMap = this._buildEdgeMap(spec);

    const queue: string[] = [startNodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (!node) throw new Error(`Node ${nodeId} not found in Flow.spec`);

      // Nodos de infraestructura que no generan RunStep
      if (node.type === 'input' || node.type === 'output') {
        const nextIds = edgeMap.get(nodeId) ?? [];
        queue.push(...nextIds);
        continue;
      }

      // Crear RunStep para este nodo.
      const runStep = await prisma.runStep.create({
        data: {
          runId,
          nodeId,
          nodeType: node.type,
          agentId:  node.agentId,
          status:   'pending',
          input: {
            conditionExpr: node.conditionExpr ?? null,
          },
        },
      });

      // Ejecutar via AgentExecutor
      const result = await executeAgent(runStep.id);

      // Determinar siguientes nodos
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

  /** Construye un mapa source → [target, ...] desde las edges del spec */
  private _buildEdgeMap(spec: FlowSpec): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const edge of spec.edges ?? []) {
      if (!map.has(edge.source)) map.set(edge.source, []);
      map.get(edge.source)!.push(edge.target);
    }
    return map;
  }
}
