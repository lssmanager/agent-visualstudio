import { useState, useCallback } from 'react';

import { saveFlow, validateFlow, type FlowValidationResult } from '../../../lib/api';
import { AgentSpec, FlowSpec, SkillSpec } from '../../../lib/types';
import { AgentEditorForm } from '../../agents/components/AgentEditorForm';
import { EditableFlowCanvas } from '../../canvas/components/EditableFlowCanvas';
import { NodePalette } from '../../canvas/components/NodePalette';
import { NodeEditor } from '../../canvas/components/NodeEditor';
import { CanvasToolbar } from '../../canvas/components/CanvasToolbar';
import { SkillList } from '../../skills/components/SkillList';

interface StudioCanvasProps {
  workspaceId: string;
  agents: AgentSpec[];
  flows: FlowSpec[];
  skills: SkillSpec[];
  onAgentSaved: (agent: AgentSpec) => void;
}

export function StudioCanvas({ workspaceId, agents, flows, skills, onAgentSaved }: StudioCanvasProps) {
  const [editableFlow, setEditableFlow] = useState<FlowSpec | null>(flows[0] ?? null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<FlowValidationResult | null>(null);

  // Undo/redo history
  const [history, setHistory] = useState<FlowSpec[]>(editableFlow ? [editableFlow] : []);
  const [historyIndex, setHistoryIndex] = useState(0);

  const handleFlowChange = useCallback((flow: FlowSpec) => {
    setEditableFlow(flow);
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, flow];
    });
    setHistoryIndex((prev) => prev + 1);
    setValidation(null);
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setEditableFlow(history[newIndex]);
  }, [historyIndex, history]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setEditableFlow(history[newIndex]);
  }, [historyIndex, history]);

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
      const result = await validateFlow(editableFlow.id);
      setValidation(result);
    } catch {
      setValidation({ valid: false, issues: [{ severity: 'error', message: 'Validation request failed' }] });
    } finally {
      setValidating(false);
    }
  }

  const selectedNode = editableFlow?.nodes.find((n) => n.id === selectedNodeId);

  function handleNodeConfigChange(config: Record<string, unknown>) {
    if (!editableFlow || !selectedNodeId) return;
    const updated = {
      ...editableFlow,
      nodes: editableFlow.nodes.map((n) =>
        n.id === selectedNodeId ? { ...n, config } : n,
      ),
    };
    handleFlowChange(updated);
  }

  function handleNodeDelete() {
    if (!editableFlow || !selectedNodeId) return;
    const updated = {
      ...editableFlow,
      nodes: editableFlow.nodes.filter((n) => n.id !== selectedNodeId),
      edges: editableFlow.edges.filter((e) => e.from !== selectedNodeId && e.to !== selectedNodeId),
    };
    setSelectedNodeId(null);
    handleFlowChange(updated);
  }

  return (
    <div className="space-y-4">
      {/* Agent Editor */}
      <section className="rounded border border-slate-200 bg-white p-3">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Agent Editor</h3>
        <AgentEditorForm workspaceId={workspaceId} agent={agents[0]} agents={agents} skills={skills} onSaved={onAgentSaved} />
      </section>

      {/* Flow Canvas Section */}
      {editableFlow && (
        <section className="rounded border border-slate-200 bg-white p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Flow Canvas</h3>
            <CanvasToolbar
              onSave={handleSave}
              onValidate={handleValidate}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < history.length - 1}
              saving={saving}
              validating={validating}
            />
          </div>

          <div className="grid grid-cols-[180px_1fr] gap-3">
            {/* Left: Palette + Node Editor */}
            <div className="space-y-3">
              <NodePalette />
              {selectedNode && (
                <NodeEditor
                  nodeId={selectedNode.id}
                  nodeType={selectedNode.type}
                  config={selectedNode.config}
                  agents={agents}
                  skills={skills}
                  onChange={handleNodeConfigChange}
                  onDelete={handleNodeDelete}
                />
              )}
            </div>

            {/* Right: Canvas */}
            <EditableFlowCanvas
              flow={editableFlow}
              onChange={handleFlowChange}
              agents={agents}
              skills={skills}
              onNodeSelect={setSelectedNodeId}
            />
          </div>

          {/* Validation results */}
          {validation && (
            <div className="space-y-1">
              {validation.valid ? (
                <div className="text-xs font-medium rounded px-3 py-2" style={{ background: '#d1fae5', color: '#059669' }}>
                  Flow is valid — no issues found
                </div>
              ) : (
                validation.issues.map((issue, i) => (
                  <div
                    key={i}
                    className="text-xs rounded px-3 py-2"
                    style={{
                      background: issue.severity === 'error' ? '#fee2e2' : '#fef3c7',
                      color: issue.severity === 'error' ? '#dc2626' : '#92400e',
                    }}
                  >
                    <strong>{issue.severity === 'error' ? 'Error' : 'Warning'}:</strong> {issue.message}
                    {issue.nodeId && <span className="font-mono ml-1">({issue.nodeId})</span>}
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      )}

      <SkillList skills={skills} />
    </div>
  );
}
