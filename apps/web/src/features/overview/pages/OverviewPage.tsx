import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRightLeft,
  BookOpen,
  Bot,
  PlayCircle,
  DollarSign,
  GitBranch,
  Plus,
  Radar,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { getUsage } from '../../../lib/api';
import { useStudioState } from '../../../lib/StudioStateContext';
import {
  RuntimeStatusBadge,
  StudioEmptyState,
  StudioHeroSection,
  StudioInspectorCard,
  StudioKpiCard,
  StudioMetricRow,
  StudioPageShell,
  StudioSectionCard,
  StudioTimelineBlock,
} from '../../../components/ui';
import { RuntimeHealthWidget } from '../components/widgets/RuntimeHealthWidget';
import { SessionsTrendWidget } from '../components/widgets/SessionsTrendWidget';
import { ToolCallsWidget } from '../components/widgets/ToolCallsWidget';
import { FlowsHealthWidget } from '../components/widgets/FlowsHealthWidget';
import { DashboardChartsSection } from '../components/DashboardChartsSection';

function actionButtonStyle(primary = false): CSSProperties {
  if (primary) {
    return {
      borderRadius: 'var(--radius-md)',
      border: 'none',
      background: 'var(--btn-primary-bg)',
      color: 'var(--btn-primary-text)',
      padding: '9px 14px',
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
    };
  }

  return {
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-primary)',
    background: 'var(--card-bg)',
    color: 'var(--text-primary)',
    padding: '9px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };
}

