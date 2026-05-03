/**
 * EditableFlowCanvas.tsx
 * Canvas principal de flujos con soporte para todos los FlowNodeKind
 * incluyendo nodos n8n, costos en vivo y approvals pendientes.
 *
 * Requiere: reactflow, lucide-react
 * Inspirado en:
 *   - Flowise ChatFlow canvas (reactflow)
 *   - n8n WorkflowEditor (vue-flow)
 *   - LangGraph Studio graph view
 */

import React, { useCallback, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';

// Adjust import to shared types package once extracted:
// import { FLOW_NODE_PALETTE, FLOW_NODE_STYLE, FlowNodeKind } from '@lss/core-types';
type FlowNodeKind = string;
const FLOW_NODE_PALETTE: { kind: string; label: string; description: string; group: string }[] = [];
const FLOW_NODE_STYLE: Record<string, { color: string; icon: string }> = {};

import { FlowNodeCard } from './FlowNodeCard';
import { FlowNodePalette } from './flow-node-palette';
import { useRealtimeRun } from '../runs/useRealtimeRun';

// ─── Custom node renderer ─────────────────────────────────────────────────────
const NODE_TYPES: NodeTypes = { flowNode: FlowNodeCard };

// ─── Default nodes for a blank canvas ───────────────────────────────────────
const INITIAL_NODES: Node[] = [
  {
    id: 'trigger-1',
    type: 'flowNode',
    position: { x: 100, y: 200 },
    data: { kind: 'Trigger', label: 'Start', config: { triggerType: 'manual' } },
  },
];
const INITIAL_EDGES: Edge[] = [];

// ─── Props ────────────────────────────────────────────────────────────────────
interface EditableFlowCanvasProps {
  flowId?: string;
  runId?: string;
  onSave?: (nodes: Node[], edges: Edge[]) => void;
  readonly?: boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────────
export function EditableFlowCanvas({
  flowId: _flowId,
  runId,
  onSave,
  readonly = false,
}: EditableFlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [showPalette, setShowPalette] = useState(true);

  // Live run data via SSE — patrón LangGraph Studio stream_mode
  const { steps } = useRealtimeRun(runId ?? null);

  // Enrich node UI state from live steps
  const enrichedNodes = nodes.map((node) => {
    const step = steps.find((s) => s.nodeId === node.id);
    if (!step) return node;
    return {
      ...node,
      data: {
        ...node.data,
        _ui: {
          status: step.status,
          tokensUsed: step.tokensUsed,
          costUsd: step.costUsd,
          durationMs: step.durationMs,
        },
      },
    };
  });

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  // Drop a new node from the palette
  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData('application/flowNodeKind') as FlowNodeKind;
      if (!kind) return;
      const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const id = `${String(kind).toLowerCase()}-${Date.now()}`;
      const entry = FLOW_NODE_PALETTE.find((p) => p.kind === kind);
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: 'flowNode',
          position: { x: event.clientX - bounds.left - 75, y: event.clientY - bounds.top - 30 },
          data: { kind, label: entry?.label ?? kind, config: { kind } },
        },
      ]);
    },
    [setNodes],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleSave = () => onSave?.(nodes, edges);

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      {showPalette && !readonly && (
        <FlowNodePalette onClose={() => setShowPalette(false)} />
      )}

      <div style={{ flex: 1, position: 'relative' }}>
        {!showPalette && !readonly && (
          <button
            style={{
              position: 'absolute', top: 12, left: 12, zIndex: 10,
              background: '#6366f1', color: '#fff', border: 'none',
              borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13,
            }}
            onClick={() => setShowPalette(true)}
          >
            + Add Node
          </button>
        )}

        {onSave && !readonly && (
          <button
            style={{
              position: 'absolute', top: 12, right: 12, zIndex: 10,
              background: '#22c55e', color: '#fff', border: 'none',
              borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontSize: 13,
            }}
            onClick={handleSave}
          >
            Save
          </button>
        )}

        <ReactFlow
          nodes={enrichedNodes}
          edges={edges}
          onNodesChange={readonly ? undefined : onNodesChange}
          onEdgesChange={readonly ? undefined : onEdgesChange}
          onConnect={readonly ? undefined : onConnect}
          onDrop={readonly ? undefined : onDrop}
          onDragOver={onDragOver}
          nodeTypes={NODE_TYPES}
          fitView
        >
          <Background />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const kind = n.data?.kind as string | undefined;
              return kind && FLOW_NODE_STYLE[kind]
                ? FLOW_NODE_STYLE[kind].color
                : '#94a3b8';
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
