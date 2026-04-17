import { useNavigate } from 'react-router-dom';
import {
  Users,
  Wrench,
  GitBranch,
  BookOpen,
  MessageSquare,
  ArrowRight,
  Cpu,
  Activity,
  LayoutDashboard,
  Package,
} from 'lucide-react';
import { useStudioState } from '../../../lib/StudioStateContext';
import { StatCard } from '../../../components/ui/StatCard';
import { KpiGrid } from '../../../components/ui/KpiGrid';
import { DiagnosticsPanel } from '../../../components/ui/DiagnosticsPanel';
import { SectionCard } from '../../../components/ui/SectionCard';
import { WorkspaceSummaryCard } from '../components/WorkspaceSummaryCard';
import { FlowSummaryCard } from '../components/FlowSummaryCard';
import { PageHeader } from '../../../components';

export default function OverviewPage() {
  const { state } = useStudioState();
  const navigate  = useNavigate();

  const workspace    = state.workspace;
  const agents       = state.agents       ?? [];
  const skills       = state.skills       ?? [];
  const flows        = state.flows        ?? [];
  const profiles     = state.profiles     ?? [];
  const sessionCount = state.runtime?.sessions?.payload?.length ?? 0;
  const runtimeOk    = state.runtime?.health?.ok ?? false;
  const artifacts    = state.compile?.artifacts ?? [];
  const diagnostics  = state.compile?.diagnostics ?? [];

  const enabledAgents = agents.filter((a: any) => a.isEnabled !== false).length;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <PageHeader
        title={workspace?.name ?? 'Studio Overview'}
        icon={LayoutDashboard}
        description="Monitor your workspace, agents, flows, diagnostics, and runtime."
      />

      {/* KPI Row */}
      <KpiGrid cols={3}>
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
          helper="available templates"
          icon={<BookOpen size={22} />}
          onClick={() => navigate('/profiles')}
        />
        <StatCard
          label="Skills"
          value={skills.length}
          helper="installed"
          icon={<Wrench size={22} />}
        />
        <StatCard
          label="Flows"
          value={flows.length}
          helper={`${flows.filter((f) => f.isEnabled).length} enabled`}
          icon={<GitBranch size={22} />}
        />
        <StatCard
          label="Sessions"
          value={sessionCount}
          helper="gateway sessions"
          icon={<MessageSquare size={22} />}
          onClick={() => navigate('/sessions')}
        />
        <StatCard
          label="Runtime"
          value={runtimeOk ? 'Online' : 'Offline'}
          helper={runtimeOk ? 'Gateway responding' : 'Cannot reach gateway'}
          tone={runtimeOk ? 'success' : 'warning'}
          icon={<Activity size={22} />}
        />
      </KpiGrid>

      {/* Mid row: Workspace details + Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {workspace ? (
          <WorkspaceSummaryCard workspace={workspace} />
        ) : (
          <SectionCard title="Workspace" icon={<Package size={16} />}>
            <p className="text-sm text-slate-400">No workspace loaded.</p>
          </SectionCard>
        )}

        <SectionCard
          title="Compilation"
          icon={<Cpu size={16} />}
          description={`${artifacts.length} artifact${artifacts.length !== 1 ? 's' : ''} generated`}
        >
          <DiagnosticsPanel diagnostics={diagnostics} />
        </SectionCard>
      </div>

      {/* Bottom row: Flows + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FlowSummaryCard flows={flows} />

        <SectionCard title="Quick Actions" icon={<ArrowRight size={16} />}>
          <div className="space-y-2">
            {[
              { label: 'Edit Agents',    sub: `${agents.length} configured`,    Icon: Users,         path: '/agents' },
              { label: 'View Profiles',  sub: `${profiles.length} available`,   Icon: BookOpen,      path: '/profiles' },
              { label: 'View Sessions',  sub: `${sessionCount} active`,         Icon: MessageSquare, path: '/sessions' },
              { label: 'Deploy Studio',  sub: 'Compile & push changes',         Icon: Cpu,           path: '/studio' },
              { label: 'Diagnostics',    sub: `${diagnostics.length} issues`,   Icon: Activity,      path: '/diagnostics' },
            ].map(({ label, sub, Icon, path }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <Icon size={16} className="text-blue-600 flex-shrink-0" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-800 group-hover:text-blue-700">{label}</p>
                    <p className="text-xs text-slate-400">{sub}</p>
                  </div>
                </div>
                <ArrowRight size={14} className="text-slate-300 group-hover:text-blue-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
