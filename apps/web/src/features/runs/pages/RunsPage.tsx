import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Play, RefreshCw, XCircle } from 'lucide-react';
import { cancelRun, getRuns } from '../../../lib/api';
import type { RunSpec, RunStep } from '../../../lib/types';
import { StepBadge } from '../../../components/ui/StepBadge';
import { RunTimeline } from '../components/RunTimeline';
import { StepDetail } from '../components/StepDetail';
import { ApprovalPanel } from '../components/ApprovalPanel';
import { BlockedNode } from '../components/BlockedNode';
import {
  ConsoleEmpty,
  ConsolePanel,
  ObservabilityShell,
  consoleToolButtonStyle,
} from '../../operations/components/ObservabilityShell';

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

  useEffect(() => {
    const hasActive = runs.some(
      (run) =>
        run.status === 'running' ||
        run.status === 'queued' ||
        run.status === 'waiting_approval' ||
        // Poll while any step is blocked so the UI reflects retries
        run.steps.some((s) => s.status === 'blocked'),
    );
    if (!hasActive) return;
    const timer = setInterval(() => void loadRuns(), 2500);
    return () => clearInterval(timer);
  }, [runs, loadRuns]);

  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null;
  const runtimeOk = runs.some((run) => run.status === 'running' || run.status === 'completed');
  const running = runs.filter((run) => run.status === 'running').length;
  const waitingApproval = runs.filter((run) => run.status === 'waiting_approval').length;
  const failed = runs.filter((run) => run.status === 'failed').length;
  const blocked = runs.reduce(
    (acc, run) => acc + run.steps.filter((s) => s.status === 'blocked').length,
    0,
  );

  async function handleCancel(runId: string) {
    await cancelRun(runId);
    await loadRuns();
  }

  return (
    <ObservabilityShell
      title="Runs"
      description="Replayable execution timeline with approval checkpoints and step-by-step trace inspection."
      icon={Play}
      runtimeOk={runtimeOk}
      kpis={[
        { label: 'Total Runs', value: runs.length, helper: 'Loaded from runtime' },
        { label: 'Running', value: running, helper: 'Active executions', tone: running > 0 ? 'success' : 'default' },
        { label: 'Waiting Approval', value: waitingApproval, helper: 'Human-in-the-loop gates', tone: waitingApproval > 0 ? 'warning' : 'default' },
        { label: 'Blocked', value: blocked, helper: 'Delegation failed — action required', tone: blocked > 0 ? 'warning' : 'default' },
        { label: 'Failed', value: failed, helper: 'Needs investigation', tone: failed > 0 ? 'warning' : 'default' },
      ]}
      actions={
        <button type="button" style={consoleToolButtonStyle()} onClick={() => void loadRuns()}>
          <RefreshCw size={14} />
          Refresh
        </button>
      }
    >
      {loading ? (
        <ConsolePanel title="Run Console" description="Loading runs from runtime">
          <ConsoleEmpty title="Loading runs" description="Fetching run history and timeline traces." />
        </ConsolePanel>
      ) : runs.length === 0 ? (
        <ConsolePanel title="Run Console" description="No executions available">
          <ConsoleEmpty
            title="No runs yet"
            description="Execute a flow to see run timelines, approvals, and step traces."
          />
        </ConsolePanel>
      ) : (
        <section className="studio-console-master-detail" style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 14 }}>
          <ConsolePanel title="Run Queue" description={`${runs.length} run(s) loaded`}>
            <div style={{ display: 'grid', gap: 8 }}>
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => {
                    setSelectedRunId(run.id);
                    setSelectedStep(null);
                  }}
                  style={{
                    textAlign: 'left',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid',
                    borderColor: selectedRunId === run.id ? 'var(--color-primary)' : 'var(--border-primary)',
                    background: selectedRunId === run.id ? 'var(--color-primary-soft)' : 'var(--bg-secondary)',
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{run.flowId}</strong>
                    <StepBadge status={run.status} />
                  </div>
                  <p style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                    {run.trigger.type} • {new Date(run.startedAt).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
          </ConsolePanel>

          <ConsolePanel title="Run Trace" description={selectedRun ? `Run ${selectedRun.id.slice(0, 8)}` : 'Select a run'}>
            {!selectedRun ? (
              <ConsoleEmpty title="No run selected" description="Choose a run from the queue to inspect its execution timeline." />
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                <div
                  style={{
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-primary)',
                    background: 'var(--bg-secondary)',
                    padding: '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                      Run {selectedRun.id.slice(0, 8)}
                    </strong>
                    <p style={{ marginTop: 3, fontSize: 12, color: 'var(--text-muted)' }}>
                      Trigger: {selectedRun.trigger.type}
                    </p>
                  </div>
                  {(selectedRun.status === 'running' || selectedRun.status === 'queued') && (
                    <button type="button" style={dangerButton()} onClick={() => void handleCancel(selectedRun.id)}>
                      <XCircle size={13} />
                      Cancel
                    </button>
                  )}
                </div>

                <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', padding: 12 }}>
                  <RunTimeline
                    steps={selectedRun.steps}
                    onStepClick={setSelectedStep}
                    selectedStepId={selectedStep?.id}
                  />
                </div>

                {/* Approval panels — one per step waiting approval */}
                {selectedRun.steps
                  .filter((step) => step.status === 'waiting_approval')
                  .map((step) => (
                    <ApprovalPanel key={step.id} runId={selectedRun.id} step={step} onResolved={() => void loadRuns()} />
                  ))}

                {/* Blocked panels — one per step with blocked delegation (F6-09) */}
                {selectedRun.steps
                  .filter((step) => step.status === 'blocked')
                  .map((step) => (
                    <BlockedNode key={step.id} runId={selectedRun.id} step={step} onResolved={() => void loadRuns()} />
                  ))}

                {selectedStep && <StepDetail step={selectedStep} />}
              </div>
            )}
          </ConsolePanel>
        </section>
      )}
    </ObservabilityShell>
  );
}

function dangerButton(): CSSProperties {
  return {
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--tone-danger-border)',
    background: 'var(--tone-danger-bg)',
    color: 'var(--tone-danger-text)',
    padding: '7px 10px',
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
  };
}
