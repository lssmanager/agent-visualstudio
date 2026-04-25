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
  const [previewTab, setPreviewTab] = useState<string>('');
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

  useEffect(() => {
    if (generated?.artifacts?.[0]?.name && !previewTab) {
      setPreviewTab(generated.artifacts[0].name);
    }
  }, [generated, previewTab]);

  const runGenerate = async () => {
    setBusy('generate');
    setError('');
    setPreviewTab('');
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

  const selectedArtifact = generated?.artifacts.find((a) => a.name === previewTab);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Versions</h3>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-3">
        {/* Left column — snapshots + actions */}
        <aside className="rounded-md border p-2 space-y-2">
          <p className="text-xs font-semibold uppercase opacity-60">Snapshots</p>
          <select
            className="w-full rounded-md border px-2 py-1.5 text-xs"
            value={selectedSnapshotId}
            onChange={(e) => setSelectedSnapshotId(e.target.value)}
          >
            <option value="">Current (working)</option>
            {snapshots.map((snapshot) => (
              <option key={snapshot.id} value={snapshot.id}>
                {snapshot.label ?? snapshot.id} · {new Date(snapshot.createdAt).toLocaleString()}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
              onClick={() => void runGenerate()}
              disabled={busy !== ''}
            >
              {busy === 'generate' ? 'Generating…' : 'Generate'}
            </button>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
              onClick={() => void runDiff()}
              disabled={busy !== ''}
            >
              {busy === 'diff' ? 'Diffing…' : 'Diff'}
            </button>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
              onClick={() => void runApply()}
              disabled={busy !== '' || !generated}
            >
              {busy === 'apply' ? 'Applying…' : 'Apply'}
            </button>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
              onClick={() => void runRollback()}
              disabled={busy !== '' || !selectedSnapshotId}
            >
              {busy === 'rollback' ? 'Rolling back…' : 'Rollback'}
            </button>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
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
              Export
            </button>
          </div>

          {error && (
            <p className="text-xs rounded-md border p-1.5" style={{ color: 'var(--tone-danger-text, #dc2626)', background: 'rgba(239,68,68,0.08)' }}>
              {error}
            </p>
          )}
        </aside>

        {/* Right column — file preview tabs + diff */}
        <div className="space-y-3 min-w-0">
          {/* Generated file tabs */}
          {generated && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase opacity-60">Generated Core Files</p>
              <div className="flex flex-wrap gap-0 border-b overflow-x-auto">
                {generated.artifacts.map((art) => (
                  <button
                    key={art.name}
                    type="button"
                    className="px-2.5 py-1 text-xs whitespace-nowrap border-b-2 transition-colors"
                    style={{
                      borderBottomColor: previewTab === art.name ? 'var(--color-primary)' : 'transparent',
                      color: previewTab === art.name ? 'var(--color-primary)' : 'var(--text-muted)',
                      fontWeight: previewTab === art.name ? 600 : 400,
                    }}
                    onClick={() => setPreviewTab(art.name)}
                  >
                    {art.name}
                  </button>
                ))}
              </div>
              {selectedArtifact && (
                <pre className="text-xs overflow-auto rounded-md border p-2 max-h-64 font-mono">
                  {selectedArtifact.content}
                </pre>
              )}
            </div>
          )}

          {!generated && (
            <div className="rounded-md border p-3 text-xs opacity-50">
              Click Generate to preview core files for this agent.
            </div>
          )}

          {/* Diff view */}
          {diffPreview && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase opacity-60">Diff vs Deployed / Selected</p>
              <pre className="text-xs overflow-auto rounded-md border p-2 max-h-64 font-mono">{diffPreview}</pre>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
