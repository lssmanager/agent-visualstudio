import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Wrench,
  GitBranch,
  BookOpen,
  MessageSquare,
  Activity,
  DollarSign,
  Settings,
  Save,
  ChevronDown,
  X,
} from 'lucide-react';
import { useStudioState } from '../../../lib/StudioStateContext';
import { saveAgent, getUsage } from '../../../lib/api';
import { StatCard } from '../../../components/ui/StatCard';
import { KpiGrid } from '../../../components/ui/KpiGrid';
import { SectionCard } from '../../../components/ui/SectionCard';
import { OverviewHero } from '../components/OverviewHero';
import { OverviewTabs, type OverviewTab } from '../components/OverviewTabs';
import { RuntimeHealthWidget } from '../components/widgets/RuntimeHealthWidget';
import { SessionsTrendWidget } from '../components/widgets/SessionsTrendWidget';
import { ToolCallsWidget } from '../components/widgets/ToolCallsWidget';
import { FlowsHealthWidget } from '../components/widgets/FlowsHealthWidget';
import { AgentOverviewCard } from '../components/AgentOverviewCard';
import { ProfileOverviewCard } from '../components/ProfileOverviewCard';
import { ActivityFeed } from '../components/ActivityFeed';
import { FlowSummaryCard } from '../components/FlowSummaryCard';
import { useDashboardLayout } from '../lib/use-dashboard-layout';

// ── Widget registry ─────────────────────────────────────────────────
type WidgetRenderer = (props: { runtimeOk: boolean; diagnosticsCount: number; sessionCount: number; skills: any[]; flows: any[] }) => ReactNode;

const WIDGET_REGISTRY: Record<string, { label: string; render: WidgetRenderer; colSpan: 1 | 2 }> = {
  'runtime-health': {
    label: 'Runtime Health',
    colSpan: 1,
    render: ({ runtimeOk, diagnosticsCount }) => <RuntimeHealthWidget runtimeOk={runtimeOk} diagnosticsCount={diagnosticsCount} />,
  },
  'sessions-trend': {
    label: 'Sessions Trend',
    colSpan: 1,
    render: ({ sessionCount }) => <SessionsTrendWidget sessionCount={sessionCount} />,
  },
  'tool-calls': {
    label: 'Tool Calls',
    colSpan: 1,
    render: ({ skills }) => <ToolCallsWidget skills={skills} />,
  },
  'flows-health': {
    label: 'Flows Health',
    colSpan: 2,
    render: ({ flows }) => <FlowsHealthWidget flows={flows} />,
  },
};

// ── Small button style helper ───────────────────────────────────────
const smallBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};

