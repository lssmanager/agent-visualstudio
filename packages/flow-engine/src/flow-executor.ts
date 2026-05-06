/**
 * flow-executor.ts — Flow graph execution engine
 * FIX: FlowEdge.from/to → FlowEdge.source/target (canonical type)
 */
import type { FlowSpec, FlowNode, FlowEdge } from '../../core-types/src';

export type FlowExecutorResult = {
  status:  'completed' | 'failed' | 'paused';
  output?: Record<string, unknown>;
  error?:  string;
};

export class FlowExecutor {
  async execute(
    flow:    FlowSpec,
    input:   Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<FlowExecutorResult> {
    try {
      const nodes = (flow.nodes ?? []) as FlowNode[];
      const edges = (flow.edges ?? []) as FlowEdge[];

      // Build adjacency map using source/target (canonical field names)
      const adjacency = new Map<string, string[]>();
      for (const edge of edges) {
        const src = edge.source;
        const tgt = edge.target;
        if (!adjacency.has(src)) adjacency.set(src, []);
        adjacency.get(src)!.push(tgt);
      }

      // Find entry node
      const targets = new Set(edges.map((e) => e.target));
      const entryNode = nodes.find((n) => !targets.has(n.id)) ?? nodes[0];
      if (!entryNode) {
        return { status: 'failed', error: 'No entry node found in flow' };
      }

      // Execute nodes in topological order
      const visited = new Set<string>();
      const queue:   FlowNode[] = [entryNode];
      let   lastOutput: Record<string, unknown> = input;

      while (queue.length > 0) {
        const node = queue.shift()!;
        if (visited.has(node.id)) continue;
        visited.add(node.id);

        // Pass output to next nodes
        const nextIds = adjacency.get(node.id) ?? [];
        for (const nextId of nextIds) {
          const next = nodes.find((n) => n.id === nextId);
          if (next && !visited.has(next.id)) queue.push(next);
        }

        lastOutput = { ...lastOutput, nodeId: node.id, nodeType: node.type };
      }

      return { status: 'completed', output: lastOutput };
    } catch (err: unknown) {
      return {
        status: 'failed',
        error:  err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Get next node IDs from an edge list — uses source/target (canonical).
   */
  getNextNodes(
    currentNodeId: string,
    edges:         FlowEdge[],
  ): string[] {
    return edges
      .filter((e) => e.source === currentNodeId)
      .map((e) => e.target);
  }

  /**
   * Check if a node is a source in the edge list.
   */
  isSourceNode(nodeId: string, edges: FlowEdge[]): boolean {
    return edges.some((e) => e.source === nodeId);
  }
}
