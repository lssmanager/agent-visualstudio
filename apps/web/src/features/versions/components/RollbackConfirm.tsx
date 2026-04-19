import { AlertTriangle } from 'lucide-react';
import type { VersionSnapshot } from '../../../lib/types';

interface RollbackConfirmProps {
  snapshot: VersionSnapshot;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function RollbackConfirm({ snapshot, onConfirm, onCancel, loading }: RollbackConfirmProps) {
  return (
    <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: '#fbbf24', background: '#fffbeb' }}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} style={{ color: '#d97706', flexShrink: 0, marginTop: 2 }} />
        <div>
          <h3 className="text-sm font-semibold" style={{ color: '#92400e' }}>Confirm Rollback</h3>
          <p className="text-xs mt-1" style={{ color: '#a16207' }}>
            This will overwrite your current workspace state with the snapshot
            {snapshot.label ? ` "${snapshot.label}"` : ` ${snapshot.id.slice(0, 8)}`}
            {' '}from {new Date(snapshot.createdAt).toLocaleString()}.
          </p>
          <p className="text-xs mt-1 font-medium" style={{ color: '#92400e' }}>
            This action cannot be undone. Consider creating a snapshot of the current state first.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-3 py-1.5 text-xs rounded-md border font-medium transition-colors"
          style={{ color: 'var(--text-primary)', borderColor: 'var(--border-primary)' }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-3 py-1.5 text-xs rounded-md font-medium text-white transition-opacity"
          style={{ background: '#dc2626', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Rolling back...' : 'Rollback'}
        </button>
      </div>
    </div>
  );
}
