import { useState } from 'react';
import { Play, X } from 'lucide-react';

import { startRun } from '../../../lib/api';
import type { RunSpec, FlowSpec } from '../../../lib/types';
import { StepBadge } from '../../../components/ui/StepBadge';

interface AgentTestDrawerProps {
  open: boolean;
  onClose: () => void;
  agentId: string;
  agentName: string;
  flows: FlowSpec[];
}

export function AgentTestDrawer({ open, onClose, agentId, agentName, flows }: AgentTestDrawerProps) {
  const [selectedFlowId, setSelectedFlowId] = useState<string>(flows[0]?.id ?? '');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunSpec | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleRun() {
    if (!selectedFlowId) return;
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const run = await startRun(selectedFlowId, { type: 'test', payload: { agentId } });
      setResult(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col shadow-xl"
        style={{ width: 420, background: 'var(--bg-primary)', borderLeft: '1px solid var(--border-primary)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Test Agent
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {agentName}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={18} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Flow picker */}
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Flow to execute
            </label>
            {flows.length > 0 ? (
              <select
                value={selectedFlowId}
                onChange={(e) => setSelectedFlowId(e.target.value)}
                className="w-full rounded border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
              >
                {flows.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                No flows available. Create a flow first.
              </p>
            )}
          </div>

          {/* Run button */}
          <button
            type="button"
            onClick={handleRun}
            disabled={running || !selectedFlowId}
            className="flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            <Play size={14} />
            {running ? 'Starting...' : 'Start Test Run'}
          </button>

          {/* Error */}
          {error && (
            <div className="rounded p-3 text-xs" style={{ background: '#fee2e2', color: '#dc2626' }}>
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div
              className="rounded-lg border p-4 space-y-2"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Run started
                </h4>
                <StepBadge status={result.status} />
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                ID: {result.id.slice(0, 12)}... — {result.steps.length} steps
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                View the full run in the <strong>Runs</strong> page.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
