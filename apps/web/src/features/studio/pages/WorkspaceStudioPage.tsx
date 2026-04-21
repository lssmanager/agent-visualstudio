import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  GitBranch,
  LayoutGrid,
  MessageSquare,
  RefreshCw,
  Rocket,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { useHierarchy } from '../../../lib/HierarchyContext';
import { useStudioState } from '../../../lib/StudioStateContext';
import { applyCoreFiles, getBuilderAgentFunction, previewCoreFiles } from '../../../lib/api';
import type { BuilderAgentFunctionOutput, DeployPreview } from '../../../lib/types';
import { StudioCanvas } from '../components/StudioCanvas';
import { ComponentLibrary } from '../components/ComponentLibrary';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { StudioTabBar, type StudioTab } from '../components/StudioTabBar';
import { AgentBuilderModal } from '../components/AgentBuilderModal';
import { CorefilesDiffPreviewModal } from '../components/CorefilesDiffPreviewModal';
import { Toast } from '../../../components';
import {
  RuntimeStatusBadge,
  StudioEmptyState,
  StudioHeroSection,
  StudioInspectorCard,
  StudioMetricRow,
  StudioPageShell,
  StudioSectionCard,
} from '../../../components/ui';

export default function WorkspaceStudioPage() {
  const { state, refresh } = useStudioState();
  const { scope, selectByEntity } = useHierarchy();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<StudioTab>('builder');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<DeployPreview | null>(null);
  const [builderOutput, setBuilderOutput] = useState<BuilderAgentFunctionOutput | null>(null);
  const [builderBusy, setBuilderBusy] = useState(false);
  const [builderModalOpen, setBuilderModalOpen] = useState(false);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [agentId, setAgentId] = useState<string | null>(state.agents[0]?.id || null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedAgent = state.agents.find((agent) => agent.id === agentId) || state.agents[0];
  const selectedNode = useMemo(
    () => state.flows[0]?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [state.flows, selectedNodeId],
  );

  const workspaceId = state.workspace?.id;
  const runtimeOk = state.runtime?.health?.ok ?? false;
  const diagnostics = state.compile?.diagnostics ?? [];
  const sessions = state.runtime?.sessions?.payload ?? [];

  useEffect(() => {
    setSelectedNodeId(null);
  }, [agentId]);

  useEffect(() => {
    if (scope.subagentId && state.agents.some((agent) => agent.id === scope.subagentId)) {
      setAgentId(scope.subagentId);
      return;
    }

    if (scope.agentId && state.agents.some((agent) => agent.id === scope.agentId)) {
      setAgentId(scope.agentId);
      return;
    }

    if (scope.workspaceId) {
      const nextAgent = state.agents.find((agent) => agent.workspaceId === scope.workspaceId);
      if (nextAgent) {
        setAgentId(nextAgent.id);
      }
    }
  }, [scope.agentId, scope.subagentId, scope.workspaceId, state.agents]);

  async function handleRefresh() {
    setBusy(true);
    try {
      await refresh();
      setToast({ type: 'success', message: 'Studio state refreshed' });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to refresh Studio state' });
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview() {
    setBusy(true);
    try {
      const nextPreview = await previewCoreFiles();
      setPreview(nextPreview);
      setActiveTab('diff');
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load diff preview' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeploy() {
    setBusy(true);
    try {
      const result = await applyCoreFiles({ applyRuntime: true });
      if (!result.ok) {
        throw new Error((result.diagnostics ?? []).join(', ') || 'Core files apply failed');
      }
      await refresh();
      setPreview(await previewCoreFiles());
      setToast({ type: 'success', message: 'Deployment applied successfully' });
      setActiveTab('diff');
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Deployment failed' });
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateBuilder() {
    if (!selectedAgent) return;
    setBuilderBusy(true);
    try {
      const generated = await getBuilderAgentFunction('agent', selectedAgent.id);
      setBuilderOutput(generated);
      setToast({ type: 'success', message: 'Builder function generated' });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to generate builder profile' });
    } finally {
      setBuilderBusy(false);
    }
  }

  const testRows = useMemo(
    () => [
      { label: 'Runtime heartbeat', value: runtimeOk ? 'Healthy' : 'Unavailable', hint: runtimeOk ? 'Gateway responding' : 'Check diagnostics' },
      { label: 'Compile diagnostics', value: diagnostics.length === 0 ? 'Clean' : `${diagnostics.length} issue(s)`, hint: 'Latest compile feedback' },
      { label: 'Active sessions', value: `${sessions.length}`, hint: 'Runtime session count' },
      { label: 'Selected agent', value: selectedAgent?.name ?? 'None', hint: selectedAgent?.model ?? 'No model' },
    ],
    [runtimeOk, diagnostics.length, sessions.length, selectedAgent?.name, selectedAgent?.model],
  );

  if (!scope.agencyId) {
    return (
      <StudioPageShell>
        <StudioSectionCard title="Workspace Studio" description="No agency selected">
          <StudioEmptyState
            title="No agency selected"
            description="Create or connect an agency to open Workspace Studio."
          />
        </StudioSectionCard>
      </StudioPageShell>
    );
  }

  if (!workspaceId) {
    return (
      <StudioPageShell>
        <StudioSectionCard title="Workspace Studio" description="No workspace loaded yet">
          <StudioEmptyState
            title="Create a workspace first"
            description="Workspace Studio needs a workspace context before opening the builder surface."
          />
        </StudioSectionCard>
      </StudioPageShell>
    );
  }

  if (state.agents.length === 0) {
    return (
      <StudioPageShell>
        <StudioSectionCard title="Workspace Studio" description="Builder requires at least one agent">
          <StudioEmptyState
            title="No agents available"
            description="Create your first agent so the builder can generate editable graph surfaces."
            actionLabel="Go to Agents"
            onAction={() => {
              navigate('/entity-editor');
            }}
          />
        </StudioSectionCard>
      </StudioPageShell>
    );
  }

  return (
    <StudioPageShell maxWidth={1440}>
      <StudioHeroSection
        eyebrow="Workspace Studio"
        title="Builder Surface"
        description="Compose agent behavior, test runtime readiness, and review deploy diffs from a single studio surface."
        meta={<RuntimeStatusBadge status={runtimeOk ? 'online' : 'degraded'} label={runtimeOk ? 'runtime online' : 'runtime degraded'} />}
        actions={
          <>
            <button type="button" style={toolButton(true)} disabled={busy} onClick={() => void handleRefresh()}>
              <RefreshCw size={14} />
              Refresh
            </button>
            <button type="button" style={toolButton()} disabled={busy} onClick={() => void handlePreview()}>
              <Eye size={14} />
              Preview Diff
            </button>
            <button type="button" style={toolButton()} disabled={!selectedAgent || builderBusy} onClick={() => setBuilderModalOpen(true)}>
              <Sparkles size={14} />
              Builder Agent Function
            </button>
            <button type="button" style={primaryActionButton()} disabled={busy} onClick={() => void handleDeploy()}>
              <Rocket size={14} />
              Apply Deployment
            </button>
          </>
        }
      />

      <StudioSectionCard
        title="Studio Toolbar"
        description="Select your active builder target and switch operational panes."
        actions={
          <button type="button" style={toolButton()} disabled={busy} onClick={() => setDiffModalOpen(true)}>
            <Eye size={14} />
            Open Diff Modal
          </button>
        }
      >
        <StudioTabBar
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: 'builder', label: 'Builder' },
            { id: 'test', label: 'Test' },
            { id: 'debug', label: 'Debug' },
            { id: 'topology', label: 'Topology' },
            { id: 'diff', label: 'Diff / Apply' },
          ]}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Active Agent
          </span>
          <select
            value={agentId || ''}
            onChange={(event) => {
              const next = event.target.value;
              setAgentId(next);
              if (next) {
                const agent = state.agents.find((entry) => entry.id === next);
                if (agent?.kind === 'subagent') {
                  selectByEntity('subagent', next);
                } else {
                  selectByEntity('agent', next);
                }
              }
            }}
            style={{
              minWidth: 240,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--input-text)',
              padding: '9px 12px',
              fontSize: 'var(--text-sm)',
            }}
          >
            {state.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          {selectedAgent?.description && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedAgent.description}</span>
          )}
        </div>
      </StudioSectionCard>

      {activeTab === 'builder' && (
        <section
          className="studio-builder-surface"
          style={{
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--shell-panel-border)',
            background: 'var(--shell-panel-bg)',
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: '280px minmax(0, 1fr) 340px',
            minHeight: 720,
          }}
        >
          <div style={{ borderRight: '1px solid var(--shell-panel-border)', background: 'var(--shell-panel-bg)' }}>
            <ComponentLibrary />
          </div>

          <div style={{ minHeight: 0, position: 'relative', background: 'var(--canvas-surface-bg)' }}>
            <div
              style={{
                position: 'absolute',
                inset: 10,
                border: '1px solid var(--shell-panel-border)',
                borderRadius: 'var(--radius-xl)',
                background: 'var(--canvas-surface-bg)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  zIndex: 2,
                  display: 'grid',
                  gridTemplateRows: 'repeat(4, minmax(0, 1fr))',
                }}
              >
                {['Orchestration lane', 'Agent lane', 'Logic lane', 'Execution lane'].map((label, index) => (
                  <div
                    key={label}
                    style={{
                      borderBottom: index === 3 ? 'none' : '1px dashed var(--shell-chip-border)',
                      position: 'relative',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        left: 14,
                        top: 10,
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: 'var(--text-muted)',
                        background: 'var(--shell-chip-bg)',
                        border: '1px solid var(--shell-chip-border)',
                        borderRadius: 'var(--radius-full)',
                        padding: '3px 8px',
                      }}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ position: 'absolute', inset: 0, zIndex: 3 }}>
                {selectedAgent ? (
                  <StudioCanvas
                    agents={[selectedAgent]}
                    flows={state.flows}
                    skills={state.skills}
                    onNodeSelect={setSelectedNodeId}
                  />
                ) : (
                  <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                    <StudioEmptyState
                      title="Select an agent"
                      description="Choose a builder target to load nodes on the workspace canvas."
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ borderLeft: '1px solid var(--shell-panel-border)', background: 'var(--shell-panel-bg)' }}>
            <PropertiesPanel
              diagnostics={diagnostics}
              deployPreview={preview}
              sessions={sessions}
              selectedNodeId={selectedNodeId}
              selectedNode={selectedNode}
              agents={state.agents}
              skills={state.skills}
            />
          </div>
        </section>
      )}

      {activeTab === 'test' && (
        <section className="studio-responsive-two-col" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
          <StudioSectionCard title="Runtime Test Console" description="Run-time readiness and diagnostics for the active builder state.">
            <StudioInspectorCard title="Readiness checks">
              {testRows.map((row) => (
                <StudioMetricRow key={row.label} label={row.label} value={row.value} hint={row.hint} />
              ))}
            </StudioInspectorCard>

            {diagnostics.length > 0 && (
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                {diagnostics.map((item) => (
                  <div
                    key={item}
                    style={{
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--tone-warning-border)',
                      background: 'var(--tone-warning-bg)',
                      color: 'var(--tone-warning-text)',
                      padding: '10px 12px',
                      fontSize: 12,
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            )}
          </StudioSectionCard>

          <StudioSectionCard title="Session Sampling" description="Current runtime sessions for quick manual validation.">
            {sessions.length === 0 ? (
              <StudioEmptyState
                title="No runtime sessions"
                description="Start or replay a run to populate session traces in this panel."
              />
            ) : (
              <StudioInspectorCard title="Live sessions">
                {sessions.slice(0, 8).map((session, index) => {
                  const current = session as Record<string, unknown>;
                  const id = typeof current.id === 'string' ? current.id.slice(0, 12) : `session-${index + 1}`;
                  const status = typeof current.status === 'string' ? current.status : 'unknown';
                  const channel = typeof current.channel === 'string' ? current.channel : 'n/a';

                  return (
                    <StudioMetricRow
                      key={`${id}-${index}`}
                      label={id}
                      value={status}
                      hint={`Channel: ${channel}`}
                    />
                  );
                })}
              </StudioInspectorCard>
            )}
          </StudioSectionCard>
        </section>
      )}

      {activeTab === 'debug' && (
        <section className="studio-responsive-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <StudioSectionCard title="Diagnostics Stream" description="Compile/runtime warnings scoped to current workspace state.">
            {diagnostics.length === 0 ? (
              <StudioEmptyState title="No diagnostics" description="Builder surface currently passes compile checks." />
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {diagnostics.map((item) => (
                  <div key={item} style={statusTile('warning')}>
                    <AlertTriangle size={14} />
                    {item}
                  </div>
                ))}
              </div>
            )}
          </StudioSectionCard>

          <StudioSectionCard title="Builder Agent Output" description="Generated profile summary for selected agent.">
            {!builderOutput ? (
              <StudioEmptyState
                title="No builder output generated"
                description="Open Builder Agent Function and run generation to inspect suggested IO and collaborators."
                actionLabel="Open Builder Agent Function"
                onAction={() => setBuilderModalOpen(true)}
              />
            ) : (
              <StudioInspectorCard title={builderOutput.entityName}>
                <StudioMetricRow label="Inputs" value={`${builderOutput.inputs.length}`} />
                <StudioMetricRow label="Outputs" value={`${builderOutput.outputs.length}`} />
                <StudioMetricRow label="Collaborators" value={`${builderOutput.collaborators.length}`} />
                <StudioMetricRow label="Diff Targets" value={`${builderOutput.proposedCoreFileDiffs.length}`} />
              </StudioInspectorCard>
            )}
          </StudioSectionCard>
        </section>
      )}

      {activeTab === 'topology' && (
        <StudioSectionCard title="Workspace Topology Slice" description="Micro-topology summary for active workspace context.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <div style={statusTile(runtimeOk ? 'success' : 'warning')}>
              <GitBranch size={14} />
              Runtime links {runtimeOk ? 'online' : 'degraded'}
            </div>
            <div style={statusTile('success')}>
              <LayoutGrid size={14} />
              Agents in workspace: {state.agents.length}
            </div>
            <div style={statusTile(sessions.length > 0 ? 'success' : 'warning')}>
              <MessageSquare size={14} />
              Live sessions: {sessions.length}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <button type="button" style={toolButton()} onClick={() => navigate('/agency-builder?tab=topology')}>
              Open Agency Topology
            </button>
          </div>
        </StudioSectionCard>
      )}

      {activeTab === 'diff' && (
        <section className="studio-responsive-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <StudioSectionCard title="Deploy Diff" description="Proposed file changes generated by current studio state.">
            {!preview ? (
              <StudioEmptyState
                title="No preview loaded"
                description="Run Preview Diff from the toolbar to inspect proposed core-file changes."
                actionLabel="Preview Diff"
                onAction={() => void handlePreview()}
              />
            ) : preview.diff.length === 0 ? (
              <StudioEmptyState
                title="No file changes"
                description="Current studio state matches deployed core files."
              />
            ) : (
              <StudioInspectorCard title="Diff entries">
                {preview.diff.map((entry) => (
                  <StudioMetricRow
                    key={`${entry.path}-${entry.status}`}
                    label={entry.path}
                    value={entry.status}
                    hint={entry.status === 'unchanged' ? 'No update required' : 'Ready for apply'}
                  />
                ))}
              </StudioInspectorCard>
            )}
          </StudioSectionCard>

          <StudioSectionCard title="Diagnostics + Lifecycle" description="Compile checks and deployment readiness summary.">
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={statusTile(runtimeOk ? 'success' : 'warning')}>
                {runtimeOk ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                Runtime: {runtimeOk ? 'healthy' : 'degraded'}
              </div>
              <div style={statusTile(diagnostics.length === 0 ? 'success' : 'warning')}>
                {diagnostics.length === 0 ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                Compile diagnostics: {diagnostics.length === 0 ? 'none' : diagnostics.length}
              </div>
              <div style={statusTile((preview?.diff.length ?? 0) > 0 ? 'warning' : 'success')}>
                <LayoutGrid size={14} />
                Diff entries: {preview?.diff.length ?? 0}
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <button type="button" style={toolButton()} onClick={() => void handlePreview()} disabled={busy}>
                <Eye size={14} />
                Refresh Diff
              </button>
              <button type="button" style={toolButton()} onClick={() => setDiffModalOpen(true)} disabled={busy}>
                <Wrench size={14} />
                Open Diff Modal
              </button>
              <button type="button" style={primaryActionButton()} onClick={() => void handleDeploy()} disabled={busy}>
                <Rocket size={14} />
                Apply Changes
              </button>
            </div>
          </StudioSectionCard>
        </section>
      )}

      <AgentBuilderModal
        open={builderModalOpen}
        agent={selectedAgent ?? null}
        output={builderOutput}
        busy={builderBusy}
        onClose={() => setBuilderModalOpen(false)}
        onGenerate={() => void handleGenerateBuilder()}
      />

      <CorefilesDiffPreviewModal
        open={diffModalOpen}
        preview={preview}
        busy={busy}
        onClose={() => setDiffModalOpen(false)}
        onRefresh={() => void handlePreview()}
        onApply={() => void handleDeploy()}
      />

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </StudioPageShell>
  );
}

function toolButton(withPulse = false): CSSProperties {
  return {
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-primary)',
    background: withPulse ? 'var(--color-primary-soft)' : 'var(--card-bg)',
    color: withPulse ? 'var(--color-primary)' : 'var(--text-primary)',
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
  };
}

function primaryActionButton(): CSSProperties {
  return {
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
  };
}

function statusTile(tone: 'success' | 'warning'): CSSProperties {
  return {
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${tone === 'success' ? 'var(--tone-success-border)' : 'var(--tone-warning-border)'}`,
    background: tone === 'success' ? 'var(--tone-success-bg)' : 'var(--tone-warning-bg)',
    color: tone === 'success' ? 'var(--tone-success-text)' : 'var(--tone-warning-text)',
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
  };
}
