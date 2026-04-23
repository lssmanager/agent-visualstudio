import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Clock, DollarSign, PlayCircle, Shield, XCircle } from 'lucide-react';

import {
  getDashboardOperationsAlerts,
  getDashboardOperationsActionsHeatmap,
  getDashboardOperationsBudgets,
  getDashboardOperationsCostProfile,
  getDashboardOperationsPendingActions,
  getDashboardOperationsPolicies,
  getDashboardOperationsRuntimeState,
} from '../../../../lib/api';
import type {
  AnalyticsState,
  CanonicalNodeLevel,
  DashboardOperationsDto,
  DashboardOperationsRuntimeStateDto,
  OperationsActionsHeatmapDto,
  DashboardScopeCapabilities,
  TopologyRuntimeAction,
} from '../../../../lib/types';
import { AnalyticsStateBoundary } from '../../../analytics/components/AnalyticsStateBoundary';
import { PlannedVisualQueue } from '../../../analytics/components/PlannedVisualQueue';
import { TimeWindowSelector } from '../../../analytics/components/TimeWindowSelector';
import { useAnalyticsMetric } from '../../../analytics/hooks/useAnalyticsMetric';
import type { AnalyticsWindow } from '../../../analytics/types';
import { AreaChart, BarChart, BulletGauge } from '../../../../components/ui/Charts';

interface BudgetEntry {
  id: string;
  name: string;
  scope: string;
  limitUsd: number;
  periodDays: number;
  currentUsageUsd: number;
  enabled: boolean;
}

interface PolicyEntry {
  id: string;
  name: string;
  [key: string]: unknown;
}

const ACTION_META: Record<TopologyRuntimeAction, { label: string; description: string }> = {
  pause: { label: 'Pause', description: 'Suspend active processing' },
  reactivate: { label: 'Reactivate', description: 'Resume paused operations' },
  redirect: { label: 'Redirect', description: 'Move to a different target' },
  continue: { label: 'Continue', description: 'Signal to proceed' },
  connect: { label: 'Connect', description: 'Initiate runtime connection' },
  disconnect: { label: 'Disconnect', description: 'Terminate runtime connection' },
};

const ALL_ACTIONS: TopologyRuntimeAction[] = ['connect', 'disconnect', 'pause', 'reactivate', 'redirect', 'continue'];

