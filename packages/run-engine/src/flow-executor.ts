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
}

/** Spec mínima del Flow */
export interface FlowSpec {
  nodes: FlowNode[];
  edges: Array<{ source: string; target: string; label?: string }>;
  entryNodeId?: string;
}

export interface FlowExecutorDeps {
  prisma: PrismaClient;
  executeAgent: AgentExecutorFn;
}

export class FlowExecutor {
  constructor(private readonly deps: FlowExecutorDeps) {}

  /**
   * Ejecuta el Run identificado por `runId`.
   * Actualiza Run.status → 'running' al inicio y 'completed'|'failed' al final.
   */
  async executeRun(runId: string): Promise<void> {
    const { prisma, executeAgent } = this.deps;

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

      const spec = run.flow.spec as unknown as FlowSpec;
      const nodes = spec?.nodes ?? [];
      if (nodes.length === 0) throw new Error('Flow.spec has no nodes');

      // Determinar nodo de entrada
      const entryNodeId =
        spec.entryNodeId ??
        nodes.find((n) => n.type === 'input')?.id ??
        nodes[0].id;

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
      // conditionExpr no es columna en RunStep: se guarda en el campo JSON
      // `input` para que AgentExecutor pueda leerlo al evaluar la condición.
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
        const branch = result.branch ?? (result.output as any)?.conditionResult ? 'true' : 'false';
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
