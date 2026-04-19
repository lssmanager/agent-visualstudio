import { useState, useEffect, useCallback } from 'react';
import { BarChart3, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { PageHeader } from '../../../components';
import { CostChart } from '../components/CostChart';
import { TokenUsageTable } from '../components/TokenUsageTable';
import { RunReplay } from '../components/RunReplay';
import { RunComparison } from '../components/RunComparison';
import type { RunSpec } from '../../../lib/types';
import { getUsage, getUsageByAgent, getRuns, getRun, compareRuns } from '../../../lib/api';

type ActiveTab = 'overview' | 'agents' | 'replay' | 'compare';

export default function OperationsPage() {
  const [tab, setTab] = useState<ActiveTab>('overview');

  // Overview state
  const [usage, setUsage] = useState<{ totalCost: number; totalTokens: { input: number; output: number }; totalRuns: number; groups: Array<{ key: string; cost: number; tokens: { input: number; output: number }; runs: number }> } | null>(null);

  // Agent usage state
  const [agentUsage, setAgentUsage] = useState<Array<{ agentId: string; cost: number; tokens: { input: number; output: number }; steps: number }>>([]);

  // Replay state
  const [runs, setRuns] = useState<RunSpec[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunSpec | null>(null);

  // Compare state
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<{ runs: Array<{ id: string; flowId: string; status: string; startedAt: string; completedAt?: string; totalCost: number; totalTokens: { input: number; output: number }; stepCount: number }>; diffs: Array<{ field: string; values: Record<string, unknown> }> } | null>(null);

  const loadUsage = useCallback(async () => {
    try {
      const data = await getUsage();
      setUsage(data);
    } catch (e) {
      console.error('Failed to load usage', e);
    }
  }, []);

  const loadAgentUsage = useCallback(async () => {
    try {
      const data = await getUsageByAgent();
      setAgentUsage(data);
    } catch (e) {
      console.error('Failed to load agent usage', e);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const data = await getRuns();
      setRuns(data);
    } catch (e) {
      console.error('Failed to load runs', e);
    }
  }, []);

  useEffect(() => {
    loadUsage();
    loadAgentUsage();
    loadRuns();
  }, [loadUsage, loadAgentUsage, loadRuns]);

  const handleSelectRun = async (id: string) => {
    setSelectedRunId(id);
    try {
      const run = await getRun(id);
      setSelectedRun(run);
    } catch {
      setSelectedRun(null);
    }
  };

  const handleToggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setComparison(null);
  };

  const handleCompare = async () => {
    if (compareIds.length < 2) return;
    try {
      const result = await compareRuns(compareIds);
      setComparison(result);
    } catch (e) {
      console.error('Compare failed', e);
    }
  };

  const TABS: Array<{ key: ActiveTab; label: string }> = [
    { key: 'overview', label: 'Cost Overview' },
    { key: 'agents', label: 'Agent Usage' },
    { key: 'replay', label: 'Replay' },
    { key: 'compare', label: 'Compare' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader title="Operations" icon={BarChart3} description="Usage, costs, replay, and run comparison" />

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border-primary)' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-sm font-medium transition-colors relative"
            style={{ color: tab === t.key ? 'var(--color-primary)' : 'var(--text-muted)' }}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: 'var(--color-primary)' }} />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="rounded-xl border p-6" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>

        {/* ── Overview Tab ── */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* KPI row */}
            {usage && (
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)' }}>
                  <p className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Total Cost</p>
                  <p className="text-lg font-semibold font-heading" style={{ color: 'var(--text-primary)' }}>
                    ${usage.totalCost.toFixed(4)}
                  </p>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)' }}>
                  <p className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Total Tokens</p>
                  <p className="text-lg font-semibold font-heading" style={{ color: 'var(--text-primary)' }}>
                    {(usage.totalTokens.input + usage.totalTokens.output).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)' }}>
                  <p className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Total Runs</p>
                  <p className="text-lg font-semibold font-heading" style={{ color: 'var(--text-primary)' }}>
                    {usage.totalRuns}
                  </p>
                </div>
              </div>
            )}

            {/* Cost chart */}
            {usage && <CostChart groups={usage.groups} totalCost={usage.totalCost} />}

            {!usage && (
              <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>Loading usage data...</p>
            )}
          </div>
        )}

        {/* ── Agent Usage Tab ── */}
        {tab === 'agents' && (
          <TokenUsageTable rows={agentUsage} />
        )}

        {/* ── Replay Tab ── */}
        {tab === 'replay' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Run list */}
            <div className="md:col-span-1 space-y-1 max-h-[500px] overflow-y-auto">
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Select a run</p>
              {runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => handleSelectRun(run.id)}
                  className="w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors"
                  style={{
                    borderColor: selectedRunId === run.id ? 'var(--color-primary)' : 'transparent',
                    background: selectedRunId === run.id ? 'var(--color-primary-soft)' : 'transparent',
                  }}
                >
                  <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{run.id.slice(0, 12)}</span>
                  <span className="ml-2" style={{ color: run.status === 'completed' ? '#059669' : run.status === 'failed' ? '#dc2626' : 'var(--text-muted)' }}>
                    {run.status}
                  </span>
                </button>
              ))}
              {runs.length === 0 && (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>No runs available.</p>
              )}
            </div>

            {/* Replay panel */}
            <div className="md:col-span-2">
              {selectedRun ? (
                <RunReplay run={selectedRun} onReplayCreated={(newRun) => { loadRuns(); setSelectedRun(null); setSelectedRunId(null); }} />
              ) : (
                <div className="rounded-lg border p-8 text-center" style={{ borderColor: 'var(--card-border)' }}>
                  <RefreshCw size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Select a run to replay.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Compare Tab ── */}
        {tab === 'compare' && (
          <div className="space-y-4">
            {/* Run selector */}
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Select runs to compare ({compareIds.length} selected)
              </p>
              <div className="flex flex-wrap gap-1 max-h-[200px] overflow-y-auto">
                {runs.map((run) => {
                  const isSelected = compareIds.includes(run.id);
                  return (
                    <button
                      key={run.id}
                      onClick={() => handleToggleCompare(run.id)}
                      className="px-2.5 py-1.5 rounded-md border text-xs font-mono transition-colors"
                      style={{
                        borderColor: isSelected ? 'var(--color-primary)' : 'var(--border-primary)',
                        background: isSelected ? 'var(--color-primary-soft)' : 'transparent',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {run.id.slice(0, 8)}
                      <span className="ml-1.5 font-sans" style={{ color: run.status === 'completed' ? '#059669' : '#dc2626' }}>
                        {run.status}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={handleCompare}
                disabled={compareIds.length < 2}
                className="mt-2 px-3 py-1.5 text-xs rounded-md font-medium text-white flex items-center gap-1.5"
                style={{ background: 'var(--color-primary)', opacity: compareIds.length < 2 ? 0.5 : 1 }}
              >
                <ArrowLeftRight size={12} />
                Compare
              </button>
            </div>

            {/* Comparison result */}
            {comparison && (
              <RunComparison runs={comparison.runs} diffs={comparison.diffs} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