export function OperationsSurface({
  data,
  busyAction,
  capabilities,
  onRuntimeAction,
  level,
  id,
}: {
  data: DashboardOperationsDto;
  busyAction: TopologyRuntimeAction | null;
  capabilities?: DashboardScopeCapabilities;
  onRuntimeAction: (action: TopologyRuntimeAction) => void;
  level?: string;
  id?: string;
}) {
  const nodeLevel = (level ?? data.scope.level) as CanonicalNodeLevel;
  const nodeId = id ?? data.scope.id;

  const [window, setWindow] = useState<AnalyticsWindow>('24H');
  const [runtimeState, setRuntimeState] = useState<DashboardOperationsRuntimeStateDto | null>(null);
  const [runtimeStateView, setRuntimeStateView] = useState<AnalyticsState>('loading');
  const [budgets, setBudgets] = useState<BudgetEntry[]>([]);
  const [policies, setPolicies] = useState<PolicyEntry[]>([]);
  const [actionsHeatmap, setActionsHeatmap] = useState<OperationsActionsHeatmapDto | null>(null);
  const [pendingActions, setPendingActions] = useState<Array<{ id: string; type: string; message: string; severity: 'info' | 'warning' | 'critical' }>>([]);

  const alertsMetric = useAnalyticsMetric({
    level: nodeLevel,
    id: nodeId,
    window,
    fetcher: (lvl, scopeId, selectedWindow) => getDashboardOperationsAlerts(lvl, scopeId, selectedWindow),
    getState: (payload) => payload.state,
  });

  const costMetric = useAnalyticsMetric({
    level: nodeLevel,
    id: nodeId,
    window,
    fetcher: (lvl, scopeId, selectedWindow) => getDashboardOperationsCostProfile(lvl, scopeId, selectedWindow),
    getState: (payload) => payload.state,
  });

  const supportedActions = capabilities?.topologyActions ?? [];

  useEffect(() => {
    let cancelled = false;
    setRuntimeStateView('loading');

    void getDashboardOperationsRuntimeState(nodeLevel, nodeId)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setRuntimeState(payload);
        setRuntimeStateView(payload.runtimeState === 'online' ? 'ready' : payload.runtimeState === 'offline' ? 'runtime_offline' : 'runtime_degraded');
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setRuntimeState(null);
        setRuntimeStateView('runtime_degraded');
      });

    void getDashboardOperationsBudgets(nodeLevel, nodeId)
      .then((payload) => {
        if (!cancelled) {
          setBudgets(payload.budgets);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBudgets([]);
        }
      });

    void getDashboardOperationsPolicies(nodeLevel, nodeId)
      .then((payload) => {
        if (!cancelled) {
          setPolicies(payload.policies);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPolicies([]);
        }
      });

    void getDashboardOperationsActionsHeatmap(nodeLevel, nodeId, window)
      .then((payload) => {
        if (!cancelled) {
          setActionsHeatmap(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActionsHeatmap(null);
        }
      });

    void getDashboardOperationsPendingActions(nodeLevel, nodeId)
      .then((payload) => {
        if (!cancelled) {
          setPendingActions(payload.pendingActions ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPendingActions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [nodeLevel, nodeId, window]);

  const runsByStatus = useMemo(() => {
    const counters = new Map<string, number>();
    for (const run of data.recentRuns) {
      counters.set(run.status, (counters.get(run.status) ?? 0) + 1);
    }
    return [...counters.entries()].map(([label, value]) => ({ label, value }));
  }, [data.recentRuns]);

  const budgetGauge = useMemo(() => {
    const limit = budgets.reduce((acc, entry) => acc + entry.limitUsd, 0);
    const used = budgets.reduce((acc, entry) => acc + entry.currentUsageUsd, 0);
    const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
    const status = pct >= 90 ? 'critical' : pct >= 70 ? 'warning' : 'ok';
    return { limit, used, pct, status };
  }, [budgets]);

  const governanceRows = useMemo(() => {
    const softCap = budgetGauge.limit > 0 ? Math.round(budgetGauge.limit * 0.75 * 100) / 100 : 0;
    const hardCap = Math.round(budgetGauge.limit * 100) / 100;
    const requireApproval = data.approvalQueue.length > 0 || policies.some((item) => String(item.name).toLowerCase().includes('approval'));
    const replayBudget = Math.max(0, Math.round((budgetGauge.limit - budgetGauge.used) * 100) / 100);
    const escalationThreshold = budgetGauge.status === 'critical' ? 'critical' : budgetGauge.status === 'warning' ? 'warning' : 'normal';
    const perModelCaps = costMetric.data?.rows.slice(0, 3).map((row) => `${row.model}: ${row.sharePct}%`).join(' | ') ?? 'Not configured';

    return [
      { key: 'soft_cap', label: 'Soft cap', value: `$${softCap.toFixed(2)}`, source: 'legacy_store_v1', editable: false, reason: 'read-only governance store' },
      { key: 'hard_cap', label: 'Hard cap', value: `$${hardCap.toFixed(2)}`, source: 'legacy_store_v1', editable: false, reason: 'read-only governance store' },
      { key: 'require_approval', label: 'Require approval', value: requireApproval ? 'Enabled' : 'Disabled', source: 'derived', editable: false, reason: 'runtime computed in dashboard projection' },
      { key: 'replay_budget', label: 'Replay budget', value: `$${replayBudget.toFixed(2)}`, source: 'derived', editable: false, reason: 'depends on current spend' },
      { key: 'escalation_threshold', label: 'Escalation threshold', value: escalationThreshold, source: 'derived', editable: false, reason: 'based on current budget status' },
      { key: 'per_model_caps', label: 'Per-model caps', value: perModelCaps, source: 'derived', editable: false, reason: 'model mix projection' },
    ];
  }, [budgetGauge, costMetric.data, data.approvalQueue.length, policies]);

  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Operations</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Runtime + governance state for {data.scope.level}:{data.scope.id}
          </p>
        </div>
        <TimeWindowSelector value={window} onChange={setWindow} />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ALL_ACTIONS.map((action) => {
          const meta = ACTION_META[action];
          const isSupported = capabilities === undefined || supportedActions.includes(action);
          const isBusy = busyAction === action;
          return (
            <button
              key={action}
              type="button"
              title={isSupported ? meta.description : `${meta.label}: not supported at this scope`}
              onClick={() => isSupported && !busyAction && onRuntimeAction(action)}
              disabled={!isSupported || busyAction !== null}
              style={{
                ...actionBtnBase,
                background: isBusy ? 'var(--color-primary-soft)' : isSupported ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                color: isBusy ? 'var(--color-primary)' : isSupported ? 'var(--text-primary)' : 'var(--text-muted)',
                borderColor: isBusy ? 'var(--color-primary)' : 'var(--border-primary)',
                cursor: isSupported && !busyAction ? 'pointer' : 'not-allowed',
                opacity: !isSupported ? 0.5 : 1,
              }}
            >
              {isBusy ? 'Running...' : meta.label}
            </button>
          );
        })}
      </div>

      <AnalyticsStateBoundary state={runtimeStateView} title="Runtime state machine">
        <div style={runtimeRailStyle}>
          {['offline', 'degraded', 'online'].map((stateKey) => {
            const active = runtimeState?.runtimeState === stateKey;
            const tone = stateKey === 'online' ? 'var(--tone-success-text, #10b981)' : stateKey === 'degraded' ? 'var(--tone-warning-text, #f59e0b)' : 'var(--tone-danger-text, #ef4444)';
            return (
              <div key={stateKey} style={{ ...runtimeNodeStyle, borderColor: active ? tone : 'var(--border-primary)', background: active ? 'var(--bg-secondary)' : 'transparent' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{stateKey}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: active ? tone : 'var(--text-muted)' }}>{active ? 'Current' : 'Inactive'}</div>
              </div>
            );
          })}
        </div>
      </AnalyticsStateBoundary>

      <div style={metaGrid}>
        <Metric label="Recent runs" value={String(data.recentRuns.length)} tone={data.recentRuns.some((r) => r.status === 'failed') ? 'danger' : 'default'} />
        <Metric label="Approval queue" value={String(data.approvalQueue.length)} tone={data.approvalQueue.length > 0 ? 'warning' : 'default'} />
        <Metric label="Runtime" value={(runtimeState?.runtimeState ?? 'unknown').toUpperCase()} tone={runtimeState?.runtimeState === 'offline' ? 'danger' : runtimeState?.runtimeState === 'degraded' ? 'warning' : 'default'} />
      </div>

      <div style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>Recent Runs Timeline</div>
        <AnalyticsStateBoundary state={data.recentRuns.length > 0 ? 'ready' : 'empty'} title="Recent runs">
          <BarChart data={runsByStatus.length > 0 ? runsByStatus : [{ label: 'none', value: 0 }]} height={120} />
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {data.recentRuns.slice(0, 6).map((run) => (
              <RecentRunRow key={run.id} run={run} />
            ))}
          </div>
        </AnalyticsStateBoundary>
      </div>

      <div style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>Alert Severity Timeline</div>
        <AnalyticsStateBoundary state={alertsMetric.state} title="Alerts timeline">
          {alertsMetric.data ? (
            <AreaChart
              height={120}
              labels={alertsMetric.data.series.map((point) => point.ts.slice(11, 16))}
              series={[
                { key: 'info', color: 'var(--color-primary)', values: alertsMetric.data.series.map((point) => point.info) },
                { key: 'warning', color: 'var(--tone-warning-text, #f59e0b)', values: alertsMetric.data.series.map((point) => point.warning) },
                { key: 'critical', color: 'var(--tone-danger-text, #ef4444)', values: alertsMetric.data.series.map((point) => point.critical) },
              ]}
            />
          ) : null}
        </AnalyticsStateBoundary>
      </div>

      <div style={sectionCardStyle}>
        <div style={{ ...sectionHeaderStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
          <DollarSign size={12} /> Cost Budget Gauge
        </div>
        <AnalyticsStateBoundary state={budgets.length > 0 ? 'ready' : 'empty'} title="Budget usage">
          <BulletGauge value={budgetGauge.pct} label={`$${budgetGauge.used.toFixed(2)} of $${budgetGauge.limit.toFixed(2)}`} status={budgetGauge.status} width={280} />
        </AnalyticsStateBoundary>
      </div>

      <div style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>Cost Profile by Model / Role</div>
        <AnalyticsStateBoundary state={costMetric.state} title="Cost profile">
          {costMetric.data ? (
            <BarChart
              data={costMetric.data.rows.map((row) => ({
                label: row.model,
                value: row.spendUsd,
                color:
                  row.role === 'primary'
                    ? 'var(--color-primary)'
                    : row.role === 'fallback'
                      ? 'var(--tone-warning-text, #f59e0b)'
                      : 'var(--text-muted)',
              }))}
              height={120}
            />
          ) : null}
        </AnalyticsStateBoundary>
      </div>

      <div style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>Operational Actions Heatmap (P1)</div>
        <AnalyticsStateBoundary state={actionsHeatmap?.state ?? 'planned_not_operational'} title="Actions heatmap">
          {actionsHeatmap ? (
            <div style={{ display: 'grid', gap: 6 }}>
              {actionsHeatmap.rows.slice(0, 8).map((row) => (
                <div key={row.scopeLabel} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(6, minmax(0,1fr))', gap: 6, fontSize: 10 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{row.scopeLabel}</span>
                  {[row.connect, row.disconnect, row.pause, row.reactivate, row.redirect, row.continue].map((value, idx) => (
                    <span key={`${row.scopeLabel}-${idx}`} style={{ color: value > 0 ? 'var(--color-primary)' : 'var(--text-muted)' }}>{value}</span>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </AnalyticsStateBoundary>
      </div>

      <div style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>Pending Actions (P1)</div>
        <AnalyticsStateBoundary state={pendingActions.length > 0 ? 'ready' : 'empty'} title="Pending actions">
          {pendingActions.length > 0 ? (
            <BarChart
              data={Object.entries(pendingActions.reduce<Record<string, number>>((acc, item) => {
                acc[item.type] = (acc[item.type] ?? 0) + 1;
                return acc;
              }, {})).map(([label, value]) => ({ label, value }))}
              height={110}
            />
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No pending actions.</div>
          )}
        </AnalyticsStateBoundary>
      </div>

      <div style={sectionCardStyle}>
        <div style={{ ...sectionHeaderStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Shield size={12} /> Governance Widgets
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {governanceRows.map((row) => (
            <div key={row.key} style={governanceRowStyle}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{row.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>source: {row.source}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{row.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{row.editable ? 'editable' : `read-only: ${row.reason}`}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {alertsMetric.error && (
        <div style={{ ...noticeStyle, background: 'rgba(239,68,68,0.12)' }}>
          <AlertTriangle size={12} /> {alertsMetric.error}
        </div>
      )}
      {costMetric.error && (
        <div style={{ ...noticeStyle, background: 'rgba(239,68,68,0.12)' }}>
          <AlertTriangle size={12} /> {costMetric.error}
        </div>
      )}

      <PlannedVisualQueue
        title="P2 Refinements"
        items={[
          { id: 'op-p2-1', label: 'Approval Queue Forecast', note: 'Needs queue age distribution + expected service rate contracts.' },
          { id: 'op-p2-2', label: 'Policy Conflict Explorer', note: 'Needs policy rule graph and override conflict metadata.' },
          { id: 'op-p2-3', label: 'Runtime Recovery Simulation', note: 'Needs state transition simulation endpoint.' },
        ]}
      />
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'default' | 'warning' | 'danger' }) {
  const bg =
    tone === 'warning'
      ? 'var(--tone-warning-bg, rgba(245,158,11,0.08))'
      : tone === 'danger'
        ? 'var(--tone-danger-bg, rgba(239,68,68,0.08))'
        : 'var(--bg-secondary)';
  const color =
    tone === 'warning'
      ? 'var(--tone-warning-text, #f59e0b)'
      : tone === 'danger'
        ? 'var(--tone-danger-text, #ef4444)'
        : 'var(--text-primary)';

  return (
    <div style={{ ...metricStyle, background: bg }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

const RUN_STATUS_COLOR: Record<string, string> = {
  completed: 'var(--tone-success-text, #10b981)',
  failed: 'var(--tone-danger-text, #ef4444)',
  running: 'var(--color-primary)',
  queued: 'var(--text-muted)',
};

function RecentRunRow({ run }: { run: { id: string; flowId: string; status: string; startedAt: string; completedAt?: string; costUsd: number } }) {
  const statusColor = RUN_STATUS_COLOR[run.status] ?? 'var(--text-muted)';
  const StatusIcon = run.status === 'completed' ? CheckCircle : run.status === 'failed' ? XCircle : run.status === 'running' ? PlayCircle : AlertCircle;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-primary)' }}>
      <StatusIcon size={13} style={{ color: statusColor, flexShrink: 0 }} />
      <code style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{run.id.slice(0, 8)}</code>
      <span style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{run.flowId}</span>
      <span style={{ fontSize: 11, color: statusColor, flexShrink: 0, fontWeight: 700, textTransform: 'capitalize' }}>{run.status}</span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>${run.costUsd.toFixed(4)}</span>
    </div>
  );
}

const panelStyle: CSSProperties = {
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  padding: 16,
  display: 'grid',
  gap: 14,
};

const actionBtnBase: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
};

const metaGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
  gap: 10,
};

const metricStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  padding: 10,
};

const sectionCardStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  padding: 10,
  display: 'grid',
  gap: 8,
};

const sectionHeaderStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
};

const runtimeRailStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
  gap: 8,
};

const runtimeNodeStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  padding: 10,
  display: 'grid',
  gap: 4,
};

const governanceRowStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  padding: '8px 10px',
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
};

const noticeStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  padding: '8px 10px',
  color: 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};
