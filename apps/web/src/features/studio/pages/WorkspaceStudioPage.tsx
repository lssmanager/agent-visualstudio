import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  GitBranch,
  LayoutGrid,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
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
  CanvasGraphContainer,
  RuntimeStatusBadge,
  StudioCommandRow,
  StudioEmptyState,
  StudioInspectorCard,
  StudioMetricRow,
  StudioPageShell,
  StudioSectionCard,
  StudioSplitPane,
  StudioTimelineBlock,
  StudioToolbarGroup,
} from '../../../components/ui';
import { buildStudioHref } from '../../../lib/studioRouting';

const STUDIO_AGENT_STORAGE_KEY = 'studio-active-agent-id';
const STUDIO_LIBRARY_COLLAPSED_KEY = 'studio-library-collapsed';
const STUDIO_INSPECTOR_COLLAPSED_KEY = 'studio-inspector-collapsed';

export default function WorkspaceStudioPage() {
  const { state, refresh } = useStudioState();
  const { scope, selectByEntity, selectedLineage, selectedBuilderTab, selectedKey } = useHierarchy();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<StudioTab>('builder');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<DeployPreview | null>(null);
  const [builderOutput, setBuilderOutput] = useState<BuilderAgentFunctionOutput | null>(null);
  const [builderBusy, setBuilderBusy] = useState(false);

  const [libraryCollapsed, setLibraryCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(STUDIO_LIBRARY_COLLAPSED_KEY) === 'true'; } catch { return false; }
  });
  const [inspectorCollapsed, setInspectorCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(STUDIO_INSPECTOR_COLLAPSED_KEY) === 'true'; } catch { return false; }
  });
  const [builderModalOpen, setBuilderModalOpen] = useState(false);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [agentId, setAgentId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(STUDIO_AGENT_STORAGE_KEY);
      if (stored && state.agents.some((agent) => agent.id === stored)) return stored;
    } catch {
      // ignore storage failures
    }
    return state.agents[0]?.id || null;
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedTopologyAgentId, setSelectedTopologyAgentId] = useState<string | null>(state.agents[0]?.id || null);
  const selectedAgent = state.agents.find((agent) => agent.id === agentId) || state.agents[0];
  const selectedNode = useMemo(
    () => state.flows[0]?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [state.flows, selectedNodeId],
  );
  const selectedNodeName = useMemo(() => {
    if (!selectedNode) return null;
    const config = selectedNode.config as Record<string, unknown>;
    return typeof config.name === 'string' ? config.name : selectedNode.id;
  }, [selectedNode]);

  const workspaceId = scope.workspaceId ?? state.workspace?.id;
  const runtimeOk = state.runtime?.health?.ok ?? false;
  const diagnostics = state.compile?.diagnostics ?? [];
  const sessions = state.runtime?.sessions?.payload ?? [];

  useEffect(() => {
    if (!agentId) return;
    try {
      localStorage.setItem(STUDIO_AGENT_STORAGE_KEY, agentId);
    } catch {
      // ignore storage failures
    }
  }, [agentId]);

  useEffect(() => {
    try { localStorage.setItem(STUDIO_LIBRARY_COLLAPSED_KEY, String(libraryCollapsed)); } catch { /* ignore */ }
  }, [libraryCollapsed]);

  useEffect(() => {
    try { localStorage.setItem(STUDIO_INSPECTOR_COLLAPSED_KEY, String(inspectorCollapsed)); } catch { /* ignore */ }
  }, [inspectorCollapsed]);

  // Keyboard shortcuts: Alt+[ = toggle library, Alt+] = toggle inspector
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === '[') { e.preventDefault(); setLibraryCollapsed((v) => !v); }
      if (e.altKey && e.key === ']') { e.preventDefault(); setInspectorCollapsed((v) => !v); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    setSelectedTopologyAgentId((current) => current ?? state.agents[0]?.id ?? null);
  }, [state.agents]);

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

  useEffect(() => {
    if (!selectedNodeId) return;
    const exists = state.flows.some((flow) => flow.nodes.some((node) => node.id === selectedNodeId));
    if (!exists) setSelectedNodeId(null);
  }, [selectedNodeId, state.flows]);

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

  const topologyTimeline = useMemo(
    () =>
      sessions.slice(0, 6).map((session, index) => {
        const current = session as Record<string, unknown>;
        const id = typeof current.id === 'string' ? current.id : `session-${index + 1}`;
        const status = typeof current.status === 'string' ? current.status : 'unknown';
        const channel = typeof current.channel === 'string' ? current.channel : 'internal';
        return {
          title: `${id} - ${status}`,
          description: `Channel ${channel}`,
          meta: typeof current.updatedAt === 'string' ? current.updatedAt : 'No timestamp',
        };
      }),
    [sessions],
  );

  const topologySelectedAgent =
    state.agents.find((agent) => agent.id === selectedTopologyAgentId) ?? selectedAgent ?? null;
  const scopeLabel = selectedLineage[selectedLineage.length - 1]?.label ?? state.workspace?.name ?? 'n/a';
  const runtimeLabel = runtimeOk ? 'Online' : 'Degraded';

  if (!scope.agencyId) {
    return (
      <StudioPageShell>
        <StudioSectionCard title="Studio" description="No agency selected">
          <StudioEmptyState
            title="No agency selected"
            description="Create or connect an agency to open Studio."
          />
        </StudioSectionCard>
      </StudioPageShell>
    );
  }

  if (!workspaceId) {
    return (
      <StudioPageShell>
        <StudioSectionCard title="Studio" description="No workspace loaded yet">
          <StudioEmptyState
            title="Create a workspace first"
            description="Studio needs a workspace context before opening the editor surface."
          />
        </StudioSectionCard>
      </StudioPageShell>
    );
  }

  if (state.agents.length === 0) {
    return (
      <StudioPageShell>
        <StudioSectionCard title="Studio" description="Editor requires at least one agent">
          <StudioEmptyState
            title="No agents available"
            description="Create your first agent so Studio can generate editable graph surfaces."
            actionLabel="Go to Agents"
            onAction={() => {
    navigate(`/agents-builder?mode=create&type=agent&parentWorkspaceId=${encodeURIComponent(workspaceId)}`);
            }}
          />
        </StudioSectionCard>
      </StudioPageShell>
    );
  }

  return (
    <StudioPageShell maxWidth={1440}>
      <section style={studioControlShellStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Studio Command Deck
            </span>
            <strong style={{ fontSize: 15, color: 'var(--text-primary)' }}>
              Immersive editor controls for the active scope
            </strong>
          </div>
          <RuntimeStatusBadge status={runtimeOk ? 'online' : 'degraded'} label={runtimeOk ? 'runtime online' : 'runtime degraded'} />
        </div>

        <StudioCommandRow>
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
        </StudioCommandRow>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <ContextPill label="Scope" value={scopeLabel} />
          <ContextPill label="Agent" value={selectedAgent?.name ?? 'n/a'} />
          <ContextPill label="Node" value={selectedNodeName ?? 'None selected'} />
          <ContextPill label="Mode" value={activeTab === 'diff' ? 'Diff / Apply' : activeTab[0].toUpperCase() + activeTab.slice(1)} />
          <ContextPill label="Runtime" value={runtimeLabel} tone={runtimeOk ? 'success' : 'warning'} />
        </div>

        <StudioTabBar
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: 'builder', label: 'Builder', hint: 'Compose canvas nodes and contracts.', count: state.flows[0]?.nodes.length ?? 0 },
            { id: 'test', label: 'Test', hint: 'Validate runtime readiness and live sessions.', count: diagnostics.length + sessions.length },
            { id: 'debug', label: 'Debug', hint: 'Inspect diagnostics and builder output.', count: diagnostics.length },
            { id: 'topology', label: 'Topology', hint: 'Check workspace routing and active links.', count: state.agents.length },
            { id: 'diff', label: 'Diff / Apply', hint: 'Preview and apply core-file changes.', count: preview?.diff.length ?? 0 },
          ]}
          scopeLabel={scopeLabel}
          agentLabel={selectedAgent?.name ?? 'n/a'}
          selectedNodeLabel={selectedNodeName}
          runtimeLabel={runtimeLabel}
          runtimeTone={runtimeOk ? 'success' : 'warning'}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() =>
              navigate(
                buildStudioHref({
                  surface: 'agency-builder',
                  tab: selectedBuilderTab,
                  nodeKey: selectedKey,
                }),
              )
            }
            style={toolButton()}
          >
            Administration
          </button>
          <button type="button" style={toolButton()} disabled={busy} onClick={() => setDiffModalOpen(true)}>
            <Eye size={14} />
            Open Diff Modal
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Active Agent
          </span>
          <select
            value={agentId || ''}
            onChange={(event) => {
              const next = event.target.value;
              setSelectedNodeId(null);
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
      </section>

      {activeTab === 'builder' && (
        <section
          role="tabpanel"
          aria-label="Builder surface"
          className="studio-builder-surface"
          style={{
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--shell-panel-border)',
            background: 'var(--shell-panel-bg)',
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: `${libraryCollapsed ? '40px' : '280px'} minmax(0, 1fr) ${inspectorCollapsed ? '40px' : '340px'}`,
            minHeight: 720,
            transition: 'grid-template-columns 0.18s ease',
          }}
        >
          {/* Library panel */}
          <div style={{ borderRight: '1px solid var(--shell-panel-border)', background: 'var(--shell-panel-bg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 6px', display: 'flex', justifyContent: libraryCollapsed ? 'center' : 'flex-end', flexShrink: 0, borderBottom: '1px solid var(--shell-panel-border)' }}>
              <button
                type="button"
                onClick={() => setLibraryCollapsed((v) => !v)}
                title={libraryCollapsed ? 'Expand library (Alt+[)' : 'Collapse library (Alt+[)'}
                aria-label={libraryCollapsed ? 'Expand library panel' : 'Collapse library panel'}
                style={{
                  width: 26,
                  height: 26,
                  border: '1px solid var(--border-primary)',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {libraryCollapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
              </button>
            </div>
            {!libraryCollapsed && <ComponentLibrary />}
          </div>

          {/* Canvas */}
          <div style={{ minHeight: 0, position: 'relative', background: 'var(--canvas-surface-bg)' }}>
            <div style={{ position: 'absolute', inset: 10 }}>
              <CanvasGraphContainer minHeight={680}>
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
                      selectedNodeId={selectedNodeId}
                      selectedAgent={selectedAgent}
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
              </CanvasGraphContainer>
            </div>
          </div>

          {/* Inspector / Properties panel */}
          <div style={{ borderLeft: '1px solid var(--shell-panel-border)', background: 'var(--shell-panel-bg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 6px', display: 'flex', justifyContent: inspectorCollapsed ? 'center' : 'flex-start', flexShrink: 0, borderBottom: '1px solid var(--shell-panel-border)' }}>
              <button
                type="button"
                onClick={() => setInspectorCollapsed((v) => !v)}
                title={inspectorCollapsed ? 'Expand inspector (Alt+])' : 'Collapse inspector (Alt+])'}
                aria-label={inspectorCollapsed ? 'Expand inspector panel' : 'Collapse inspector panel'}
                style={{
                  width: 26,
                  height: 26,
                  border: '1px solid var(--border-primary)',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {inspectorCollapsed ? <PanelRightOpen size={13} /> : <PanelRightClose size={13} />}
              </button>
            </div>
            {!inspectorCollapsed && (
              <PropertiesPanel
                diagnostics={diagnostics}
                deployPreview={preview}
                sessions={sessions}
                selectedNodeId={selectedNodeId}
                selectedNode={selectedNode}
                agents={state.agents}
                skills={state.skills}
                runtimeOk={runtimeOk}
              />
            )}
          </div>
        </section>
      )}

      {activeTab === 'test' && (
        <section style={flatTabSurfaceStyle}>
          <div style={flatTabHeaderStyle}>
            <div style={{ display: 'grid', gap: 4 }}>
              <span style={flatTabKickerStyle}>Test</span>
              <strong style={flatTabTitleStyle}>Runtime Test Console</strong>
              <span style={flatTabDescriptionStyle}>Run-time readiness and live session sampling for the active builder state.</span>
            </div>
          </div>

          <div className="studio-responsive-two-col" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
            <div style={flatModePanelStyle}>
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
            </div>

            <div style={flatModePanelStyle}>
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
            </div>
          </div>
        </section>
      )}

      {activeTab === 'debug' && (
        <section style={flatTabSurfaceStyle}>
          <div style={flatTabHeaderStyle}>
            <div style={{ display: 'grid', gap: 4 }}>
              <span style={flatTabKickerStyle}>Debug</span>
              <strong style={flatTabTitleStyle}>Diagnostics Stream</strong>
              <span style={flatTabDescriptionStyle}>Workspace compile/runtime warnings and builder output, kept close to the active agent.</span>
            </div>
          </div>

          <div className="studio-responsive-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={flatModePanelStyle}>
              <div style={modePanelHeaderStyle}>
                <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Diagnostics Stream</strong>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Workspace compile/runtime warnings</span>
              </div>
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
            </div>

            <div style={flatModePanelStyle}>
              <div style={modePanelHeaderStyle}>
                <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Builder Agent Output</strong>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Generated summary for the active agent</span>
              </div>
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
            </div>
          </div>
        </section>
      )}

      {activeTab === 'topology' && (
        <section style={flatTabSurfaceStyle}>
          <div style={flatTabHeaderStyle}>
            <div style={{ display: 'grid', gap: 4 }}>
              <span style={flatTabKickerStyle}>Topology</span>
              <strong style={flatTabTitleStyle}>Workspace Topology Slice</strong>
              <span style={flatTabDescriptionStyle}>Graph-first runtime view scoped to this workspace.</span>
            </div>
          </div>

          <StudioSplitPane
            left={
              <div style={{ display: 'grid', gap: 10, padding: 12 }}>
                {state.agents.map((agent) => {
                  const active = topologySelectedAgent?.id === agent.id;
                  const tone = agent.isEnabled ? 'success' : 'warning';
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setSelectedTopologyAgentId(agent.id)}
                      style={{
                        ...statusTile(tone),
                        width: '100%',
                        justifyContent: 'space-between',
                        borderColor: active ? 'color-mix(in srgb, var(--color-primary) 45%, var(--border-primary))' : undefined,
                        background: active ? 'var(--color-primary-soft)' : undefined,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <GitBranch size={14} />
                        {agent.name}
                      </span>
                      <RuntimeStatusBadge
                        status={agent.isEnabled ? 'online' : 'degraded'}
                        label={agent.isEnabled ? 'active' : 'paused'}
                      />
                    </button>
                  );
                })}
              </div>
            }
            right={
              <div style={{ padding: 12, display: 'grid', gap: 10 }}>
                <StudioInspectorCard title="Selected Node">
                  {topologySelectedAgent ? (
                    <>
                      <StudioMetricRow label="Agent" value={topologySelectedAgent.name} />
                      <StudioMetricRow label="Role" value={topologySelectedAgent.role || 'n/a'} />
                      <StudioMetricRow label="Model" value={topologySelectedAgent.model || 'n/a'} />
                      <StudioMetricRow label="Status" value={topologySelectedAgent.isEnabled ? 'active' : 'paused'} />
                    </>
                  ) : (
                    <StudioEmptyState title="No selected node" description="Select an agent from the topology list." />
                  )}
                </StudioInspectorCard>

                <StudioInspectorCard title="Current Activity">
                  {topologyTimeline.length > 0 ? (
                    <StudioTimelineBlock items={topologyTimeline} />
                  ) : (
                    <StudioEmptyState title="No activity" description="Start a run to populate timeline events." />
                  )}
                </StudioInspectorCard>
              </div>
            }
          />

          <div style={{ marginTop: 12 }}>
            <StudioToolbarGroup>
              <div style={statusTile(runtimeOk ? 'success' : 'warning')}>
                <LayoutGrid size={14} />
                Runtime links {runtimeOk ? 'online' : 'degraded'}
              </div>
              <div style={statusTile(sessions.length > 0 ? 'success' : 'warning')}>
                <MessageSquare size={14} />
                Live sessions: {sessions.length}
              </div>
            </StudioToolbarGroup>
          </div>

          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              style={toolButton()}
              onClick={() =>
                navigate(
                  buildStudioHref({
                    surface: 'agency-builder',
                    tab: 'connections',
                    nodeKey: selectedKey,
                  }),
                )
              }
            >
              Open Connections
            </button>
          </div>
        </section>
      )}

      {activeTab === 'diff' && (
        <section style={flatTabSurfaceStyle}>
          <div style={flatTabHeaderStyle}>
            <div style={{ display: 'grid', gap: 4 }}>
              <span style={flatTabKickerStyle}>Diff / Apply</span>
              <strong style={flatTabTitleStyle}>Deploy Diff</strong>
              <span style={flatTabDescriptionStyle}>Proposed file changes generated by the current studio state.</span>
            </div>
          </div>

          <div className="studio-responsive-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={flatModePanelStyle}>
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
            </div>

            <div style={flatModePanelStyle}>
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
            </div>
          </div>
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

function ContextPill({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneColor =
    tone === 'success'
      ? 'var(--tone-success-text)'
      : tone === 'warning'
        ? 'var(--tone-warning-text)'
        : 'var(--text-primary)';
  const toneBg =
    tone === 'success'
      ? 'var(--tone-success-bg)'
      : tone === 'warning'
        ? 'var(--tone-warning-bg)'
        : 'var(--bg-secondary)';
  return (
    <div
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-primary)',
        background: toneBg,
        padding: '8px 10px',
        display: 'grid',
        gap: 2,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: toneColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  );
}

const studioControlShellStyle: CSSProperties = {
  borderRadius: 'var(--radius-xl)',
  border: '1px solid var(--shell-panel-border)',
  background: 'var(--shell-panel-bg)',
  padding: 14,
  display: 'grid',
  gap: 12,
};

const modePanelStyle: CSSProperties = {
  borderRadius: 'var(--radius-xl)',
  border: '1px solid var(--shell-panel-border)',
  background: 'var(--shell-panel-bg)',
  padding: 14,
  display: 'grid',
  gap: 10,
  alignContent: 'start',
};

const modePanelHeaderStyle: CSSProperties = {
  display: 'grid',
  gap: 2,
  borderBottom: '1px solid var(--shell-chip-border)',
  paddingBottom: 8,
};

const flatTabSurfaceStyle: CSSProperties = {
  display: 'grid',
  gap: 14,
  padding: 2,
};

const flatTabHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'end',
  gap: 12,
  padding: '0 2px 2px',
};

const flatTabKickerStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.09em',
  color: 'var(--text-muted)',
};

const flatTabTitleStyle: CSSProperties = {
  fontSize: 15,
  color: 'var(--text-primary)',
};

const flatTabDescriptionStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  lineHeight: 1.45,
  maxWidth: 760,
};

const flatModePanelStyle: CSSProperties = {
  borderTop: '1px solid var(--border-primary)',
  paddingTop: 12,
  display: 'grid',
  gap: 10,
  alignContent: 'start',
};

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
