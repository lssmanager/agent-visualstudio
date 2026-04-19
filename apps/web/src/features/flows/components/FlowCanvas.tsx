import { useMemo } from 'react';
import ReactFlow, { Background, Controls, Edge, Node } from 'reactflow';
import 'reactflow/dist/style.css';

import { FlowSpec, RunSpec } from '../../../lib/types';

const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  completed:         { bg: '#d1fae5', border: '#059669' },
  running:           { bg: '#dbeafe', border: '#2563eb' },
  waiting_approval:  { bg: '#fef3c7', border: '#d97706' },
  failed:            { bg: '#fee2e2', border: '#dc2626' },
  queued:            { bg: '#f3f4f6', border: '#9ca3af' },
  skipped:           { bg: '#f3f4f6', border: '#d1d5db' },
};

interface FlowCanvasProps {
  flow?: FlowSpec;
  activeRun?: RunSpec;
}

export function FlowCanvas({ flow, activeRun }: FlowCanvasProps) {
  // Build a nodeId → step status map from the active run
  const stepStatusMap = useMemo(() => {
    if (!activeRun) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const step of activeRun.steps) {
      map.set(step.nodeId, step.status);
    }
    return map;
  }, [activeRun]);

  const nodes = useMemo<Node[]>(
    () =>
      (flow?.nodes ?? []).map((node) => {
        const stepStatus = stepStatusMap.get(node.id);
        const colors = stepStatus ? STATUS_COLORS[stepStatus] : undefined;

        return {
          id: node.id,
          type: 'default',
          position: node.position ?? { x: 120, y: 120 },
          data: { label: node.type },
          style: colors
            ? { background: colors.bg, borderColor: colors.border, borderWidth: 2 }
            : undefined,
        };
      }),
    [flow?.nodes, stepStatusMap],
  );

  const edges = useMemo<Edge[]>(
    () =>
      (flow?.edges ?? []).map((edge, index) => ({
        id: edge.from + '-' + edge.to + '-' + index,
        source: edge.from,
        target: edge.to,
        label: edge.condition,
      })),
    [flow?.edges],
  );

  return (
    <div className="h-[420px] overflow-hidden rounded border border-slate-300 bg-white">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
