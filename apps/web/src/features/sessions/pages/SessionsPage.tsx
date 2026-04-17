import { useStudioState } from '../../../lib/StudioStateContext';
import { MessageSquare, Circle } from 'lucide-react';
import { PageHeader, Card, Badge } from '../../../components';

export default function SessionsPage() {
  const { state } = useStudioState();

  const sessions = state.runtime?.sessions?.payload ?? [];

  const hasStatusData = sessions.some((s: any) => s?.status !== undefined);
  const activeCount = hasStatusData
    ? sessions.filter((s: any) => s?.status === 'active').length
    : sessions.length;
  const activeLabel = hasStatusData ? 'Active Now' : 'Sessions';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Sessions"
        description="Runtime session history and metrics"
        icon={MessageSquare}
      />

      {/* Sessions Table */}
      <Card className="p-0 overflow-hidden">
        {sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Session ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Channel</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Agent</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Messages</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((session: any, idx: number) => {
                  const s = session as {
                    id?: string;
                    agentId?: string;
                    status?: string;
                    channel?: string;
                    messages?: unknown[];
                    createdAt?: string;
                  };
                  return (
                    <tr key={s.id ?? idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm">
                        <code className="bg-slate-100 text-slate-900 px-2 py-1 rounded text-xs font-mono">
                          {s.id ? s.id.substring(0, 20) : `sess-${idx + 1}`}
                        </code>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          <Circle
                            size={8}
                            className={
                              s.status === 'active'
                                ? 'fill-emerald-500 text-emerald-500'
                                : 'fill-slate-300 text-slate-300'
                            }
                          />
                          <span className="text-xs text-slate-700">{s.status ?? 'unknown'}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{s.channel ?? '—'}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className="font-mono text-xs text-slate-900">{s.agentId ?? '—'}</span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2 text-slate-600">
                          <MessageSquare size={14} />
                          <span>{s.messages?.length ?? 0}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <MessageSquare size={40} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900">No sessions yet</h3>
            <p className="text-slate-600 text-sm mt-2">Sessions will appear here when agents start processing</p>
          </div>
        )}
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-slate-600">Total Sessions</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{sessions.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">{activeLabel}</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</p>
          <div className="mt-2">
            <Badge variant={activeCount > 0 ? 'success' : 'default'}>
              {activeCount > 0 ? 'Active' : 'None'}
            </Badge>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Avg Messages/Session</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {sessions.length > 0
              ? Math.round(
                  sessions.reduce((sum: number, s: any) => sum + (s?.messages?.length || 0), 0) /
                    sessions.length
                )
              : '—'}
          </p>
        </Card>
      </div>
    </div>
  );
}