export default function OverviewPage() {
  const { state, refresh } = useStudioState();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<OverviewTab>('overview');
  const [costValue, setCostValue] = useState<string>('N/A');
  const [viewDropdown, setViewDropdown] = useState(false);

  const {
    currentView,
    savedViews,
    widgets: widgetConfigs,
    setCurrentView,
    saveView,
    isEditing,
    setEditing,
    toggleWidget,
    removeWidget,
  } = useDashboardLayout();

  const workspace    = state.workspace;
  const agents       = state.agents       ?? [];
  const skills       = state.skills       ?? [];
  const flows        = state.flows        ?? [];
  const profiles     = state.profiles     ?? [];
  const sessionCount = state.runtime?.sessions?.payload?.length ?? 0;
  const runtimeOk    = state.runtime?.health?.ok ?? false;
  const diagnostics  = state.compile?.diagnostics ?? [];

  const enabledAgents = agents.filter((a) => a.isEnabled !== false).length;
  const enabledFlows  = flows.filter((f) => f.isEnabled).length;

  // Phase D: Fetch usage cost on mount
  useEffect(() => {
    getUsage()
      .then((data) => setCostValue(`$${data.totalCost.toFixed(2)}`))
      .catch(() => setCostValue('N/A'));
  }, []);

  const show = (section: OverviewTab) =>
    activeTab === 'overview' || activeTab === section;

  // Phase D: Agent toggle handler
  const handleAgentToggle = async (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    try {
      await saveAgent({ ...agent, isEnabled: !agent.isEnabled });
      await refresh();
    } catch { /* graceful fail */ }
  };

  // Visible widgets sorted by position
  const visibleWidgets = [...widgetConfigs]
    .filter((w) => w.visible && WIDGET_REGISTRY[w.id])
    .sort((a, b) => a.position - b.position);

  const widgetProps = { runtimeOk, diagnosticsCount: diagnostics.length, sessionCount, skills, flows };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Hero ─────────────────────────────────── */}
      <OverviewHero
        workspaceName={workspace?.name ?? 'Studio Overview'}
        description={workspace?.description}
      />

      {/* ── Tabs ─────────────────────────────────── */}
      <OverviewTabs active={activeTab} onChange={setActiveTab} />

      {/* ── KPI Row (6-col) ──────────────────────── */}
      {show('overview') && (
        <KpiGrid cols={6}>
          <StatCard
            label="Agents"
            value={agents.length}
            helper={`${enabledAgents} enabled`}
            icon={<Users size={22} />}
            onClick={() => navigate('/agents')}
          />
          <StatCard
            label="Profiles"
            value={profiles.length}
            helper="templates"
            icon={<BookOpen size={22} />}
            onClick={() => navigate('/profiles')}
          />
          <StatCard
            label="Flows"
            value={flows.length}
            helper={`${enabledFlows} enabled`}
            icon={<GitBranch size={22} />}
            onClick={() => navigate('/routing')}
          />
          <StatCard
            label="Sessions"
            value={sessionCount}
            helper="gateway"
            icon={<MessageSquare size={22} />}
            onClick={() => navigate('/sessions')}
          />
          <StatCard
            label="Runtime"
            value={runtimeOk ? 'Online' : 'Offline'}
            helper={runtimeOk ? 'Gateway OK' : 'Unreachable'}
            tone={runtimeOk ? 'success' : 'warning'}
            icon={<Activity size={22} />}
          />
          <StatCard
            label="Cost"
            value={costValue}
            helper="this period"
            icon={<DollarSign size={22} />}
          />
        </KpiGrid>
      )}

      {/* ── Main 2-col grid: Widgets + Activity ── */}
      {show('overview') && (
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: '1.35fr 0.9fr' }}
        >
          {/* Left: Widget section */}
          <SectionCard
            title="Widgets"
            icon={<Wrench size={16} />}
            description={currentView?.name ?? 'Operational overview'}
            bodyClassName="!p-0"
            actions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
                {/* View selector */}
                <button
                  style={smallBtnStyle}
                  onClick={() => setViewDropdown(!viewDropdown)}
                >
                  <ChevronDown size={12} />
                  {currentView?.name ?? 'Default'}
                </button>
                {viewDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 4,
                      background: 'var(--card-bg)',
                      border: '1px solid var(--card-border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-lg)',
                      zIndex: 50,
                      minWidth: 180,
                      padding: 4,
                    }}
                  >
                    {savedViews.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => { setCurrentView(v.id); setViewDropdown(false); }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 12px',
                          fontSize: 13,
                          fontWeight: v.id === currentView?.id ? 600 : 400,
                          color: v.id === currentView?.id ? 'var(--color-primary)' : 'var(--text-primary)',
                          background: v.id === currentView?.id ? 'var(--color-primary-soft)' : 'transparent',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                        }}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Edit toggle */}
                <button
                  style={{
                    ...smallBtnStyle,
                    background: isEditing ? 'var(--color-primary-soft)' : 'var(--bg-primary)',
                    color: isEditing ? 'var(--color-primary)' : 'var(--text-secondary)',
                    borderColor: isEditing ? 'var(--color-primary)' : 'var(--border-primary)',
                  }}
                  onClick={() => setEditing(!isEditing)}
                >
                  <Settings size={12} />
                  {isEditing ? 'Done' : 'Edit'}
                </button>

                {/* Save view */}
                {isEditing && (
                  <button
                    style={{ ...smallBtnStyle, background: 'var(--color-primary-soft)', color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
                    onClick={() => {
                      const name = prompt('View name:');
                      if (name) saveView(name);
                    }}
                  >
                    <Save size={12} />
                    Save
                  </button>
                )}
              </div>
            }
          >
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Dynamic widgets from layout */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {visibleWidgets.map((wc) => {
                  const entry = WIDGET_REGISTRY[wc.id];
                  if (!entry) return null;
                  return (
                    <div
                      key={wc.id}
                      style={{
                        gridColumn: (wc.colSpan ?? entry.colSpan) > 1 ? 'span 2' : undefined,
                        position: 'relative',
                      }}
                    >
                      {isEditing && (
                        <button
                          onClick={() => removeWidget(wc.id)}
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            zIndex: 10,
                            width: 22,
                            height: 22,
                            borderRadius: 'var(--radius-full)',
                            border: '1px solid var(--tone-danger-border)',
                            background: 'var(--tone-danger-bg)',
                            color: 'var(--tone-danger-text)',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                            fontSize: 12,
                          }}
                        >
                          <X size={12} />
                        </button>
                      )}
                      {entry.render(widgetProps)}
                    </div>
                  );
                })}
              </div>

              {/* Add widget placeholder (always shown in edit mode) */}
              {isEditing && (
                <div
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    border: '2px dashed var(--border-primary)',
                    background: 'var(--bg-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 80,
                    padding: 16,
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    // Show available widgets that can be added
                    const hidden = Object.keys(WIDGET_REGISTRY).filter(
                      (id) => !widgetConfigs.some((w) => w.id === id && w.visible),
                    );
                    if (hidden.length === 0) {
                      alert('All widgets are already visible');
                      return;
                    }
                    const label = hidden.map((id) => WIDGET_REGISTRY[id]?.label ?? id).join('\n');
                    const toAdd = hidden[0]; // Add first hidden widget
                    toggleWidget(toAdd);
                  }}
                >
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                    + Add widget
                  </p>
                </div>
              )}

              {/* Static placeholder when not editing and some widget removed */}
              {!isEditing && visibleWidgets.length < Object.keys(WIDGET_REGISTRY).length && (
                <div
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    border: '2px dashed var(--border-primary)',
                    background: 'var(--bg-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 60,
                    padding: 16,
                  }}
                >
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                    + Add widget · <span style={{ fontSize: 11 }}>click Edit to customize</span>
                  </p>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Right: Activity + Alerts */}
          <ActivityFeed
            runtimeOk={runtimeOk}
            diagnostics={diagnostics}
            agentCount={agents.length}
            enabledAgentCount={enabledAgents}
            profileCount={profiles.length}
            flowCount={flows.length}
            enabledFlowCount={enabledFlows}
            sessionCount={sessionCount}
          />
        </div>
      )}

      {/* ── Agents Section ───────────────────────── */}
      {show('agents') && (
        <SectionCard
          title="Agents"
          icon={<Users size={16} />}
          description={`${agents.length} configured · ${enabledAgents} enabled`}
        >
          {agents.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
              No agents configured yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {agents.map((agent) => (
                <AgentOverviewCard
                  key={agent.id}
                  agent={agent}
                  flows={flows}
                  onClick={() => navigate(`/agents/${agent.id}`)}
                  onToggle={() => handleAgentToggle(agent.id)}
                />
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Profiles + Flows Section ─────────────── */}
      {show('profiles') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard
            title="Profiles"
            icon={<BookOpen size={16} />}
            description={`${profiles.length} available`}
          >
            {profiles.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>
                No profiles available.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {profiles.map((p) => (
                  <ProfileOverviewCard key={p.id} profile={p} onClick={() => navigate('/profiles')} />
                ))}
              </div>
            )}
          </SectionCard>

          <FlowSummaryCard flows={flows} />
        </div>
      )}

      {/* ── Flows tab (standalone) ───────────────── */}
      {activeTab === 'flows' && (
        <FlowSummaryCard flows={flows} />
      )}

      {/* ── Runtime tab ──────────────────────────── */}
      {activeTab === 'runtime' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <RuntimeHealthWidget runtimeOk={runtimeOk} diagnosticsCount={diagnostics.length} />
          <SessionsTrendWidget sessionCount={sessionCount} />
        </div>
      )}
    </div>
  );
}
