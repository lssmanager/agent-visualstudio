import { useStudioState } from '../../../lib/StudioStateContext';
import { Activity, Circle, MessageSquare } from 'lucide-react';
import { PageHeader, Alert, Card } from '../../../components';
import { StatCard } from '../../../components/ui/StatCard';
import { KpiGrid } from '../../../components/ui/KpiGrid';
import { DiagnosticsPanel } from '../../../components/ui/DiagnosticsPanel';

export default function DiagnosticsPage() {
  const { state } = useStudioState();

  const runtimeOk          = state.runtime?.health?.ok ?? false;
  const compileDiagnostics = state.compile?.diagnostics ?? [];
  const sessions           = state.runtime?.sessions?.payload ?? [];
  const workspace          = state.workspace;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Diagnostics"
        icon={Activity}
        description="System health, runtime status, and compilation diagnostics"
      />

      {/* KPI cards */}
      <KpiGrid cols={4}>
        <StatCard
          label="Runtime"
          value={runtimeOk ? 'Online' : 'Offline'}
          helper={runtimeOk ? 'Gateway responding' : 'Cannot reach gateway'}
          tone={runtimeOk ? 'success' : 'warning'}
          icon={<Activity size={20} />}
        />
        <StatCard
          label="Compilation"
          value={compileDiagnostics.length === 0 ? 'Clean' : compileDiagnostics.length}
          helper={compileDiagnostics.length === 0 ? 'No issues detected' : `${compileDiagnostics.length} issue${compileDiagnostics.length > 1 ? 's' : ''}`}
          tone={compileDiagnostics.length > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Workspace"
          value={workspace ? 'Active' : 'None'}
          helper={workspace ? workspace.name : 'No workspace loaded'}
          tone={workspace ? 'success' : 'default'}
        />
        <StatCard
          label="Sessions"
          value={sessions.length}
          helper="active gateway sessions"
          icon={<MessageSquare size={20} />}
        />
      </KpiGrid>

      {/* Compile diagnostics panel */}
      <DiagnosticsPanel diagnostics={compileDiagnostics} title="Compile Diagnostics" />

      {/* Sessions table */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <MessageSquare size={16} className="text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-900">Active Sessions</h3>
          <span className="ml-auto text-xs text-slate-400">{sessions.length} total</span>
        </div>

        {sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left py-3 px-5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Session ID</th>
                  <th className="text-left py-3 px-5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left py-3 px-5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Channel</th>
                  <th className="text-left py-3 px-5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Agent</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 10).map((session: any, idx: number) => {
                  const s = session as { id?: string; agentId?: string; status?: string; channel?: string };
                  return (
                    <tr key={s.id ?? idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-5 font-mono text-xs text-slate-800">
                        {s.id ? s.id.substring(0, 16) + '…' : `session-${idx + 1}`}
                      </td>
                      <td className="py-3 px-5">
                        <span className="inline-flex items-center gap-1.5">
                          <Circle
                            size={8}
                            className={s.status === 'active' ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300'}
                          />
                          <span className="text-xs text-slate-600">{s.status ?? 'unknown'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-5 text-xs text-slate-600">{s.channel ?? '—'}</td>
                      <td className="py-3 px-5 font-mono text-xs text-slate-600">{s.agentId ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sessions.length > 10 && (
              <p className="px-5 py-3 text-xs text-slate-400">Showing 10 of {sessions.length} sessions</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare size={36} className="text-slate-200 mb-3" />
            <p className="text-sm font-medium text-slate-500">No active sessions</p>
            <p className="text-xs text-slate-400 mt-1">Sessions appear here when agents start processing</p>
          </div>
        )}
      </Card>

      {/* Compile errors detailed list */}
      {compileDiagnostics.length > 0 && (
        <Alert variant="warning" title="Compilation Issues">
          <ul className="space-y-1.5 mt-1">
            {compileDiagnostics.map((d: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-amber-500 flex-shrink-0">▸</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}
