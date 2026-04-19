import { useState, useEffect, useCallback } from 'react';
import { GitBranch, Plus, RotateCcw, ArrowLeftRight, Upload } from 'lucide-react';
import { PageHeader } from '../../../components';
import { SnapshotList } from '../components/SnapshotList';
import { SnapshotDiff } from '../components/SnapshotDiff';
import { RollbackConfirm } from '../components/RollbackConfirm';
import type { VersionSnapshot } from '../../../lib/types';
import { getVersions, getVersion, createVersion, getVersionDiff, rollbackVersion } from '../../../lib/api';

type ViewMode = 'list' | 'diff' | 'rollback';

interface DiffResult {
  snapshotId: string;
  snapshotLabel?: string;
  snapshotCreatedAt?: string;
  diffs: Array<{ path: string; type: 'added' | 'removed' | 'changed' | 'unchanged'; before?: unknown; after?: unknown }>;
}

export default function VersionsPage() {
  const [snapshots, setSnapshots] = useState<VersionSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<VersionSnapshot | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [label, setLabel] = useState('');

  const loadSnapshots = useCallback(async () => {
    try {
      const data = await getVersions();
      setSnapshots(data);
    } catch (e) {
      console.error('Failed to load snapshots', e);
    }
  }, []);

  useEffect(() => { loadSnapshots(); }, [loadSnapshots]);

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    setViewMode('list');
    setDiffResult(null);
    try {
      const snap = await getVersion(id);
      setSelectedSnapshot(snap);
    } catch {
      setSelectedSnapshot(null);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const snap = await createVersion(label || undefined);
      setLabel('');
      await loadSnapshots();
      setSelectedId(snap.id);
      setSelectedSnapshot(snap);
    } catch (e) {
      console.error('Failed to create snapshot', e);
    } finally {
      setCreating(false);
    }
  };

  const handleViewDiff = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const result = await getVersionDiff(selectedId);
      setDiffResult(result);
      setViewMode('diff');
    } catch (e) {
      console.error('Failed to load diff', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async () => {
    if (!selectedId) return;
    setRollingBack(true);
    try {
      await rollbackVersion(selectedId);
      setViewMode('list');
      await loadSnapshots();
    } catch (e) {
      console.error('Failed to rollback', e);
    } finally {
      setRollingBack(false);
    }
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const response = await fetch('/api/studio/v1/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('Import failed');
        await loadSnapshots();
      } catch (e) {
        console.error('Failed to import', e);
      }
    };
    input.click();
  };

  if (snapshots.length === 0 && !creating) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader title="Versions" icon={GitBranch} description="Workspace snapshots, publish, and rollback" />

        <div className="rounded-xl border p-6 text-center space-y-4" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
          <GitBranch size={40} className="mx-auto" style={{ color: 'var(--text-muted)' }} />
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No snapshots yet</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Create a snapshot to capture your current workspace state.
            </p>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Snapshot label (optional)"
              className="px-3 py-1.5 text-xs rounded-md border"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-3 py-1.5 text-xs rounded-md font-medium text-white flex items-center gap-1.5"
              style={{ background: 'var(--color-primary)', opacity: creating ? 0.6 : 1 }}
            >
              <Plus size={14} />
              {creating ? 'Creating...' : 'Create Snapshot'}
            </button>
            <button
              onClick={handleImport}
              className="px-3 py-1.5 text-xs rounded-md font-medium border flex items-center gap-1.5"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--border-primary)' }}
            >
              <Upload size={14} />
              Import
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader title="Versions" icon={GitBranch} description="Workspace snapshots, publish, and rollback" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left: Snapshot list + create */}
        <div className="md:col-span-1 space-y-3">
          <div className="rounded-xl border p-3 space-y-2" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Snapshot label (optional)"
              className="w-full px-2.5 py-1.5 text-xs rounded-md border"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 px-2.5 py-1.5 text-xs rounded-md font-medium text-white flex items-center justify-center gap-1.5"
                style={{ background: 'var(--color-primary)', opacity: creating ? 0.6 : 1 }}
              >
                <Plus size={12} />
                {creating ? 'Creating...' : 'Snapshot'}
              </button>
              <button
                onClick={handleImport}
                className="px-2.5 py-1.5 text-xs rounded-md font-medium border flex items-center gap-1.5"
                style={{ color: 'var(--text-primary)', borderColor: 'var(--border-primary)' }}
              >
                <Upload size={12} />
              </button>
            </div>
          </div>

          <div className="rounded-xl border p-2" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
            <SnapshotList snapshots={snapshots} selectedId={selectedId ?? undefined} onSelect={handleSelect} />
          </div>
        </div>

        {/* Right: Detail / Diff / Rollback */}
        <div className="md:col-span-2 space-y-3">
          {!selectedId && (
            <div className="rounded-xl border p-8 text-center" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Select a snapshot to view details, diff, or rollback.</p>
            </div>
          )}

          {selectedId && selectedSnapshot && (
            <>
              {/* Actions bar */}
              <div className="rounded-xl border p-3 flex items-center gap-2" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {selectedSnapshot.label || selectedSnapshot.id.slice(0, 12)}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {new Date(selectedSnapshot.createdAt).toLocaleString()} &middot; hash: {selectedSnapshot.hash.slice(0, 8)}
                  </p>
                </div>
                <button
                  onClick={handleViewDiff}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs rounded-md font-medium border flex items-center gap-1.5 transition-colors"
                  style={{ color: 'var(--text-primary)', borderColor: 'var(--border-primary)' }}
                >
                  <ArrowLeftRight size={12} />
                  {loading ? 'Loading...' : 'Diff'}
                </button>
                <button
                  onClick={() => setViewMode('rollback')}
                  className="px-3 py-1.5 text-xs rounded-md font-medium border flex items-center gap-1.5 transition-colors"
                  style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                >
                  <RotateCcw size={12} />
                  Rollback
                </button>
              </div>

              {viewMode === 'diff' && diffResult && (
                <SnapshotDiff
                  snapshotLabel={diffResult.snapshotLabel}
                  snapshotCreatedAt={diffResult.snapshotCreatedAt}
                  diffs={diffResult.diffs}
                />
              )}

              {viewMode === 'rollback' && (
                <RollbackConfirm
                  snapshot={selectedSnapshot}
                  onConfirm={handleRollback}
                  onCancel={() => setViewMode('list')}
                  loading={rollingBack}
                />
              )}

              {viewMode === 'list' && (
                <div className="rounded-xl border p-4" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                  <h4 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Snapshot Details</h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>ID</span>
                      <p className="font-mono" style={{ color: 'var(--text-primary)' }}>{selectedSnapshot.id}</p>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Hash</span>
                      <p className="font-mono" style={{ color: 'var(--text-primary)' }}>{selectedSnapshot.hash}</p>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Created</span>
                      <p style={{ color: 'var(--text-primary)' }}>{new Date(selectedSnapshot.createdAt).toLocaleString()}</p>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Label</span>
                      <p style={{ color: 'var(--text-primary)' }}>{selectedSnapshot.label || '—'}</p>
                    </div>
                    {selectedSnapshot.parentId && (
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Parent</span>
                        <p className="font-mono" style={{ color: 'var(--text-primary)' }}>{selectedSnapshot.parentId.slice(0, 12)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
