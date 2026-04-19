import { Plus, Minus, RefreshCw, Check } from 'lucide-react';

interface DiffEntry {
  path: string;
  type: 'added' | 'removed' | 'changed' | 'unchanged';
  before?: unknown;
  after?: unknown;
}

interface SnapshotDiffProps {
  snapshotLabel?: string;
  snapshotCreatedAt?: string;
  diffs: DiffEntry[];
}

const typeConfig: Record<DiffEntry['type'], { icon: typeof Plus; color: string; label: string }> = {
  added: { icon: Plus, color: '#059669', label: 'Added' },
  removed: { icon: Minus, color: '#dc2626', label: 'Removed' },
  changed: { icon: RefreshCw, color: '#d97706', label: 'Changed' },
  unchanged: { icon: Check, color: '#6b7280', label: 'Unchanged' },
};

export function SnapshotDiff({ snapshotLabel, snapshotCreatedAt, diffs }: SnapshotDiffProps) {
  if (diffs.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center" style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
        <Check size={32} className="mx-auto mb-2" style={{ color: '#059669' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No changes</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Workspace matches snapshot{snapshotLabel ? ` "${snapshotLabel}"` : ''}.
        </p>
      </div>
    );
  }

  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  diffs.forEach((d) => counts[d.type]++);

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        {snapshotLabel && (
          <span>
            Comparing <strong style={{ color: 'var(--text-primary)' }}>"{snapshotLabel}"</strong> vs current
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {counts.added > 0 && <span style={{ color: '#059669' }}>+{counts.added}</span>}
          {counts.removed > 0 && <span style={{ color: '#dc2626' }}>-{counts.removed}</span>}
          {counts.changed > 0 && <span style={{ color: '#d97706' }}>~{counts.changed}</span>}
        </span>
      </div>

      {/* Diff list */}
      <div className="rounded-lg border divide-y" style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
        {diffs.map((diff, i) => {
          const cfg = typeConfig[diff.type];
          const Icon = cfg.icon;
          return (
            <div key={i} className="px-3 py-2 flex items-start gap-3">
              <Icon size={14} style={{ color: cfg.color, marginTop: 2, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                    {diff.path}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ color: cfg.color, background: `${cfg.color}15` }}
                  >
                    {cfg.label}
                  </span>
                </div>
                {diff.type === 'changed' && diff.before && diff.after && (
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <div className="rounded p-2 text-[10px] font-mono overflow-auto max-h-24" style={{ background: 'var(--bg-tertiary)' }}>
                      <span className="font-sans text-[9px] font-semibold block mb-1" style={{ color: '#dc2626' }}>Before</span>
                      {JSON.stringify(diff.before, null, 2)}
                    </div>
                    <div className="rounded p-2 text-[10px] font-mono overflow-auto max-h-24" style={{ background: 'var(--bg-tertiary)' }}>
                      <span className="font-sans text-[9px] font-semibold block mb-1" style={{ color: '#059669' }}>After</span>
                      {JSON.stringify(diff.after, null, 2)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
