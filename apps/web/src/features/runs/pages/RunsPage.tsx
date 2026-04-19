import { useEffect, useState, useCallback } from 'react';
import { Play, RefreshCw, XCircle } from 'lucide-react';

import { getRuns, cancelRun } from '../../../lib/api';
import { PageHeader, EmptyState } from '../../../components';
import { StepBadge } from '../../../components/ui/StepBadge';
import type { RunSpec, RunStep } from '../../../lib/types';
import { RunTimeline } from '../components/RunTimeline';
import { StepDetail } from '../components/StepDetail';
import { ApprovalPanel } from '../components/ApprovalPanel';

export default function RunsPage() {
  const [runs, setRuns] = useState<RunSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<RunStep | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const data = await getRuns();
      setRuns(data);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // Auto-refresh active runs
  useEffect(() => {
    const hasActive = runs.some((r) => r.status === 'running' || r.status === 'queued' || r.status === 'waiting_approval');
    if (!hasActive) return;

    const interval = setInterval(() => void loadRuns(), 2000);
    return () => clearInterval(interval);
  }, [runs, loadRuns]);

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

  async function handleCancel(runId: string) {
    await cancelRun(runId);
    await loadRuns();
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader title="Runs" icon={Play} description="Flow execution history and step traces" />
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading runs...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Runs" icon={Play} description="Flow execution history and step traces" />
        <button
          onClick={() => void loadRuns()}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors"
          style={{ color: 'var(--color-primary)', background: 'var(--color-primary-soft)' }}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {runs.length === 0 ? (
        <EmptyState
          icon={Play}
          title="No runs yet"
          description="Execute a flow to see runs here. Each run tracks every step, approval, and result."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Run list */}
          <div className="md:col-span-1 space-y-2">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => { setSelectedRunId(run.id); setSelectedStep(null); }}
                className="w-full text-left rounded-lg border p-3 transition-colors"
                style={{
                  borderColor: selectedRunId === run.id ? 'var(--color-primary)' : 'var(--border-primary)',
                  background: selectedRunId === run.id ? 'var(--color-primary-soft)' : 'var(--bg-secondary)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {run.flowId}
                  </span>
                  <StepBadge status={run.status} />
                </div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  {run.trigger.type} — {new Date(run.startedAt).toLocaleString()}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {run.steps.length} step{run.steps.length !== 1 ? 's' : ''}
                  {run.error && <span style={{ color: '#dc2626' }}> — {run.error}</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Run detail */}
          <div className="md:col-span-2 space-y-4">
            {selectedRun ? (
              <>
                {/* Run header */}
                <div
                  className="rounded-lg border p-4 flex items-center justify-between"
                  style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
                >
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Run {selectedRun.id.slice(0, 8)}
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Flow: {selectedRun.flowId} — Trigger: {selectedRun.trigger.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StepBadge status={selectedRun.status} size="md" />
                    {(selectedRun.status === 'running' || selectedRun.status === 'queued') && (
                      <button
                        onClick={() => void handleCancel(selectedRun.id)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-white"
                        style={{ background: '#dc2626' }}
                      >
                        <XCircle size={12} />
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {/* Timeline */}
                <div
                  className="rounded-lg border p-4"
                  style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
                >
                  <h4 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                    Timeline
                  </h4>
                  <RunTimeline
                    steps={selectedRun.steps}
                    onStepClick={setSelectedStep}
                    selectedStepId={selectedStep?.id}
                  />
                </div>

                {/* Approval panel (if applicable) */}
                {selectedRun.steps
                  .filter((s) => s.status === 'waiting_approval')
                  .map((s) => (
                    <ApprovalPanel
                      key={s.id}
                      runId={selectedRun.id}
                      step={s}
                      onResolved={() => void loadRuns()}
                    />
                  ))}

                {/* Step detail */}
                {selectedStep && <StepDetail step={selectedStep} />}
              </>
            ) : (
              <div
                className="rounded-lg border p-8 text-center"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
              >
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Select a run to view its timeline and step details
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
