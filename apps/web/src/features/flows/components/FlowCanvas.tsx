import { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';

import type { FlowNode } from '../../../lib/types-base';
import { type FlowSpec, type RunSpec } from '../../../lib/types';
import { N8nNodePanel } from './N8nNodePanel';

const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  completed:        { bg: '#d1fae5', border: '#059669' },
  running:          { bg: '#dbeafe', border: '#2563eb' },
  waiting_approval: { bg: '#fef3c7', border: '#d97706' },
  failed:           { bg: '#fee2e2', border: '#dc2626' },
  queued:           { bg: '#f3f4f6', border: '#9ca3af' },
  skipped:          { bg: '#f3f4f6', border: '#d1d5db' },
};

interface FlowCanvasProps {
  flow?:         FlowSpec;
  activeRun?:    RunSpec;
  /** Callback para persistir cambios de nodo desde el panel lateral */
  onNodeUpdate?: (updatedNode: FlowNode) => void;
}

export function FlowCanvas({ flow, activeRun, onNodeUpdate }: FlowCanvasProps) {
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);

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
      ((flow?.nodes ?? []) as FlowNode[]).map((node) => {
        const stepStatus = stepStatusMap.get(node.id);
        const colors     = stepStatus ? STATUS_COLORS[stepStatus] : undefined;
        const isN8n      = node.type === 'n8n';

        return {
          id:       node.id,
          type:     'default',
          position: node.position ?? { x: 120, y: 120 },
          data: {
            label: node.label ?? node.type,
            _raw:  node,
          },
          style: {
            ...(colors
              ? { background: colors.bg, borderColor: colors.border, borderWidth: 2 }
              : undefined),
            ...(isN8n && !node.n8n?.workflowId
              ? { borderStyle: 'dashed', borderColor: '#a5b4fc' }
              : undefined),
          },
        };
      }),
    [flow?.nodes, stepStatusMap],
  );

  const edges = useMemo<Edge[]>(
    () =>
      ((flow?.edges ?? []) as Array<{ from: string; to: string; condition?: string }>).map(
        (edge, index) => ({
          id:     edge.from + '-' + edge.to + '-' + index,
          source: edge.from,
          target: edge.to,
          label:  edge.condition,
        }),
      ),
    [flow?.edges],
  );

  const handleNodeClick: NodeMouseHandler = useCallback((_event, rfNode) => {
    const rawNode = (rfNode.data as { _raw?: FlowNode })._raw;
    if (rawNode?.type === 'n8n') {
      setSelectedNode(rawNode);
    }
  }, []);

  const handleNodeSave = useCallback(
    (updated: FlowNode) => {
      onNodeUpdate?.(updated);
      setSelectedNode(updated);
    },
    [onNodeUpdate],
  );

  return (
    <div className="flex h-[420px] overflow-hidden rounded border border-slate-300 bg-white">
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          onNodeClick={handleNodeClick}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      {selectedNode && flow?.id && (
        <N8nNodePanel
          node={selectedNode}
          flowId={flow.id}
          onSave={handleNodeSave}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
