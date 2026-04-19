import { type VersionSnapshot } from '../../../lib/types';
import { Clock, Tag, Hash } from 'lucide-react';

interface SnapshotListProps {
  snapshots: VersionSnapshot[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function SnapshotList({ snapshots, selectedId, onSelect }: SnapshotListProps) {
  if (snapshots.length === 0) {
    return (
      <p className="text-xs py-8 text-center" style={{ color: 'var(--text-muted)' }}>
        No snapshots yet. Create one to get started.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {snapshots.map((snap) => {
        const isSelected = snap.id === selectedId;
        return (
          <button
            key={snap.id}
            onClick={() => onSelect(snap.id)}
            className="w-full text-left rounded-lg px-3 py-2.5 transition-colors flex items-start gap-3 border"
            style={{
              background: isSelected ? 'var(--color-primary-soft)' : 'transparent',
              borderColor: isSelected ? 'var(--color-primary)' : 'transparent',
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {snap.label ? (
                  <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                    <Tag size={12} />
                    {snap.label}
                  </span>
                ) : (
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    {snap.id.slice(0, 8)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  <Clock size={10} />
                  {new Date(snap.createdAt).toLocaleString()}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  <Hash size={10} />
                  {snap.hash.slice(0, 8)}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
