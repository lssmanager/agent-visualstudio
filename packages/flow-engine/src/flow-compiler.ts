/**
 * flow-compiler.ts
 *
 * Fix B: CompiledFlow.edges now uses source/target (canonical FlowEdge fields)
 * instead of the deprecated from/to. Accessing edge.from and edge.to caused
 * TS2339 because FlowEdge only guarantees source/target.
 */
import { FlowSpec } from '../../core-types/src';

export interface CompiledFlow {
  id: string;
  trigger: string;
  nodes: Array<{ id: string; type: string; config: Record<string, unknown> }>;
  edges: Array<{ source: string; target: string; condition?: string }>;
}

export function compileFlow(flow: FlowSpec): CompiledFlow {
  return {
    id:      flow.id,
    trigger: flow.trigger,
    nodes: flow.nodes.map((node) => ({
      id:     node.id,
      type:   node.type,
      config: node.config,
    })),
    edges: flow.edges.map((edge) => ({
      // Use canonical source/target; fall back to deprecated from/to for legacy data
      source:    edge.source ?? (edge as any).from,
      target:    edge.target ?? (edge as any).to,
      condition: edge.condition,
    })),
  };
}

export function compileFlows(flows: FlowSpec[]): CompiledFlow[] {
  return flows.filter((flow) => flow.isEnabled).map(compileFlow);
}
