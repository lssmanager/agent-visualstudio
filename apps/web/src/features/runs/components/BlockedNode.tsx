import { useState } from 'react';
import { RefreshCw, XCircle, AlertOctagon } from 'lucide-react';

import { retryDelegation, cancelRun } from '../../../lib/api';
import type { RunStep } from '../../../lib/types';

interface BlockedNodeProps {
  runId:      string;
  step:       RunStep;
  onResolved: () => void;
}

export function BlockedNode({ runId, step, onResolved }: BlockedNodeProps) {
  const [note,    setNote]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [phase,   setPhase]   = useState<'idle' | 'retrying' | 'cancelling'>('idle');

  // Guard: only render when the step is actually blocked.
  // 'blocked' was added to StepStatus in packages/core-types/src/run-spec.ts (F6-09).
  if (step.status !== 'blocked') return null;

  async function handleRetry() {
    setLoading(true);
    setError(null);
    setPhase('retrying');
    try {
      await retryDelegation(runId, step.id);
      onResolved();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
    } finally {
      setLoading(false);
      setPhase('idle');
    }
  }

  async function handleCancel() {
    setLoading(true);
    setError(null);
    setPhase('cancelling');
    try {
      await cancelRun(runId);
      onResolved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setPhase('idle');
    }
  }

  const endpointMissing = error != null && (error.includes('404') || error.includes('405') || error.includes('not found'));

  return (
    <div
      className="rounded-lg border p-4 space-y-3"
      style={{ borderColor: '#dc2626', background: '#fef2f2' }}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <AlertOctagon
          size={16}
          color="#dc2626"
          className="flex-shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div>
          <h4 className="text-sm font-semibold" style={{ color: '#7f1d1d' }}>
            Delegation Blocked
          </h4>
          <p className="text-xs mt-0.5" style={{ color: '#991b1b' }}>
            Node <strong>{step.nodeId}</strong> could not be delegated
            {step.nodeType ? (
              <span style={{ color: '#b91c1c' }}> ({step.nodeType})</span>
            ) : null}.
            {' '}Retry the delegation or cancel this run.
          </p>
          {step.error && (
            <p className="text-xs mt-1" style={{ color: '#b91c1c', fontStyle: 'italic' }}>
              Reason: {step.error}
            </p>
          )}
        </div>
      </div>

      {/* Error from last action */}
      {error && (
        <div
          className="rounded px-3 py-2 text-xs"
          style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
          role="alert"
        >
          <strong>Error:</strong> {error}
          {endpointMissing && (
            <span className="block mt-1" style={{ color: '#7f1d1d' }}>
              The retry endpoint is not yet available on the server.
              Use &ldquo;Cancel run&rdquo; to exit safely.
            </span>
          )}
        </div>
      )}

      {/* Optional note for retry context */}
      <div>
        <label
          htmlFor={`blocked-note-${step.id}`}
          className="block text-xs font-medium mb-1"
          style={{ color: '#7f1d1d' }}
        >
          Retry note (optional)
        </label>
        <textarea
          id={`blocked-note-${step.id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Context for the retry attempt..."
          className="w-full rounded border px-3 py-2 text-xs resize-none"
          style={{ borderColor: '#fca5a5', background: 'white', color: '#374151' }}
          rows={2}
          disabled={loading}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleRetry()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50"
          style={{ background: '#b45309' }}
          aria-busy={phase === 'retrying'}
        >
          <RefreshCw
            size={13}
            className={phase === 'retrying' ? 'animate-spin' : ''}
            aria-hidden="true"
          />
          {phase === 'retrying' ? 'Retrying…' : 'Retry delegation'}
        </button>

        <button
          type="button"
          onClick={() => void handleCancel()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50"
          style={{ background: '#dc2626' }}
          aria-busy={phase === 'cancelling'}
        >
          <XCircle size={13} aria-hidden="true" />
          {phase === 'cancelling' ? 'Cancelling…' : 'Cancel run'}
        </button>
      </div>
    </div>
  );
}
