import { useCallback, useMemo, useState } from 'react';
import { MessageSquare, Circle, RefreshCw, Terminal, ChevronRight, AlertTriangle } from 'lucide-react';
import { PageHeader, Card } from '../../../components';
import { useStudioState } from '../../../lib/StudioStateContext';
import { useHierarchy } from '../../../lib/HierarchyContext';
import { sendRuntimeCommand, getRuntimeSessions } from '../../../lib/api';
import type { CanonicalNodeLevel, SessionState, TopologyActionResult, TopologyRuntimeAction } from '../../../lib/types';

const RUNTIME_ACTIONS: Array<{ value: TopologyRuntimeAction; label: string; description: string }> = [
  { value: 'pause', label: 'Pause', description: 'Suspend active sessions in this scope' },
  { value: 'reactivate', label: 'Reactivate', description: 'Resume paused sessions' },
  { value: 'continue', label: 'Continue', description: 'Signal sessions to proceed' },
  { value: 'disconnect', label: 'Disconnect', description: 'Disconnect sessions from the runtime' },
  { value: 'connect', label: 'Connect', description: 'Initiate connection for this scope' },
  { value: 'redirect', label: 'Redirect', description: 'Redirect sessions to a different target' },
];

export default function SessionsPage() {
  const { state, refresh } = useStudioState();
  const { scope, canonical, selectedLineage } = useHierarchy();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [commandAction, setCommandAction] = useState<TopologyRuntimeAction>('pause');
  const [sending, setSending] = useState(false);
  const [commandResult, setCommandResult] = useState<TopologyActionResult | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Resolve scope level/id for runtime command ────────────────────────
  const { scopeLevel, scopeId } = useMemo<{ scopeLevel: CanonicalNodeLevel | null; scopeId: string | null }>(() => {
    if (scope.agentId) return { scopeLevel: 'agent', scopeId: scope.agentId };
    if (scope.workspaceId) return { scopeLevel: 'workspace', scopeId: scope.workspaceId };
    if (scope.departmentId) return { scopeLevel: 'department', scopeId: scope.departmentId };
    if (scope.agencyId) return { scopeLevel: 'agency', scopeId: scope.agencyId };
    return { scopeLevel: null, scopeId: null };
  }, [scope]);

  // ── Capability checks ─────────────────────────────────────────────────
  const capMatrix = canonical?.runtimeControl.capabilityMatrix;
  const sessionsSupported = capMatrix?.inspection.sessions ?? false;

  const supportedActions = useMemo(() => {
    if (!capMatrix) return [];
    return RUNTIME_ACTIONS.filter((a) => capMatrix.topology[a.value] === true);
  }, [capMatrix]);

  const canSendCommand = Boolean(scopeLevel && scopeId && supportedActions.length > 0);

  // ── Sessions data ─────────────────────────────────────────────────────
  const sessions = useMemo<SessionState[]>(() => {
    if (canonical?.runtimeControl.sessions?.length) {
      return canonical.runtimeControl.sessions;
    }
    const fallback = (state.runtime?.sessions?.payload ?? []) as Array<Record<string, unknown>>;
    return fallback.map((raw, index) => ({
      ref: {
        id: typeof raw.id === 'string' ? raw.id : `session-${index + 1}`,
        agencyId: typeof raw.agencyId === 'string' ? raw.agencyId : undefined,
        departmentId: typeof raw.departmentId === 'string' ? raw.departmentId : undefined,
        workspaceId: typeof raw.workspaceId === 'string' ? raw.workspaceId : undefined,
      },
      status: typeof raw.status === 'string' ? (raw.status as SessionState['status']) : 'unknown',
      metadata: raw,
    }));
  }, [canonical?.runtimeControl.sessions, state.runtime?.sessions?.payload]);

  const departmentWorkspaceIds = useMemo(() => {
    if (!scope.departmentId || !canonical) return null;
    return new Set(
      canonical.workspaces
        .filter((workspace) => workspace.departmentId === scope.departmentId)
        .map((workspace) => workspace.id),
    );
  }, [canonical, scope.departmentId]);

  const filteredSessions = useMemo(() => {
    if (scope.subagentId) return sessions.filter((s) => s.metadata?.agentId === scope.subagentId);
    if (scope.agentId) return sessions.filter((s) => s.metadata?.agentId === scope.agentId);
    if (scope.workspaceId) return sessions.filter((s) => s.ref.workspaceId === scope.workspaceId);
    if (scope.departmentId && departmentWorkspaceIds) {
      return sessions.filter((s) => Boolean(s.ref.workspaceId) && departmentWorkspaceIds.has(s.ref.workspaceId as string));
    }
    if (scope.agencyId) {
      return sessions.filter((s) => s.ref.agencyId === scope.agencyId || s.ref.workspaceId !== undefined);
    }
    return sessions;
  }, [departmentWorkspaceIds, scope, sessions]);

  const selectedSession = selectedSessionId
    ? filteredSessions.find((s) => s.ref.id === selectedSessionId) ?? null
    : null;

  const contextLabel = selectedLineage.map((node) => node.label).join(' / ');

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleSendCommand = useCallback(async () => {
    if (!canSendCommand || !scopeLevel || !scopeId) return;
    setSending(true);
    setCommandResult(null);
    setCommandError(null);
    try {
      const response = await sendRuntimeCommand(scopeLevel, scopeId, commandAction);
      setCommandResult(response.result);
    } catch (err) {
      setCommandError(err instanceof Error ? err.message : 'Command failed');
    } finally {
      setSending(false);
    }
  }, [canSendCommand, scopeLevel, scopeId, commandAction]);

  const handleRefreshSessions = useCallback(async () => {
    setRefreshing(true);
    try {
      await getRuntimeSessions();
      await refresh();
    } catch {
      // errors shown via state
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Sessions" description="Runtime session inspection and operational controls" icon={MessageSquare} />
        <button
          type="button"
          onClick={() => { void handleRefreshSessions(); }}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-medium mt-1"
          style={{
            borderColor: 'var(--border-primary)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            opacity: refreshing ? 0.6 : 1,
          }}
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {!scope.agencyId && (
        <div
          className="rounded-lg border p-4 text-sm"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
        >
          No agency selected. Create or connect an agency to inspect sessions.
        </div>
      )}

      {/* Scope context */}
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
        <div className="text-xs uppercase font-semibold mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
          Active Context
        </div>
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {contextLabel || 'No context selected'}
        </div>
        {scopeLevel && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>
              {scopeLevel}
            </span>
            <code className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{scopeId}</code>
          </div>
        )}
      </div>

      {/* Stats strip — matches RunsPage tone pattern */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'Total', value: filteredSessions.length, tone: 'default' },
          { label: 'Active', value: filteredSessions.filter((s) => s.status === 'active').length, tone: 'success' },
          { label: 'Paused', value: filteredSessions.filter((s) => s.status === 'paused').length, tone: 'warning' },
          { label: 'Closed', value: filteredSessions.filter((s) => s.status === 'closed').length, tone: 'muted' },
        ].map(({ label, value, tone }) => (
          <div
            key={label}
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-primary)',
              background:
                tone === 'success' ? 'var(--tone-success-bg, rgba(16,185,129,0.08))'
                : tone === 'warning' ? 'var(--tone-warning-bg, rgba(245,158,11,0.08))'
                : 'var(--bg-secondary)',
              padding: '10px 14px',
              display: 'grid',
              gap: 3,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
              {label}
            </span>
            <span style={{
              fontSize: 22,
              fontWeight: 800,
              color:
                tone === 'success' ? 'var(--tone-success-text, #10b981)'
                : tone === 'warning' ? 'var(--tone-warning-text, #f59e0b)'
                : 'var(--text-primary)',
            }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Runtime Command Panel */}
      <Card>
        <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Terminal size={14} style={{ color: 'var(--color-primary)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Runtime Command</p>
            </div>

            {!capMatrix ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Runtime capability matrix not available. Connect to a runtime to send commands.
              </p>
            ) : !canSendCommand ? (
              <div className="flex items-start gap-2 rounded-md border p-2.5" style={{ borderColor: 'var(--tone-warning-border)', background: 'var(--tone-warning-bg)' }}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--tone-warning-text)' }} />
                <p className="text-xs" style={{ color: 'var(--tone-warning-text)' }}>
                  {!scopeLevel
                    ? 'Select an entity in the hierarchy to target a runtime command.'
                    : 'No topology actions are available in the current runtime capability matrix.'}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={commandAction}
                    onChange={(e) => setCommandAction(e.target.value as TopologyRuntimeAction)}
                    style={{
                      flex: '1 1 180px',
                      minWidth: 0,
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--input-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--input-text)',
                      padding: '8px 10px',
                      fontSize: 13,
                    }}
                  >
                    {supportedActions.map((a) => (
                      <option key={a.value} value={a.value}>{a.label} — {a.description}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => { void handleSendCommand(); }}
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      background: sending ? 'var(--bg-tertiary)' : 'var(--color-primary)',
                      color: sending ? 'var(--text-muted)' : '#fff',
                      padding: '8px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    {sending ? (
                      <>
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Terminal size={12} /> Send
                      </>
                    )}
                  </button>
                </div>

                {commandResult && (
                  <div
                    className="rounded-md border p-3 text-xs space-y-1"
                    style={{
                      borderColor:
                        commandResult.status === 'applied'
                          ? 'var(--tone-success-border, rgba(16,185,129,0.3))'
                          : commandResult.status === 'rejected'
                            ? 'var(--tone-danger-border, rgba(239,68,68,0.3))'
                            : 'var(--tone-warning-border, rgba(245,158,11,0.3))',
                      background:
                        commandResult.status === 'applied'
                          ? 'var(--tone-success-bg, rgba(16,185,129,0.08))'
                          : commandResult.status === 'rejected'
                            ? 'var(--tone-danger-bg, rgba(239,68,68,0.08))'
                            : 'var(--tone-warning-bg, rgba(245,158,11,0.08))',
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background:
                            commandResult.status === 'applied'
                              ? 'var(--tone-success-text, #10b981)'
                              : commandResult.status === 'rejected'
                                ? 'var(--tone-danger-text, #ef4444)'
                                : 'var(--tone-warning-text, #f59e0b)',
                        }}
                      />
                      <span className="font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
                        {commandResult.status === 'applied'
                          ? 'Applied'
                          : commandResult.status === 'unsupported_by_runtime'
                            ? 'Not supported by runtime'
                            : 'Rejected by runtime'}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>→ {commandResult.action}</span>
                    </div>
                    <p style={{ color: 'var(--text-muted)' }}>{commandResult.message}</p>
                    {commandResult.errorCode && (
                      <code style={{ color: 'var(--tone-danger-text, #ef4444)', fontFamily: 'var(--font-mono)' }}>{commandResult.errorCode}</code>
                    )}
                  </div>
                )}

                {commandError && (
                  <div
                    className="rounded-md border p-3 text-xs"
                    style={{ borderColor: 'var(--tone-danger-border)', background: 'var(--tone-danger-bg)', color: 'var(--tone-danger-text)' }}
                  >
                    {commandError}
                  </div>
                )}
              </>
            )}
        </div>
      </Card>

      {/* Sessions Table + Detail Panel */}
      <div className={`gap-4 ${selectedSession ? 'grid grid-cols-1 lg:grid-cols-3' : ''}`}>
        <Card className={`p-0 overflow-hidden ${selectedSession ? 'lg:col-span-2' : ''}`}>
          {filteredSessions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Session ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Channel</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Agent</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Messages</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((session, idx) => {
                    const id = session.ref.id;
                    const agentId = typeof session.metadata?.agentId === 'string' ? session.metadata.agentId : undefined;
                    const channel = session.ref.channel ?? (typeof session.metadata?.channel === 'string' ? session.metadata.channel : undefined);
                    const messages = Array.isArray(session.metadata?.messages) ? session.metadata.messages : [];
                    const isSelected = id === selectedSessionId;
                    return (
                      <tr
                        key={id ?? idx}
                        className="border-b cursor-pointer transition-colors"
                        style={{
                          borderColor: 'var(--border-secondary)',
                          background: isSelected ? 'var(--color-primary-soft)' : undefined,
                        }}
                        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg-secondary)'; }}
                        onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                        onClick={() => setSelectedSessionId(isSelected ? null : (id ?? null))}
                      >
                        <td className="px-4 py-3">
                          <code
                            className="text-xs px-2 py-0.5 rounded"
                            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
                          >
                            {id ? id.substring(0, 16) : `sess-${idx + 1}`}
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <Circle
                              size={8}
                              style={{
                                fill: session.status === 'active' ? '#22c55e' : session.status === 'paused' ? '#f59e0b' : '#94a3b8',
                                color: session.status === 'active' ? '#22c55e' : session.status === 'paused' ? '#f59e0b' : '#94a3b8',
                              }}
                            />
                            <span className="text-xs capitalize" style={{ color: 'var(--text-primary)' }}>{session.status ?? 'unknown'}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{channel ?? '—'}</td>
                        <td className="px-4 py-3">
                          <code className="text-xs" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                            {agentId ? agentId.substring(0, 12) : '—'}
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <MessageSquare size={12} />
                            <span>{messages.length}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRight size={14} style={{ color: isSelected ? 'var(--color-primary)' : 'var(--text-muted)' }} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-14 text-center">
              <MessageSquare size={36} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>No sessions for current context</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                {sessionsSupported
                  ? 'Adjust hierarchy context or wait for runtime activity'
                  : 'Session inspection is not available in the current runtime'}
              </p>
            </div>
          )}
        </Card>

        {/* Session Detail Panel */}
        {selectedSession && (
          <Card className="p-4 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Session Detail</p>
              <button
                type="button"
                onClick={() => setSelectedSessionId(null)}
                className="text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              {[
                { label: 'ID', value: selectedSession.ref.id ?? '—' },
                { label: 'Status', value: selectedSession.status ?? 'unknown' },
                { label: 'Channel', value: selectedSession.ref.channel ?? (typeof selectedSession.metadata?.channel === 'string' ? selectedSession.metadata.channel : '—') },
                { label: 'Workspace', value: selectedSession.ref.workspaceId ?? '—' },
                { label: 'Agent', value: typeof selectedSession.metadata?.agentId === 'string' ? selectedSession.metadata.agentId : '—' },
                { label: 'Last Event', value: selectedSession.lastEventAt ?? (typeof selectedSession.metadata?.lastEventAt === 'string' ? selectedSession.metadata.lastEventAt : '—') },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start gap-2">
                  <span className="text-xs w-20 flex-shrink-0 font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <code className="text-xs break-all" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{String(value)}</code>
                </div>
              ))}
            </div>

            {selectedSession.metadata && Object.keys(selectedSession.metadata).length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase mb-1.5" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>Raw Metadata</p>
                <pre
                  className="text-xs rounded-md p-2 overflow-auto max-h-40"
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                  }}
                >
                  {JSON.stringify(selectedSession.metadata, null, 2)}
                </pre>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
