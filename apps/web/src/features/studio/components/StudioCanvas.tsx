import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { validateFlow } from '../../../lib/api';
import type { AgentSpec, FlowSpec, SkillSpec } from '../../../lib/types';
import { useFlowSave } from '../../flows/hooks/useFlowSave';
import { EditableFlowCanvas } from '../../canvas/components/EditableFlowCanvas';
import { CanvasToolbar } from '../../canvas/components/CanvasToolbar';
import { AgentLibraryPanel } from '../../canvas/components/agent-library';
import type { AgentTemplate } from '../../canvas/components/agent-library';

interface StudioCanvasProps {
  agents: AgentSpec[];
  flows: FlowSpec[];
  skills: SkillSpec[];
  onNodeSelect?: (nodeId: string | null) => void;
}

/** MIME type usado para el drag desde AgentLibraryPanel */
const AGENCY_AGENT_MIME = 'application/agency-agent-template';

export function StudioCanvas({ agents, flows, skills, onNodeSelect }: StudioCanvasProps) {
  const [editableFlow, setEditableFlow] = useState<FlowSpec | null>(flows[0] ?? null);
  const [validating, setValidating] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  // Ref al wrapper del canvas para disparar drop simulado desde el botón "Usar"
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  // Undo/redo history.
  const [history, setHistory] = useState<FlowSpec[]>(editableFlow ? [editableFlow] : []);
  const [historyIndex, setHistoryIndex] = useState(0);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  useEffect(() => {
    const nextFlow = flows[0] ?? null;
    setEditableFlow(nextFlow);
    setHistory(nextFlow ? [nextFlow] : []);
    setHistoryIndex(0);
  }, [flows]);

  // ── Auto-save con debounce 1200ms + save manual (Ctrl+S) ──────────
  const { saveState, savedAt, saveNow } = useFlowSave(editableFlow);

  // Capturar Ctrl+S / Cmd+S para save manual inmediato.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void saveNow();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveNow]);

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

  async function handleValidate() {
    if (!editableFlow) return;
    setValidating(true);
    try {
      await validateFlow(editableFlow.id);
    } finally {
      setValidating(false);
    }
  }

  /**
   * Callback para el botón "Usar este agente" en AgentTemplatePreview.
   * Inserta el agente directamente en el flow sin necesidad de drag.
   * Posición por defecto: centro del viewport visible + offset aleatorio
   * para evitar apilar nodos en el mismo punto.
   */
  const handleUseAgent = useCallback(
    (template: AgentTemplate) => {
      if (!editableFlow) return;

      const offset = Math.random() * 80 - 40; // -40..+40 px
      const position = { x: 250 + offset, y: 180 + offset };

      const newNode = {
        id:   `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'agent' as const,
        position,
        config: {
          agentId:      '',
          name:         template.name,
          purpose:      template.description,
          systemPrompt: template.systemPrompt ?? '',
          tags:         template.tags,
          skills:       [],
          tools:        [],
          source:       'agency-agents' as const,
          templateId:   template.id,
        },
      };

      handleFlowChange({ ...editableFlow, nodes: [...editableFlow.nodes, newNode] });
      setLibraryOpen(false);
    },
    [editableFlow, handleFlowChange],
  );

  const emptyState = useMemo(
    () => (
      <div
        style={{
          height: '100%',
          border: '1px dashed var(--border-primary)',
          borderRadius: 'var(--radius-lg)',
          color: 'var(--text-muted)',
          display: 'grid',
          placeItems: 'center',
          fontSize: 'var(--text-sm)',
        }}
      >
        No flow loaded
      </div>
    ),
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <CanvasToolbar
        onSave={saveNow}
        onValidate={handleValidate}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        validating={validating}
        saveState={saveState}
        savedAt={savedAt}
        onToggleAgentLibrary={() => setLibraryOpen((p) => !p)}
        agentLibraryOpen={libraryOpen}
      />

      {/* Canvas wrapper — recibe drops de NodePalette y AgentLibraryPanel */}
      <div ref={canvasWrapperRef} className="min-h-0 flex-1">
        {editableFlow ? (
          <EditableFlowCanvas
            flow={editableFlow}
            onChange={handleFlowChange}
            agents={agents}
            skills={skills}
            onNodeSelect={onNodeSelect}
          />
        ) : (
          emptyState
        )}
      </div>

      {/* Agent Library panel — independiente del canvas React Flow */}
      <AgentLibraryPanel
        isOpen={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onUseAgent={handleUseAgent}
      />
    </div>
  );

  // Suprimir warning de variable no usada (MIME se documenta aquí para trazabilidad)
  void AGENCY_AGENT_MIME;
}
