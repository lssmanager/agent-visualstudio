import { useNavigate } from 'react-router-dom';
import {
  Package,
  Users,
  Wrench,
  GitBranch,
  BookOpen,
  MessageSquare,
  Zap,
  ArrowRight,
  LayoutDashboard,
  Cpu,
} from 'lucide-react';
import { useStudioState } from '../../../lib/StudioStateContext';
import { Card, Badge, PageHeader } from '../../../components';

export default function OverviewPage() {
  const { state } = useStudioState();
  const navigate = useNavigate();

  const workspace = state.workspace;
  const agents = state.agents ?? [];
  const skills = state.skills ?? [];
  const flows = state.flows ?? [];
  const profiles = state.profiles ?? [];
  const sessionCount = state.runtime?.sessions?.payload?.length ?? 0;
  const runtimeOk = state.runtime?.ok ?? false;
  const artifacts = state.compile?.artifacts ?? [];
  const diagnostics = state.compile?.diagnostics ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Overview"
        description="Workspace summary, runtime health, and quick navigation"
        icon={LayoutDashboard}
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Workspace */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Package size={18} className="text-blue-600" />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Workspace</span>
            </div>
            <Badge variant="success">Active</Badge>
          </div>
          <p className="text-xl font-bold text-slate-900 truncate">{workspace?.name ?? '—'}</p>
          {workspace?.slug && (
            <p className="text-sm text-slate-500 mt-1 font-mono">{workspace.slug}</p>
          )}
        </Card>

        {/* Agents */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={18} className="text-blue-600" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Agents</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{agents.length}</p>
          <p className="text-sm text-slate-500 mt-1">in this workspace</p>
        </Card>

        {/* Skills */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wrench size={18} className="text-blue-600" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Skills</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{skills.length}</p>
          <p className="text-sm text-slate-500 mt-1">available</p>
        </Card>

        {/* Flows */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch size={18} className="text-blue-600" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Flows</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{flows.length}</p>
          <p className="text-sm text-slate-500 mt-1">configured</p>
        </Card>

        {/* Profiles */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={18} className="text-blue-600" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Profiles</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{profiles.length}</p>
          <p className="text-sm text-slate-500 mt-1">loaded</p>
        </Card>

        {/* Sessions */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={18} className="text-blue-600" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Sessions</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{sessionCount}</p>
          <p className="text-sm text-slate-500 mt-1">gateway sessions</p>
        </Card>
      </div>

      {/* Runtime Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Runtime Status */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`w-3 h-3 rounded-full flex-shrink-0 ${
                runtimeOk ? 'bg-emerald-500' : 'bg-red-500'
              }`}
            />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Runtime</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{runtimeOk ? 'Online' : 'Offline'}</p>
          <p className="text-sm text-slate-600 mt-1">
            {runtimeOk ? 'Gateway responding' : 'Cannot reach gateway'}
          </p>
        </Card>

        {/* Compilation */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <Zap size={18} className="text-blue-600" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Compilation</span>
            <Badge variant={diagnostics.length > 0 ? 'warning' : 'success'}>
              {diagnostics.length > 0 ? `${diagnostics.length} issues` : 'Clean'}
            </Badge>
          </div>
          <p className="text-2xl font-bold text-slate-900">{artifacts.length}</p>
          <p className="text-sm text-slate-600 mt-1">artifacts generated</p>
        </Card>
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            clickable
            onClick={() => navigate('/agents')}
            className="p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users size={20} className="text-blue-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Edit Agents</p>
                  <p className="text-xs text-slate-500">{agents.length} configured</p>
                </div>
              </div>
              <ArrowRight size={16} className="text-slate-400" />
            </div>
          </Card>

          <Card
            clickable
            onClick={() => navigate('/sessions')}
            className="p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageSquare size={20} className="text-blue-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">View Sessions</p>
                  <p className="text-xs text-slate-500">{sessionCount} active</p>
                </div>
              </div>
              <ArrowRight size={16} className="text-slate-400" />
            </div>
          </Card>

          <Card
            clickable
            onClick={() => navigate('/studio')}
            className="p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Cpu size={20} className="text-blue-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Deploy Studio</p>
                  <p className="text-xs text-slate-500">Edit & deploy agents</p>
                </div>
              </div>
              <ArrowRight size={16} className="text-slate-400" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
