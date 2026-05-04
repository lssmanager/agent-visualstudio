import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';

import type { FlowSpec, FlowNodeType, RunSpec, AgentSpec, SkillSpec } from '../../../lib/types';
import { TriggerNode }      from './nodes/TriggerNode';
import { AgentNode }        from './nodes/AgentNode';
import { ToolNode }         from './nodes/ToolNode';
import { ConditionNode }    from './nodes/ConditionNode';
import { ApprovalNode }     from './nodes/ApprovalNode';
import { EndNode }          from './nodes/EndNode';
import { N8nWebhookNode }   from './nodes/N8nWebhookNode';
import { N8nWorkflowNode }  from './nodes/N8nWorkflowNode';
import { SupervisorNode }   from './nodes/SupervisorNode';
import { SubFlowNode }      from './nodes/SubFlowNode';
import { generateNodeId, getNodeTemplate } from '../lib/canvas-utils';
import type { AgentTemplate } from './agent-library/useAgencyTemplates';

const NODE_TYPES = {
  trigger:       TriggerNode,
  agent:         AgentNode,
  subagent:      AgentNode,
  skill:         ToolNode,
  tool:          ToolNode,
  condition:     ConditionNode,
  handoff:       ConditionNode,
  loop:          ConditionNode,
  approval:      ApprovalNode,
  end:           EndNode,
  supervisor:    SupervisorNode,
  n8n_webhook:   N8nWebhookNode,
  n8n_workflow:  N8nWorkflowNode,
  subflow:       SubFlowNode,
};

const STATUS_COLORS: Record<string, string> = {
  completed:        '#d1fae5',
  running:          '#dbeafe',
  waiting_approval: '#fef3c7',
  failed:           '#fee2e2',
  queued:           '#f3f4f6',
  skipped:          '#f3f4f6',
};

interface EditableFlowCanvasProps {
  flow: FlowSpec;
  onChange: (flow: FlowSpec) => void;
  activeRun?: RunSpec;
  agents: AgentSpec[];
  skills: SkillSpec[];
  onNodeSelect?: (nodeId: string | null) => void;
}

export function EditableFlowCanvas({ flow, onChange, activeRun, agents, skills, onNodeSelect }: EditableFlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  // Build step status map from active run.
  const stepStatusMap = useMemo(() => {
    if (!activeRun) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const step of activeRun.steps) {
      map.set(step.nodeId, step.status);
    }
    return map;
  }, [activeRun]);

  // Convert FlowSpec nodes → ReactFlow nodes.
  const rfNodes = useMemo<Node[]>(
    () =>
      flow.nodes.map((node) => {
        const stepStatus = stepStatusMap.get(node.id);
        return {
          id:       node.id,
          type:     node.type as string,
          position: node.position ?? { x: 200, y: 100 },
          data:     { label: node.type, config: node.config },
          style:    stepStatus
            ? { boxShadow: `0 0 0 3px ${STATUS_COLORS[stepStatus] ?? '#f3f4f6'}` }
            : undefined,
        };
      }),
    [flow.nodes, stepStatusMap],
  );

  // Convert FlowSpec edges → ReactFlow edges.
  const rfEdges = useMemo<Edge[]>(
    () =>
      flow.edges.map((edge, i) => ({
        id:       edge.id ?? `${edge.from}-${edge.to}-${i}`,
        source:   edge.from,
        target:   edge.to,
        label:    edge.condition,
        animated: stepStatusMap.get(edge.from) === 'running',
        type:     'smoothstep',
      })),
    [flow.edges, stepStatusMap],
  );

  // Handle node changes.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updated = applyNodeChanges(changes, rfNodes);
      const selectedNode = updated.find((n) => n.selected);
      onNodeSelect?.(selectedNode?.id ?? null);

      const removedIds = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
      const newNodes = flow.nodes
        .filter((n) => !removedIds.has(n.id))
        .map((n) => {
          const rfNode = updated.find((u) => u.id === n.id);
          return rfNode ? { ...n, position: rfNode.position } : n;
        });

      if (removedIds.size > 0 || changes.some((c) => c.type === 'position' && c.dragging === false)) {
        const newEdges = flow.edges.filter((e) => !removedIds.has(e.from) && !removedIds.has(e.to));
        onChange({ ...flow, nodes: newNodes, edges: newEdges });
      }
    },
    [rfNodes, flow, onChange, onNodeSelect],
  );

  // Handle edge changes.
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const updated = applyEdgeChanges(changes, rfEdges);
      const newEdges = updated.map((e) => ({
        id:        e.id,
        from:      e.source,
        to:        e.target,
        condition: (e.label as string) || undefined,
      }));
      onChange({ ...flow, edges: newEdges });
    },
    [rfEdges, flow, onChange],
  );

  // Handle new connections.
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const newEdge = {
        id:        `${connection.source}-${connection.target}-${Date.now()}`,
        from:      connection.source,
        to:        connection.target,
        condition: connection.sourceHandle ?? undefined,
      };
      onChange({ ...flow, edges: [...flow.edges, newEdge] });
    },
    [flow, onChange],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds || !rfInstance) return;
      const position = rfInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      // ── Path 1: drag desde AgentLibraryPanel ──────────────────────────────
      const agentTemplateRaw = event.dataTransfer.getData('application/agency-agent-template');
      if (agentTemplateRaw) {
        let template: AgentTemplate;
        try {
          template = JSON.parse(agentTemplateRaw) as AgentTemplate;
        } catch {
          return;
        }
        const newNode = {
          id:       generateNodeId('agent'),
          type:     'agent' as FlowNodeType,
          position,
          config: {
            agentId:      '',
            name:         template.name,
            purpose:      template.description,
            systemPrompt: template.systemPrompt ?? '',
            tags:         template.tags,
            skills:       [],
            tools:        [],
            // Trazabilidad: origen del template
            source:       'agency-agents' as const,
            templateId:   template.id,
          },
        };
        onChange({ ...flow, nodes: [...flow.nodes, newNode] });
        return;
      }

      // ── Path 2: drag desde NodePalette (comportamiento original) ──────────
      const type = event.dataTransfer.getData('application/reactflow-type') as FlowNodeType;
      if (!type) return;
      const nodeTemplate = getNodeTemplate(type);
      if (!nodeTemplate) return;
      const newNode = { id: generateNodeId(type), type, config: { ...nodeTemplate.defaultConfig }, position };
      onChange({ ...flow, nodes: [...flow.nodes, newNode] });
    },
    [rfInstance, flow, onChange],
  );

  return (
    <div
      ref={reactFlowWrapper}
      className="overflow-hidden rounded-lg border"
      style={{
        height: '100%',
        flex: 1,
        borderColor: 'var(--shell-panel-border)',
        background: 'var(--canvas-surface-bg)',
      }}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setRfInstance}
        onDragOver={onDragOver}
        onDrop={onDrop}
        fitView
        deleteKeyCode="Delete"
        snapToGrid
        snapGrid={[15, 15]}
      >
        <Background color="var(--canvas-grid-color)" gap={22} size={1} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          style={{
            background: 'var(--shell-chip-bg)',
            border: '1px solid var(--shell-chip-border)',
          }}
        />
      </ReactFlow>
    </div>
  );
}
