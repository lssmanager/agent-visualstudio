import { useEffect, useState } from 'react';

import {
  applyCoreFiles,
  createVersion,
  diffCoreFiles,
  generateAgentCoreFiles,
  getVersions,
  rollbackVersion,
} from '../../../../lib/api';
import type { DeployPreview, VersionSnapshot } from '../../../../lib/types';

type Props = {
  agentId: string;
};

export function AgentVersionsSection({ agentId }: Props) {
  const [generated, setGenerated] = useState<DeployPreview | null>(null);
  const [snapshots, setSnapshots] = useState<VersionSnapshot[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('');
  const [diffPreview, setDiffPreview] = useState<string>('');
  const [busy, setBusy] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    void (async () => {
      try {
        const versions = await getVersions();
        setSnapshots(versions);
        if (!selectedSnapshotId && versions.length > 0) {
          setSelectedSnapshotId(versions[0].id);
        }
      } catch {
        setSnapshots([]);
      }
    })();
  }, [selectedSnapshotId]);

  const runGenerate = async () => {
    setBusy('generate');
    setError('');
    try {
      const result = await generateAgentCoreFiles(agentId);
      setGenerated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generate failed');
    } finally {
      setBusy('');
    }
  };

  const runDiff = async () => {
    setBusy('diff');
    setError('');
    try {
      const response = await diffCoreFiles(selectedSnapshotId || undefined);
      setDiffPreview(JSON.stringify(response.diffs ?? response, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Diff failed');
    } finally {
      setBusy('');
    }
  };

  const runApply = async () => {
    if (!generated) return;
    setBusy('apply');
    setError('');
    try {
      await applyCoreFiles({ artifacts: generated.artifacts, applyRuntime: false });
      await createVersion(`agent-${agentId}-apply`);
      const versions = await getVersions();
      setSnapshots(versions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setBusy('');
    }
  };

  const runRollback = async () => {
    if (!selectedSnapshotId) return;
    setBusy('rollback');
    setError('');
    try {
      await rollbackVersion(selectedSnapshotId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Versions</h3>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-3">
        <aside className="rounded-md border p-2 space-y-2">
          <p className="text-xs font-semibold uppercase opacity-80">Snapshots</p>
          <select
            className="w-full rounded-md border px-2 py-1 text-xs"
            value={selectedSnapshotId}
            onChange={(e) => setSelectedSnapshotId(e.target.value)}
          >
            <option value="">Current</option>
            {snapshots.map((snapshot) => (
              <option key={snapshot.id} value={snapshot.id}>
                {snapshot.label ?? snapshot.id} · {new Date(snapshot.createdAt).toLocaleString()}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void runGenerate()} disabled={busy !== ''}>{busy === 'generate' ? 'Generating...' : 'Generate'}</button>
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void runDiff()} disabled={busy !== ''}>{busy === 'diff' ? 'Diff...' : 'Diff'}</button>
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void runApply()} disabled={busy !== '' || !generated}>Apply/Publish</button>
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void runRollback()} disabled={busy !== '' || !selectedSnapshotId}>Rollback</button>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              onClick={() => {
                if (!generated) return;
                const blob = new Blob([JSON.stringify(generated.artifacts, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `agent-${agentId}-core-files.json`;
                anchor.click();
                URL.revokeObjectURL(url);
              }}
              disabled={!generated}
            >
              Export Core Files
            </button>
          </div>
        </aside>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase opacity-80">Generated Core Files Preview</p>
          <pre className="text-xs overflow-auto rounded-md border p-2 max-h-64">{JSON.stringify(generated?.artifacts ?? [], null, 2)}</pre>

          <p className="text-xs font-semibold uppercase opacity-80">Diff vs Deployed/Selected</p>
          <pre className="text-xs overflow-auto rounded-md border p-2 max-h-64">{diffPreview || 'Run Diff to preview changes'}</pre>
        </div>
      </div>

      {error ? <p className="text-xs" style={{ color: 'var(--tone-danger-text)' }}>{error}</p> : null}
    </section>
  );
}
