import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { RunSpec } from '../../../lib/types';
import { replayRun } from '../../../lib/api';

interface RunReplayProps {
  run: RunSpec;
  onReplayCreated: (newRun: RunSpec) => void;
}

export function RunReplay({ run, onReplayCreated }: RunReplayProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canReplay = run.status === 'completed' || run.status === 'failed';

  const handleReplay = async () => {
    setLoading(true);
    setError(null);
    try {
      const newRun = await replayRun(run.id);
      onReplayCreated(newRun);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replay failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
      <div className="flex items-center gap-3">
        <RefreshCw size={16} style={{ color: 'var(--color-primary)' }} />
        <div className="flex-1">
          <h4 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Replay Run</h4>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Re-execute this run with the same flow and trigger configuration.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Flow</span>
          <p className="font-mono" style={{ color: 'var(--text-primary)' }}>{run.flowId}</p>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Trigger</span>
          <p className="font-mono" style={{ color: 'var(--text-primary)' }}>{run.trigger.type}</p>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Original Status</span>
          <p style={{ color: run.status === 'completed' ? '#059669' : '#dc2626' }}>{run.status}</p>
        </div>
      </div>

      {error && (
        <p className="text-xs px-2 py-1.5 rounded" style={{ color: '#dc2626', background: '#fef2f2' }}>{error}</p>
      )}

      <button
        onClick={handleReplay}
        disabled={!canReplay || loading}
        className="px-3 py-1.5 text-xs rounded-md font-medium text-white flex items-center gap-1.5 transition-opacity"
        style={{ background: 'var(--color-primary)', opacity: (!canReplay || loading) ? 0.5 : 1 }}
      >
        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Replaying...' : 'Start Replay'}
      </button>

      {!canReplay && (
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          Only completed or failed runs can be replayed.
        </p>
      )}
    </div>
  );
}
