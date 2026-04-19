import type { RunStep } from '../../../lib/types';
import { StepBadge } from '../../../components/ui/StepBadge';

interface StepDetailProps {
  step: RunStep;
}

export function StepDetail({ step }: StepDetailProps) {
  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {step.nodeType.charAt(0).toUpperCase() + step.nodeType.slice(1)} — {step.nodeId}
          </h4>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Step {step.id.slice(0, 8)}
          </p>
        </div>
        <StepBadge status={step.status} size="md" />
      </div>

      {/* Timing */}
      <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        {step.startedAt && (
          <div>
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Started:</span>{' '}
            {new Date(step.startedAt).toLocaleString()}
          </div>
        )}
        {step.completedAt && (
          <div>
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Completed:</span>{' '}
            {new Date(step.completedAt).toLocaleString()}
          </div>
        )}
      </div>

      {/* Token usage */}
      {step.tokenUsage && (
        <div className="flex gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>Input tokens: <strong>{step.tokenUsage.input.toLocaleString()}</strong></span>
          <span>Output tokens: <strong>{step.tokenUsage.output.toLocaleString()}</strong></span>
          {step.costUsd != null && (
            <span>Cost: <strong>${step.costUsd.toFixed(4)}</strong></span>
          )}
        </div>
      )}

      {/* Input */}
      {step.input && Object.keys(step.input).length > 0 && (
        <div>
          <h5 className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Input</h5>
          <pre
            className="text-[11px] p-2 rounded overflow-auto max-h-40"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
          >
            {JSON.stringify(step.input, null, 2)}
          </pre>
        </div>
      )}

      {/* Output */}
      {step.output && Object.keys(step.output).length > 0 && (
        <div>
          <h5 className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Output</h5>
          <pre
            className="text-[11px] p-2 rounded overflow-auto max-h-40"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
          >
            {JSON.stringify(step.output, null, 2)}
          </pre>
        </div>
      )}

      {/* Error */}
      {step.error && (
        <div
          className="rounded p-2 text-xs"
          style={{ background: '#fee2e2', color: '#dc2626' }}
        >
          <strong>Error:</strong> {step.error}
        </div>
      )}
    </div>
  );
}
