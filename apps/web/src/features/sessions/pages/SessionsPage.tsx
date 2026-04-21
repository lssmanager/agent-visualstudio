import { useMemo, useState } from 'react';
import { MessageSquare, Circle, Send } from 'lucide-react';
import { PageHeader, Card, Badge } from '../../../components';
import { useStudioState } from '../../../lib/StudioStateContext';
import { useHierarchy } from '../../../lib/HierarchyContext';

export default function SessionsPage() {
  const { state } = useStudioState();
  const { scope, canonical, selectedLineage } = useHierarchy();
  const [draft, setDraft] = useState('');
  const [localMessages, setLocalMessages] = useState<string[]>([]);

  const sessions = (state.runtime?.sessions?.payload ?? []) as Array<Record<string, unknown>>;

  const departmentWorkspaceIds = useMemo(() => {
    if (!scope.departmentId || !canonical) return null;
    return new Set(
      canonical.workspaces
        .filter((workspace) => workspace.departmentId === scope.departmentId)
        .map((workspace) => workspace.id),
    );
  }, [canonical, scope.departmentId]);

  const filteredSessions = useMemo(() => {
    if (scope.subagentId) {
      return sessions.filter((session) => session.agentId === scope.subagentId);
    }

    if (scope.agentId) {
      return sessions.filter((session) => session.agentId === scope.agentId);
    }

    if (scope.workspaceId) {
      return sessions.filter((session) => session.workspaceId === scope.workspaceId);
    }

    if (scope.departmentId && departmentWorkspaceIds) {
      return sessions.filter((session) => typeof session.workspaceId === 'string' && departmentWorkspaceIds.has(session.workspaceId));
    }

    if (scope.agencyId) {
      return sessions.filter((session) => session.agencyId === scope.agencyId || session.workspaceId !== undefined);
    }

    return sessions;
  }, [departmentWorkspaceIds, scope.agencyId, scope.agentId, scope.departmentId, scope.subagentId, scope.workspaceId, sessions]);

  const hasStatusData = filteredSessions.some((s) => s?.status !== undefined);
  const activeCount = hasStatusData
    ? filteredSessions.filter((s) => s?.status === 'active').length
    : filteredSessions.length;
  const activeLabel = hasStatusData ? 'Active Now' : 'Sessions';

  const contextLabel = selectedLineage.map((node) => node.label).join(' / ');
  const targetLevel = scope.subagentId
    ? 'subagent'
    : scope.agentId
      ? 'agent'
      : scope.workspaceId
        ? 'workspace'
        : scope.departmentId
          ? 'department'
          : scope.agencyId
            ? 'agency'
            : 'none';

  const canSend = targetLevel === 'agency' || targetLevel === 'department' || targetLevel === 'workspace';
  const sessionsSupported = canonical?.runtimeControl.capabilityMatrix.inspection.sessions ?? false;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader title="Sessions" description="Runtime session history and operational conversation surface" icon={MessageSquare} />

      {!scope.agencyId && (
        <div
          className="rounded-lg border p-4 text-sm"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
        >
          No agency selected. Create or connect an agency to inspect sessions.
        </div>
      )}

      <Card>
        <div className="space-y-3">
          <div>
            <div className="text-xs uppercase font-semibold" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              Active Context
            </div>
            <div className="text-sm" style={{ color: 'var(--text-primary)' }}>{contextLabel || 'No context selected'}</div>
          </div>

          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
            <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Operational Message</div>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Allowed levels: agency, department, workspace. Current target: {targetLevel}.
            </p>
            {!sessionsSupported ? (
              <p className="text-xs mt-2" style={{ color: 'var(--tone-warning-text)' }}>
                unsupported_by_runtime: session command channel is not available in current runtime capability matrix.
              </p>
            ) : (
              <div className="mt-2 flex gap-2">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={canSend ? 'Write a message to current context...' : 'Select agency/department/workspace to send'}
                  disabled={!canSend}
                  style={{
                    flex: 1,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--input-text)',
                    padding: '10px 12px',
                    fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  disabled={!canSend || draft.trim().length === 0}
                  onClick={() => {
                    if (!canSend || draft.trim().length === 0) return;
                    setLocalMessages((previous) => [`${new Date().toLocaleTimeString()} — ${draft.trim()}`, ...previous].slice(0, 8));
                    setDraft('');
                  }}
                  style={{
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-primary)',
                    background: canSend ? 'var(--btn-primary-bg)' : 'var(--bg-secondary)',
                    color: canSend ? 'var(--btn-primary-text)' : 'var(--text-muted)',
                    padding: '0 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Send size={12} />
                  Send
                </button>
              </div>
            )}
            {localMessages.length > 0 && (
              <ul className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                {localMessages.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {filteredSessions.length > 0 ? (
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
                {filteredSessions.map((session, idx) => {
                  const s = session as {
                    id?: string;
                    agentId?: string;
                    status?: string;
                    channel?: string;
                    messages?: unknown[];
                  };
                  return (
                    <tr key={s.id ?? idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm">
                        <code className="bg-slate-100 text-slate-900 px-2 py-1 rounded text-xs font-mono">{s.id ? s.id.substring(0, 20) : `sess-${idx + 1}`}</code>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          <Circle size={8} className={s.status === 'active' ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300'} />
                          <span className="text-xs text-slate-700">{s.status ?? 'unknown'}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{s.channel ?? '—'}</td>
                      <td className="px-6 py-4 text-sm"><span className="font-mono text-xs text-slate-900">{s.agentId ?? '—'}</span></td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2 text-slate-600"><MessageSquare size={14} /><span>{s.messages?.length ?? 0}</span></div>
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
            <h3 className="text-lg font-semibold text-slate-900">No sessions for current context</h3>
            <p className="text-slate-600 text-sm mt-2">Adjust hierarchy context or wait for runtime activity</p>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-slate-600">Total Sessions</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{filteredSessions.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">{activeLabel}</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</p>
          <div className="mt-2">
            <Badge variant={activeCount > 0 ? 'success' : 'default'}>{activeCount > 0 ? 'Active' : 'None'}</Badge>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-600">Avg Messages/Session</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            {filteredSessions.length > 0
              ? Math.round(filteredSessions.reduce((sum, s) => sum + ((s.messages as unknown[] | undefined)?.length ?? 0), 0) / filteredSessions.length)
              : '—'}
          </p>
        </Card>
      </div>
    </div>
  );
}
