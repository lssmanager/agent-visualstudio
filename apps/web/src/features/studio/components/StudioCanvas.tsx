import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Layers3, RadioTower } from 'lucide-react';

function InlineMouseIcon({ size = 14, style }: { size?: number; style?: React.CSSProperties | undefined }) {
  return <span style={{ fontSize: size, display: 'inline-block', lineHeight: 1, ...style }}>🖱️</span>;
}

import { saveFlow, validateFlow } from '../../../lib/api';
import type { AgentSpec, FlowNode, FlowSpec, SkillSpec } from '../../../lib/types';
import { EditableFlowCanvas } from '../../canvas/components/EditableFlowCanvas';
import { CanvasToolbarOverlay } from './CanvasToolbarOverlay';

interface StudioCanvasProps {
  agents: AgentSpec[];
  flows: FlowSpec[];
  skills: SkillSpec[];
  onNodeSelect?: (nodeId: string | null) => void;
  selectedNodeId?: string | null;
  selectedAgent?: AgentSpec | null;
}

function inferNodeLabel(node: FlowNode | null): string | null {
  if (!node) return null;
  const config = node.config as Record<string, unknown>;
  return typeof config.name === 'string' ? config.name : node.id;
}

export function StudioCanvas({
  agents,
  flows,
  skills,
  onNodeSelect,
  selectedNodeId,
  selectedAgent,
}: StudioCanvasProps) {
  const [editableFlow, setEditableFlow] = useState<FlowSpec | null>(flows[0] ?? null);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);

  // Undo/redo history.
  const [history, setHistory] = useState<FlowSpec[]>(editableFlow ? [editableFlow] : []);
  const [historyIndex, setHistoryIndex] = useState(0);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const selectedNode = useMemo(
    () => editableFlow?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [editableFlow, selectedNodeId],
  );
  const selectedNodeLabel = useMemo(() => inferNodeLabel(selectedNode), [selectedNode]);

  useEffect(() => {
    const nextFlow = flows[0] ?? null;
    setEditableFlow(nextFlow);
    setHistory(nextFlow ? [nextFlow] : []);
    setHistoryIndex(0);
  }, [flows]);

  const handleFlowChange = useCallback(
    (flow: FlowSpec) => {
      setEditableFlow(flow);
      setHistory((previous) => {
        const trimmed = previous.slice(0, historyIndex + 1);
        return [...trimmed, flow];
      });
      setHistoryIndex((previous) => previous + 1);
    },
    [historyIndex],
  );

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setEditableFlow(history[nextIndex] ?? null);
  }, [canUndo, history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setEditableFlow(history[nextIndex] ?? null);
  }, [canRedo, history, historyIndex]);

  async function handleSave() {
    if (!editableFlow) return;
    setSaving(true);
    try {
      await saveFlow(editableFlow);
    } finally {
      setSaving(false);
    }
  }

  async function handleValidate() {
    if (!editableFlow) return;
    setValidating(true);
    try {
      await validateFlow(editableFlow.id);
    } finally {
      setValidating(false);
    }
  }

  const emptyState = useMemo(
    () => (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text-muted)',
          fontSize: 13,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            padding: '24px 32px',
            borderRadius: 16,
            border: '1.5px dashed var(--border-primary)',
            background: 'var(--shell-chip-bg)',
            textAlign: 'center',
          }}
        >
          No flow loaded
        </div>
      </div>
    ),
    [],
  );

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div
        style={{
          position: 'absolute',
          inset: '12px 12px auto 12px',
          zIndex: 4,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
          pointerEvents: 'none',
          flexWrap: 'wrap',
        }}
      >
        <CanvasStatusCard
          title={editableFlow?.name ?? 'No flow loaded'}
          description={
            editableFlow
              ? `${editableFlow.nodes.length} nodes and ${editableFlow.edges.length} connections`
              : 'Select a workspace flow to start composing.'
          }
          icon={Layers3}
        />

        <CanvasStatusCard
          title={selectedNodeLabel ?? 'Canvas focus'}
          description={
            selectedNode
              ? `${String(selectedNode.type)} selected. Inspector pinned to this node.`
              : 'Select a node to inspect bindings, runtime state, and diff impact.'
          }
          icon={selectedNode ? InlineMouseIcon : RadioTower}
          emphasis={Boolean(selectedNode)}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          zIndex: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          pointerEvents: 'none',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--shell-chip-border)',
            background: 'rgba(255, 255, 255, 0.88)',
            backdropFilter: 'blur(14px)',
            padding: '7px 10px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'var(--text-secondary)',
          }}
        >
          <CheckCircle2 size={12} style={{ color: 'var(--tone-success-text)' }} />
          {selectedAgent ? `Building as ${selectedAgent.name}` : 'Builder target ready'}
        </div>

        <div
          style={{
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--shell-chip-border)',
            background: 'rgba(255, 255, 255, 0.88)',
            backdropFilter: 'blur(14px)',
            padding: '7px 10px',
            fontSize: 11,
            color: 'var(--text-secondary)',
          }}
        >
          Drag from the library, click a node, and inspect on the right.
        </div>
      </div>

      {editableFlow ? (
        <EditableFlowCanvas
          flow={editableFlow}
          onChange={handleFlowChange}
          agents={agents}
          skills={skills}
          onNodeSelect={onNodeSelect}
          selectedNodeId={selectedNodeId}
        />
      ) : (
        emptyState
      )}

      <CanvasToolbarOverlay
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={handleSave}
        onValidate={handleValidate}
        canUndo={canUndo}
        canRedo={canRedo}
        saving={saving}
        validating={validating}
      />
    </div>
  );
}

function CanvasStatusCard({
  title,
  description,
  icon: Icon,
  emphasis = false,
}: {
  title: string;
  description: string;
  icon: any;
  emphasis?: boolean;
}) {
  return (
    <div
      style={{
        maxWidth: 320,
        borderRadius: 'var(--radius-lg)',
        border: `1px solid ${
          emphasis ? 'color-mix(in srgb, var(--color-primary) 32%, var(--shell-chip-border))' : 'var(--shell-chip-border)'
        }`,
        background: emphasis ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.82)',
        backdropFilter: 'blur(14px)',
        padding: '10px 12px',
        display: 'grid',
        gap: 5,
        boxShadow: emphasis ? '0 18px 30px rgba(15, 23, 42, 0.12)' : '0 10px 22px rgba(15, 23, 42, 0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 10,
            display: 'grid',
            placeItems: 'center',
            background: emphasis ? 'var(--color-primary-soft)' : 'var(--shell-chip-bg)',
            color: emphasis ? 'var(--color-primary)' : 'var(--text-secondary)',
            flexShrink: 0,
          }}
        >
          <Icon size={14} />
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 900,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
      </div>
      <span style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--text-secondary)' }}>{description}</span>
    </div>
  );
}
