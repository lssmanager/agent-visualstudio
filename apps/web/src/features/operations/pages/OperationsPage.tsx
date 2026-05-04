import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, BarChart3, RefreshCw } from 'lucide-react';
import { compareRuns, getRun, getRuns, getUsage, getUsageByAgent } from '../../../lib/api';
import type { RunSpec } from '../../../lib/types';
import { CostChart } from '../components/CostChart';
import { TokenUsageTable } from '../components/TokenUsageTable';
import { RunReplay } from '../components/RunReplay';
import { RunComparison } from '../components/RunComparison';
import { Approvals } from '../components/Approvals';
import {
  ConsoleEmpty,
  ConsolePanel,
  ObservabilityShell,
  consoleToolButtonStyle,
} from '../components/ObservabilityShell';

type ActiveTab = 'overview' | 'agents' | 'replay' | 'compare' | 'approvals';

export default function OperationsPage() {
  const [tab, setTab] = useState<ActiveTab>('overview');
  const [usage, setUsage] = useState<{
    totalCost: number;
    totalTokens: { input: number; output: number };
    totalRuns: number;
    groups: Array<{ key: string; cost: number; tokens: { input: number; output: number }; runs: number }>;
  } | null>(null);
  const [agentUsage, setAgentUsage] = useState<
    Array<{ agentId: string; cost: number; tokens: { input: number; output: number }; steps: number }>
  >([]);
  const [runs, setRuns] = useState<RunSpec[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunSpec | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<{
    runs: Array<{
      id: string;
      flowId: string;
      status: string;
      startedAt: string;
      completedAt?: string;
      totalCost: number;
      totalTokens: { input: number; output: number };
      stepCount: number;
    }>;
    diffs: Array<{ field: string; values: Record<string, unknown> }>;
  } | null>(null);

  const loadUsage = useCallback(async () => {
    try {
      setUsage(await getUsage());
      setAgentUsage(await getUsageByAgent());
      setRuns(await getRuns());
    } catch {
      setUsage(null);
      setAgentUsage([]);
      setRuns([]);
    }
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  async function handleSelectRun(id: string) {
    setSelectedRunId(id);
    try {
      setSelectedRun(await getRun(id));
    } catch {
      setSelectedRun(null);
    }
  }

  function handleToggleCompare(id: string) {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    setComparison(null);
  }

  async function handleCompare() {
    if (compareIds.length < 2) return;
    try {
      setComparison(await compareRuns(compareIds));
    } catch {
      setComparison(null);
    }
  }

  return (
    <ObservabilityShell
      title="Operations"
      description="Cost intelligence, token usage, replay validation, and run comparison in one operations console."
      icon={BarChart3}
      runtimeOk={(usage?.totalRuns ?? 0) > 0}
      kpis={[
        {
          label: 'Total Cost',
          value: usage ? `$${usage.totalCost.toFixed(2)}` : '$0.00',
          helper: 'Current window',
        },
        {
          label: 'Total Runs',
          value: usage?.totalRuns ?? 0,
          helper: 'Aggregated executions',
        },
        {
          label: 'Token Throughput',
          value: usage ? (usage.totalTokens.input + usage.totalTokens.output).toLocaleString() : '0',
          helper: 'Input + output tokens',
        },
        {
          label: 'Agents With Usage',
          value: agentUsage.length,
          helper: 'Active metered agents',
          tone: agentUsage.length > 0 ? 'success' : 'warning',
        },
      ]}
      actions={
        <button type="button" style={consoleToolButtonStyle()} onClick={() => void loadUsage()}>
          <RefreshCw size={14} />
          Refresh Data
        </button>
      }
    >
      <ConsolePanel title="Operations Views" description="Choose analytical, replay, compare, or approvals mode.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {([
            { id: 'overview',   label: 'Cost Overview' },
            { id: 'agents',     label: 'Agent Usage' },
            { id: 'replay',     label: 'Replay' },
            { id: 'compare',    label: 'Compare' },
            { id: 'approvals',  label: 'Approvals' },
          ] as Array<{ id: ActiveTab; label: string }>).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              style={{
                ...consoleToolButtonStyle(tab === item.id),
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </ConsolePanel>

      {tab === 'overview' && (
        <section style={{ display: 'grid', gap: 14 }}>
          <ConsolePanel title="Cost KPIs" description="Top-level usage and spend metrics">
            {!usage ? (
              <ConsoleEmpty title="No usage data" description="Unable to fetch usage metrics right now." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                <MetricCard label="Total Cost" value={`$${usage.totalCost.toFixed(4)}`} />
                <MetricCard label="Total Tokens" value={`${(usage.totalTokens.input + usage.totalTokens.output).toLocaleString()}`} />
                <MetricCard label="Total Runs" value={`${usage.totalRuns}`} />
              </div>
            )}
          </ConsolePanel>

          {usage && (
            <ConsolePanel title="Cost Distribution" description="Usage grouped by key segments">
              <CostChart groups={usage.groups} totalCost={usage.totalCost} />
            </ConsolePanel>
          )}
        </section>
      )}

      {tab === 'agents' && (
        <ConsolePanel title="Agent Usage" description="Token and cost contribution by agent">
          <TokenUsageTable rows={agentUsage} />
        </ConsolePanel>
      )}

      {tab === 'replay' && (
        <section className="studio-console-master-detail" style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 14 }}>
          <ConsolePanel title="Runs" description="Select one run to replay">
            {runs.length === 0 ? (
              <ConsoleEmpty title="No runs available" description="Runs are required to perform replay testing." />
            ) : (
              <div style={{ display: 'grid', gap: 8, maxHeight: 500, overflowY: 'auto' }}>
                {runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => void handleSelectRun(run.id)}
                    style={{
                      ...consoleToolButtonStyle(selectedRunId === run.id),
                      width: '100%',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{run.id.slice(0, 10)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{run.status}</span>
                  </button>
                ))}
              </div>
            )}
          </ConsolePanel>

          <ConsolePanel title="Replay Surface" description="Replay and inspect execution behavior">
            {selectedRun ? (
              <RunReplay
                run={selectedRun}
                onReplayCreated={() => {
                  void loadUsage();
                  setSelectedRun(null);
                  setSelectedRunId(null);
                }}
              />
            ) : (
              <ConsoleEmpty title="No run selected" description="Choose a run from the left list to begin replay." />
            )}
          </ConsolePanel>
        </section>
      )}

      {tab === 'compare' && (
        <section style={{ display: 'grid', gap: 14 }}>
          <ConsolePanel title="Run Selection" description={`Select at least 2 runs (${compareIds.length} selected)`}>
            {runs.length === 0 ? (
              <ConsoleEmpty title="No runs available" description="Run comparison requires existing executions." />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {runs.map((run) => {
                    const selected = compareIds.includes(run.id);
                    return (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => handleToggleCompare(run.id)}
                        style={{
                          ...consoleToolButtonStyle(selected),
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {run.id.slice(0, 8)}
                      </button>
                    );
                  })}
                </div>
                <button type="button" style={consoleToolButtonStyle()} onClick={() => void handleCompare()} disabled={compareIds.length < 2}>
                  <ArrowLeftRight size={14} />
                  Compare Runs
                </button>
              </div>
            )}
          </ConsolePanel>

          {comparison && (
            <ConsolePanel title="Comparison Output" description="Field-level differences across selected runs">
              <RunComparison runs={comparison.runs} diffs={comparison.diffs} />
            </ConsolePanel>
          )}
        </section>
      )}

      {/* F6-10: tab Approvals — sustituye a PendingApprovals.tsx (legacy/deprecated) */}
      {tab === 'approvals' && (
        <ConsolePanel
          title="Pending Approvals"
          description="Human-in-the-loop steps waiting for approval across all active runs."
        >
          <Approvals
            pollingIntervalMs={5_000}
            onResolved={(runId, stepId, decision) => {
              // Refrescar métricas globales cuando se resuelve una aprobación
              if (decision === 'approved' || decision === 'rejected') {
                void loadUsage();
              }
            }}
          />
        </ConsolePanel>
      )}
    </ObservabilityShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-primary)',
        background: 'var(--bg-secondary)',
        padding: 14,
      }}
    >
      <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </p>
      <strong style={{ display: 'block', marginTop: 6, fontSize: 'var(--text-2xl)', color: 'var(--text-primary)' }}>
        {value}
      </strong>
    </div>
  );
}