export default function OverviewPage() {
  const { state } = useStudioState();
  const navigate = useNavigate();

  const [costValue, setCostValue] = useState('N/A');

  const agents = state.agents ?? [];
  const profiles = state.profiles ?? [];
  const flows = state.flows ?? [];
  const skills = state.skills ?? [];
  const runtimeOk = state.runtime?.health?.ok ?? false;
  const diagnosticsCount = state.compile?.diagnostics?.length ?? 0;
  const sessionCount = state.runtime?.sessions?.payload?.length ?? 0;

  const enabledAgents = agents.filter((agent) => agent.isEnabled !== false).length;
  const enabledFlows = flows.filter((flow) => flow.isEnabled).length;

  useEffect(() => {
    getUsage()
      .then((data) => setCostValue(`$${data.totalCost.toFixed(2)}`))
      .catch(() => setCostValue('N/A'));
  }, []);

  const recentActivity = useMemo(() => {
    const items: Array<{ title: string; description: string; meta?: string }> = [];

    items.push({
      title: runtimeOk ? 'Runtime heartbeat healthy' : 'Runtime heartbeat degraded',
      description: runtimeOk
        ? 'Gateway responds to health checks and runtime controls.'
        : 'Gateway checks failed. Review diagnostics before deploying.',
      meta: diagnosticsCount > 0 ? `${diagnosticsCount} compile diagnostic(s) pending` : 'No compile diagnostics',
    });

    items.push({
      title: `${sessionCount} active session${sessionCount === 1 ? '' : 's'}`,
      description: sessionCount > 0
        ? 'Live conversations are currently routed through gateway sessions.'
        : 'No active sessions right now.',
      meta: 'Sessions surface updates from runtime.',
    });

    items.push({
      title: `${enabledFlows}/${flows.length} flows enabled`,
      description: flows.length > 0
        ? 'Routing graph has active paths and can execute run triggers.'
        : 'No flows created yet.',
      meta: `${enabledAgents}/${agents.length} agents enabled`,
    });

    return items;
  }, [runtimeOk, diagnosticsCount, sessionCount, enabledFlows, flows.length, enabledAgents, agents.length]);

  return (
    <StudioPageShell>
      <StudioHeroSection
        eyebrow="Studio Control Plane"
        title={state.workspace?.name ?? 'Workspace Overview'}
        description={
          state.workspace?.description ??
          'Monitor runtime health, editing readiness, and routing posture from a single dashboard surface.'
        }
        actions={
          <>
            <button type="button" style={actionButtonStyle(true)} onClick={() => navigate('/workspace-studio')}>
              <Sparkles size={14} />
              Open Workspace Studio
            </button>
            <button type="button" style={actionButtonStyle()} onClick={() => navigate('/agents/new')}>
              <Plus size={14} />
              New Agent
            </button>
            <button type="button" style={actionButtonStyle()} onClick={() => navigate('/routing')}>
              <GitBranch size={14} />
              Edit Flows
            </button>
            <button type="button" style={actionButtonStyle()} onClick={() => navigate('/runs')}>
              <PlayCircle size={14} />
              Open Runs Console
            </button>
          </>
        }
        meta={<RuntimeStatusBadge status={runtimeOk ? 'online' : 'degraded'} label={runtimeOk ? 'runtime online' : 'runtime degraded'} />}
      />

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <StudioKpiCard label="Agents" value={agents.length} helper={`${enabledAgents} enabled`} icon={<Bot size={18} />} onClick={() => navigate('/agents')} />
        <StudioKpiCard label="Profiles" value={profiles.length} helper="Role templates" icon={<BookOpen size={18} />} onClick={() => navigate('/profiles')} />
        <StudioKpiCard label="Flows" value={flows.length} helper={`${enabledFlows} enabled`} icon={<GitBranch size={18} />} onClick={() => navigate('/routing')} />
        <StudioKpiCard label="Sessions" value={sessionCount} helper="Live runtime" icon={<Radar size={18} />} onClick={() => navigate('/sessions')} />
        <StudioKpiCard label="Runtime" value={runtimeOk ? 'Online' : 'Degraded'} helper={runtimeOk ? 'Gateway healthy' : 'Action needed'} tone={runtimeOk ? 'success' : 'warning'} icon={<Activity size={18} />} onClick={() => navigate('/diagnostics')} />
        <StudioKpiCard label="Usage Cost" value={costValue} helper="Current period" icon={<DollarSign size={18} />} onClick={() => navigate('/operations')} />
      </section>

      {/* ── Fase 6: Dashboard analítico ── */}
      <DashboardChartsSection />

      <section
        className="studio-responsive-two-col"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)',
          gap: 14,
          alignItems: 'start',
        }}
      >
        <StudioSectionCard
          title="Runtime Health Summary"
          description="Live telemetry from runtime, sessions, flows and tool surfaces."
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 10 }}>
            <div style={{ gridColumn: 'span 4' }}>
              <RuntimeHealthWidget runtimeOk={runtimeOk} diagnosticsCount={diagnosticsCount} />
            </div>
            <div style={{ gridColumn: 'span 4' }}>
              <SessionsTrendWidget sessionCount={sessionCount} />
            </div>
            <div style={{ gridColumn: 'span 4' }}>
              <ToolCallsWidget skills={skills} />
            </div>
            <div style={{ gridColumn: 'span 12' }}>
              <FlowsHealthWidget flows={flows} />
            </div>
          </div>
        </StudioSectionCard>

        <StudioSectionCard
          title="Recent Changes"
          description="Operational timeline snapshot for this workspace."
          actions={
            <button type="button" style={actionButtonStyle()} onClick={() => navigate('/operations')}>
              <ArrowRightLeft size={13} />
              Open Operations
            </button>
          }
        >
          <StudioTimelineBlock items={recentActivity} />
        </StudioSectionCard>
      </section>

      <section className="studio-responsive-three-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
        <StudioSectionCard title="Agents" description="Builder inventory">
          {agents.length === 0 ? (
            <StudioEmptyState
              title="No agents configured"
              description="Create your first agent profile to start orchestrating the workspace."
              actionLabel="Create Agent"
              onAction={() => navigate('/agents/new')}
            />
          ) : (
            <StudioInspectorCard title="Current roster">
              {agents.slice(0, 4).map((agent) => (
                <StudioMetricRow
                  key={agent.id}
                  label={agent.name}
                  value={agent.isEnabled !== false ? 'Enabled' : 'Disabled'}
                  hint={agent.role || 'No role'}
                />
              ))}
            </StudioInspectorCard>
          )}
        </StudioSectionCard>

        <StudioSectionCard title="Profiles" description="Reusable setup packs">
          {profiles.length === 0 ? (
            <StudioEmptyState
              title="No profiles yet"
              description="Profiles define repeatable defaults for model, skill bundle and routines."
              actionLabel="Open Profiles"
              onAction={() => navigate('/profiles')}
            />
          ) : (
            <StudioInspectorCard title="Available presets">
              {profiles.slice(0, 4).map((profile) => (
                <StudioMetricRow
                  key={profile.id}
                  label={profile.name}
                  value={profile.category || 'General'}
                  hint={profile.defaultModel ? `Default model: ${profile.defaultModel}` : 'No default model'}
                />
              ))}
            </StudioInspectorCard>
          )}
        </StudioSectionCard>

        <StudioSectionCard title="Flows" description="Routing graph inventory">
          {flows.length === 0 ? (
            <StudioEmptyState
              title="No flows configured"
              description="Define runtime routing in the flow editor to connect triggers, tools, and agents."
              actionLabel="Open Routing"
              onAction={() => navigate('/routing')}
            />
          ) : (
            <StudioInspectorCard title="Pipeline summary">
              {flows.slice(0, 4).map((flow) => (
                <StudioMetricRow
                  key={flow.id}
                  label={flow.name}
                  value={flow.isEnabled ? 'Enabled' : 'Disabled'}
                  hint={`${flow.nodes?.length ?? 0} nodes / ${flow.edges?.length ?? 0} edges`}
                />
              ))}
            </StudioInspectorCard>
          )}
        </StudioSectionCard>
      </section>

      <StudioSectionCard title="Quick Actions" description="Common control-plane jumps">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
          <button type="button" style={actionButtonStyle()} onClick={() => navigate('/workspace-studio')}>
            <Wrench size={14} />
            Enter Builder
          </button>
          <button type="button" style={actionButtonStyle()} onClick={() => navigate('/agency-topology')}>
            <GitBranch size={14} />
            View Topology
          </button>
          <button type="button" style={actionButtonStyle()} onClick={() => navigate('/diagnostics')}>
            <Activity size={14} />
            Open Diagnostics
          </button>
          <button type="button" style={actionButtonStyle()} onClick={() => navigate('/commands')}>
            <Radar size={14} />
            Commands Console
          </button>
        </div>
      </StudioSectionCard>
    </StudioPageShell>
  );
}
