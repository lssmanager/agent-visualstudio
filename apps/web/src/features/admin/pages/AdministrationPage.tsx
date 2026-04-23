import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

import {
  bindProfile,
  getDashboardConnections,
  getDashboardInspector,
  getDashboardOperations,
  getDashboardOverview,
  getEffectiveProfile,
  saveProfileOverride,
  sendRuntimeCommand,
  unbindProfile,
} from '../../../lib/api';
import { useHierarchy } from '../../../lib/HierarchyContext';
import { SCOPE_VIEW_REGISTRY } from '../../../lib/ScopeViewRegistry';
import { buildStudioHref } from '../../../lib/studioRouting';
import type {
  AgencyBuilderTab,
  CanonicalNodeLevel,
  DashboardConnectionsDto,
  DashboardInspectorDto,
  DashboardOperationsDto,
  DashboardOverviewDto,
  EffectiveProfileDto,
  TopologyActionResult,
  TopologyRuntimeAction,
} from '../../../lib/types';
import { useStudioState } from '../../../lib/StudioStateContext';
import { useShellLayout } from '../../../layouts/ShellLayoutContext';
import { AdminSettingsPanel } from '../../studio/components/admin/AdminSettingsPanel';
import { ConnectionsSurface } from '../../studio/components/admin/ConnectionsSurface';
import { OperationsSurface } from '../../studio/components/admin/OperationsSurface';
import { OverviewSurface } from '../../studio/components/admin/OverviewSurface';
import { ProfileScopeTab } from '../../studio/components/admin/ProfileScopeTab';
import { RightInspectorPanel } from '../../studio/components/admin/RightInspectorPanel';
import { SessionsSurface } from '../../studio/components/admin/SessionsSurface';

const TAB_LABEL: Record<AgencyBuilderTab, string> = {
  overview: 'Overview',
  connections: 'Connections',
  operations: 'Operations',
  runs: 'Runs',
  sessions: 'Sessions',
  settings: 'Settings',
  profile: 'Profile',
  topology: 'Topology',
  structure: 'Structure',
  routing: 'Routing',
  hooks: 'Hooks',
  versions: 'Versions',
};

function parseTab(value: string | null): AgencyBuilderTab | null {
  if (
    value === 'overview' ||
    value === 'connections' ||
    value === 'operations' ||
    value === 'runs' ||
    value === 'sessions' ||
    value === 'settings' ||
    value === 'profile' ||
    value === 'topology' ||
    value === 'structure' ||
    value === 'routing' ||
    value === 'hooks' ||
    value === 'versions'
  ) {
    return value;
  }
  return null;
}

function SurfaceStateCard({
  title,
  description,
  tone = 'neutral',
}: {
  title: string;
  description: string;
  tone?: 'neutral' | 'warning' | 'danger';
}) {
  const background =
    tone === 'warning'
      ? 'var(--tone-warning-bg, rgba(245,158,11,0.08))'
      : tone === 'danger'
        ? 'var(--tone-danger-bg, rgba(239,68,68,0.08))'
        : 'var(--bg-secondary)';
  const borderColor =
    tone === 'warning'
      ? 'var(--tone-warning-border, rgba(245,158,11,0.28))'
      : tone === 'danger'
        ? 'var(--tone-danger-border, rgba(239,68,68,0.28))'
        : 'var(--border-primary)';
  const textColor =
    tone === 'warning'
      ? 'var(--tone-warning-text, #f59e0b)'
      : tone === 'danger'
        ? 'var(--tone-danger-text, #ef4444)'
        : 'var(--text-muted)';

  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        border: `1px solid ${borderColor}`,
        background,
        padding: 16,
        display: 'grid',
        gap: 6,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
      <div style={{ fontSize: 13, color: textColor, lineHeight: 1.5 }}>{description}</div>
    </div>
  );
}

function getEntityLevel(level?: string): CanonicalNodeLevel {
  if (level === 'agency' || level === 'department' || level === 'workspace' || level === 'agent' || level === 'subagent') {
    return level;
  }
  return 'agency';
}

