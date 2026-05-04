import { useCallback, useEffect, useMemo, useState } from 'react';

import { validateFlow } from '../../../lib/api';
import type { AgentSpec, FlowSpec, SkillSpec } from '../../../lib/types';
import { useFlowSave } from '../../flows/hooks/useFlowSave';
import { EditableFlowCanvas } from '../../canvas/components/EditableFlowCanvas';
import { CanvasToolbar } from '../../canvas/components/CanvasToolbar';
import { AgentLibraryPanel } from '../../canvas/components/agent-library';

interface StudioCanvasProps {
  agents: AgentSpec[];
  flows: FlowSpec[];
  skills: SkillSpec[];
  onNodeSelect?: (nodeId: string | null) => void;
}

export function StudioCanvas({ agents, flows, skills, onNodeSelect }: StudioCanvasProps) {
  const [editableFlow, setEditableFlow] = useState<FlowSpec | null>(flows[0] ?? null);
  const [validating, setValidating] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

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

      <div className="min-h-0 flex-1">
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
        onUseAgent={(agent) => {
          // Por ahora: log — el drag-to-canvas se implementa en F6b-02
          console.log('[AgentLibrary] onUseAgent:', agent.slug);
          // TODO F6b-02: convertir agent → FlowNode y agregar al canvas
        }}
      />
    </div>
  );
}
