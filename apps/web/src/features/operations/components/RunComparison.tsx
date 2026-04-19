import { ArrowLeftRight, Check, X } from 'lucide-react';

interface RunSummary {
  id: string;
  flowId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  totalCost: number;
  totalTokens: { input: number; output: number };
  stepCount: number;
}

interface ComparisonDiff {
  field: string;
  values: Record<string, unknown>;
}

interface RunComparisonProps {
  runs: RunSummary[];
  diffs: ComparisonDiff[];
}

const statusColors: Record<string, string> = {
  completed: '#059669',
  failed: '#dc2626',
  cancelled: '#6b7280',
  running: '#2563eb',
  queued: '#9ca3af',
  waiting_approval: '#d97706',
};

export function RunComparison({ runs, diffs }: RunComparisonProps) {
  if (runs.length < 2) {
    return (
      <div className="text-center py-6">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Select at least 2 runs to compare.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Side-by-side summary */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${runs.length}, 1fr)` }}>
        {runs.map((run) => (
          <div
            key={run.id}
            className="rounded-lg border p-3 space-y-2"
            style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
          >
            <p className="text-xs font-mono font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {run.id.slice(0, 12)}
            </p>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Status</span>
                <span className="font-medium" style={{ color: statusColors[run.status] ?? 'var(--text-primary)' }}>
                  {run.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Steps</span>
                <span style={{ color: 'var(--text-primary)' }}>{run.stepCount}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Cost</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                  ${run.totalCost.toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Tokens</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                  {(run.totalTokens.input + run.totalTokens.output).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Started</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {new Date(run.startedAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Differences */}
      {diffs.length > 0 && (
        <div className="rounded-lg border p-3 space-y-2" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={14} style={{ color: '#d97706' }} />
            <h4 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              Differences ({diffs.length})
            </h4>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
            {diffs.map((diff) => (
              <div key={diff.field} className="py-2 flex items-center gap-3 text-xs">
                <span className="font-medium min-w-[80px]" style={{ color: 'var(--text-muted)' }}>
                  {diff.field}
                </span>
                <div className="flex gap-2">
                  {Object.entries(diff.values).map(([runId, value]) => (
                    <span
                      key={runId}
                      className="px-2 py-0.5 rounded font-mono text-[10px]"
                      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                    >
                      {String(value)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {diffs.length === 0 && (
        <div className="rounded-lg border p-4 text-center" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
          <Check size={20} className="mx-auto mb-1" style={{ color: '#059669' }} />
          <p className="text-xs" style={{ color: 'var(--text-primary)' }}>Runs are identical in key metrics.</p>
        </div>
      )}
    </div>
  );
}