export default function AdministrationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { state } = useStudioState();
  const { inspectorCollapsed, inspectorWidth, setInspectorWidth, focusMode } = useShellLayout();
  const { selectedNode, selectedLineage, setBuilderTab } = useHierarchy();

  const entityLevel = getEntityLevel(selectedNode?.level);
  const entityId = selectedNode?.id ?? selectedLineage[0]?.id ?? 'agency-default';
  const viewConfig = SCOPE_VIEW_REGISTRY[entityLevel];

  const tabs = viewConfig.adminTabs;
  const activeFromQuery = parseTab(searchParams.get('tab'));
  const activeTab = activeFromQuery && tabs.includes(activeFromQuery) ? activeFromQuery : tabs[0];

  const [overview, setOverview] = useState<DashboardOverviewDto | null>(null);
  const [connections, setConnections] = useState<DashboardConnectionsDto | null>(null);
  const [operations, setOperations] = useState<DashboardOperationsDto | null>(null);
  const [inspector, setInspector] = useState<DashboardInspectorDto | null>(null);
  const [profile, setProfile] = useState<EffectiveProfileDto | null>(null);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [runtimeActionBusy, setRuntimeActionBusy] = useState<TopologyRuntimeAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<Pick<TopologyActionResult, 'status' | 'message' | 'action'> | null>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startW: number }>({ active: false, startX: 0, startW: 0 });

  const contextLabel = selectedLineage.map((item) => item.label).join(' / ');
  const profileCatalog = useMemo(() => state.profiles ?? [], [state.profiles]);
  const hasLoadedProjections = Boolean(overview && connections && operations && inspector);
  const isInitialLoading = loading && !hasLoadedProjections;
  const unsupportedProfileTab = activeTab === 'profile' && !viewConfig.showProfileTab;

  useEffect(() => {
    if (activeTab !== activeFromQuery) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('tab', activeTab);
          return next;
        },
        { replace: true },
      );
    }

    setBuilderTab(activeTab);
  }, [activeTab, activeFromQuery, setBuilderTab, setSearchParams]);

  async function loadProjections() {
    setLoading(true);
    setError(null);
    setNotice(null);
    setActionResult(null);
    setOverview(null);
    setConnections(null);
    setOperations(null);
    setInspector(null);
    setProfile(null);

    try {
      const [nextOverview, nextConnections, nextOperations, nextInspector] = await Promise.all([
        getDashboardOverview(entityLevel, entityId),
        getDashboardConnections(entityLevel, entityId),
        getDashboardOperations(entityLevel, entityId),
        getDashboardInspector(entityLevel, entityId),
      ]);

      setOverview(nextOverview);
      setConnections(nextConnections);
      setOperations(nextOperations);
      setInspector(nextInspector);

      if (viewConfig.showProfileTab) {
        setProfile(await getEffectiveProfile(entityLevel, entityId));
      } else {
        setProfile(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard projections');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjections();
  }, [entityLevel, entityId]);

  async function refreshInspectorAndProfile() {
    setInspector(await getDashboardInspector(entityLevel, entityId));
    if (viewConfig.showProfileTab) {
      setProfile(await getEffectiveProfile(entityLevel, entityId));
    }
  }

  async function handleBindProfile(profileId: string) {
    if (!profileId) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await bindProfile(entityLevel, entityId, profileId);
      await refreshInspectorAndProfile();
      setNotice('Profile bound successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bind profile');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnbindProfile() {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await unbindProfile(entityLevel, entityId);
      await refreshInspectorAndProfile();
      setNotice('Profile unbound successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unbind profile');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveOverride(payload: { model?: string; skills?: string[] }) {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await saveProfileOverride(entityLevel, entityId, payload);
      await refreshInspectorAndProfile();
      setNotice('Profile override saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save override');
    } finally {
      setBusy(false);
    }
  }

  async function handleRuntimeAction(action: TopologyRuntimeAction) {
    setRuntimeActionBusy(action);
    setError(null);
    setNotice(null);
    setActionResult(null);

    try {
      const response = await sendRuntimeCommand(entityLevel, entityId, action);
      setActionResult({ status: response.result.status, message: response.result.message, action });
      setOperations(await getDashboardOperations(entityLevel, entityId));
      setOverview(await getDashboardOverview(entityLevel, entityId));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed runtime action: ${action}`);
    } finally {
      setRuntimeActionBusy(null);
    }
  }

  function startInspectorDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { active: true, startX: e.clientX, startW: inspectorWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return;
      const delta = dragRef.current.startX - ev.clientX;
      const next = Math.max(280, Math.min(520, dragRef.current.startW + delta));
      setInspectorWidth(next);
    };
    const onUp = () => {
      dragRef.current.active = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const showInspector = !focusMode && !inspectorCollapsed;
  return (
    <div style={{ maxWidth: 1520, margin: '0 auto', display: 'grid', gridTemplateColumns: showInspector ? `minmax(0, 1fr) 6px ${inspectorWidth}px` : 'minmax(0, 1fr)', gap: showInspector ? 0 : 14, height: '100%', minHeight: 0 }}>
      <div style={{ minHeight: 0, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 14, paddingRight: showInspector ? 14 : 0 }}>
        <section style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Administration
              </div>
              <h1 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>Administration</h1>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
                Scope: {contextLabel || `${entityLevel}:${entityId}`}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    buildStudioHref({
                      surface: 'workspace-studio',
                      nodeKey: selectedNode?.key ?? selectedLineage[selectedLineage.length - 1]?.key ?? null,
                    }),
                  )
                }
                disabled={!viewConfig.canEnterStudio}
                title={viewConfig.canEnterStudio ? 'Open the studio for the current scope' : 'Studio is unavailable at this scope'}
                style={{
                  ...buttonStyle,
                  opacity: viewConfig.canEnterStudio ? 1 : 0.6,
                  cursor: viewConfig.canEnterStudio ? 'pointer' : 'not-allowed',
                }}
              >
                Open Studio
              </button>
              <button type="button" onClick={() => void loadProjections()} style={buttonStyle} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))`, gap: 8 }}>
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setSearchParams(
                    (current) => {
                      const next = new URLSearchParams(current);
                      next.set('tab', tab);
                      return next;
                    },
                    { replace: true },
                  );
                }}
                style={{
                  ...buttonStyle,
                  background: activeTab === tab ? 'var(--color-primary-soft)' : 'var(--bg-secondary)',
                  color: activeTab === tab ? 'var(--color-primary)' : 'var(--text-primary)',
                }}
              >
                {TAB_LABEL[tab]}
              </button>
            ))}
          </div>
        </section>

        <section className="app-scrollbar" style={{ minHeight: 0, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gap: 14, minHeight: 0 }}>
          {isInitialLoading && <SurfaceStateCard title="Loading administration projections" description="Fetching overview, connections, operations and inspector data for the current scope." />}
          {error && !hasLoadedProjections && (
            <SurfaceStateCard title="Failed to load administration data" description={error} tone="danger" />
          )}
          {unsupportedProfileTab && (
            <SurfaceStateCard
              title="Profile unavailable"
              description="Profiles are only exposed for workspace, agent and subagent scopes."
              tone="warning"
            />
          )}

          {activeTab === 'overview' && (
            overview ? <OverviewSurface data={overview} /> : !isInitialLoading && !error && <SurfaceStateCard title="No overview available" description="Refresh the current scope or choose another node to inspect administration metrics." />
          )}

          {activeTab === 'connections' && (
            connections ? <ConnectionsSurface data={connections} /> : !isInitialLoading && !error && <SurfaceStateCard title="No connections available" description="This scope does not currently expose connection data." />
          )}

          {activeTab === 'operations' && (
            operations ? (
              <OperationsSurface
                data={operations}
                busyAction={runtimeActionBusy}
                capabilities={overview?.capabilities}
                onRuntimeAction={(action) => void handleRuntimeAction(action)}
                level={entityLevel}
                id={entityId}
              />
            ) : !isInitialLoading && !error && <SurfaceStateCard title="No operations available" description="Operations data is not ready for the current scope." />
          )}

          {activeTab === 'runs' && (
            <section style={panelStyle}>
              <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                  Runs — {entityLevel}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Run History
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Scope: {contextLabel || `${entityLevel}:${entityId}`}
                </div>
              </div>
              <SurfaceStateCard
                title="Scoped run history"
                description={`Run history for ${contextLabel || entityId} will display here. Timeline, step details, and approval queue will be available once run endpoints are scoped per ${entityLevel}.`}
              />
            </section>
          )}

          {activeTab === 'sessions' && (
            overview && operations ? (
              <SessionsSurface overview={overview} operations={operations} />
            ) : !isInitialLoading && !error && <SurfaceStateCard title="No sessions available" description="Sessions need overview and operations projections to render." />
          )}

          {activeTab === 'settings' && (
            <section style={panelStyle}>
              {isInitialLoading || (error && !hasLoadedProjections) ? (
                <SurfaceStateCard title="Loading settings" description="Waiting for the current scope projections before showing settings." />
              ) : (
                <AdminSettingsPanel settingsScope={viewConfig.settingsScope} />
              )}
            </section>
          )}

          {activeTab === 'profile' && (
            unsupportedProfileTab ? null : profile ? (
              <ProfileScopeTab
                profile={profile}
                profiles={profileCatalog}
                busy={busy}
                onBind={(profileId) => void handleBindProfile(profileId)}
                onUnbind={() => void handleUnbindProfile()}
                onSaveOverride={(payload) => void handleSaveOverride(payload)}
              />
            ) : !isInitialLoading && !error ? (
              <SurfaceStateCard title="No profile bound" description="Select or bind a profile to inspect the effective configuration for this scope." />
            ) : null
          )}
          </div>
        </section>
      </div>

      {showInspector && (
        <>
          <div
            onMouseDown={startInspectorDrag}
            style={{ cursor: 'col-resize', width: 6, minHeight: 0, background: 'var(--shell-panel-border)' }}
          />
          <div className="app-scrollbar" style={{ minHeight: 0, overflowY: 'auto', paddingLeft: 14 }}>
            <RightInspectorPanel
              data={inspector}
              state={isInitialLoading ? 'loading' : error && !hasLoadedProjections ? 'error' : 'empty'}
              message={error ?? 'No inspector data available for this scope.'}
            />
          </div>
        </>
      )}

      {notice && <div style={noticeStyle}>{notice}</div>}
      {actionResult && (
        <div
          style={{
            ...noticeStyle,
            background:
              actionResult.status === 'applied'
                ? 'rgba(16,185,129,0.15)'
                : actionResult.status === 'unsupported_by_runtime'
                  ? 'rgba(245,158,11,0.15)'
                  : 'rgba(239,68,68,0.15)',
            borderLeft: `3px solid ${
              actionResult.status === 'applied'
                ? 'var(--tone-success-text)'
                : actionResult.status === 'unsupported_by_runtime'
                  ? 'var(--tone-warning-text)'
                  : 'var(--tone-danger-text)'
            }`,
          }}
        >
          <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 11 }}>
            {actionResult.status === 'applied' ? 'Applied' : actionResult.status === 'unsupported_by_runtime' ? 'Unsupported' : 'Rejected'}
          </span>
          {' — '}
          {actionResult.action}: {actionResult.message}
        </div>
      )}
      {error && hasLoadedProjections && (
        <div style={{ ...noticeStyle, background: 'rgba(239,68,68,0.15)' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}
    </div>
  );
}

const panelStyle: CSSProperties = {
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  padding: 16,
  display: 'grid',
  gap: 12,
};

const buttonStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
};

const noticeStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  background: 'rgba(16,185,129,0.15)',
  padding: 10,
  color: 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};
