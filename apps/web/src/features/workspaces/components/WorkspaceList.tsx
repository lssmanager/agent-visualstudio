import { WorkspaceSpec } from '../../../lib/types';

interface WorkspaceListProps {
  current: WorkspaceSpec | null;
}

export function WorkspaceList({ current }: WorkspaceListProps) {
  return (
    <div className="rounded border border-slate-300 bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold">Current Workspace</h3>
      {!current && <p className="text-sm text-slate-600">No workspace yet.</p>}
      {current && (
        <div className="text-xs space-y-2">
          <div>
            <span className="font-medium">Name:</span> {current.name}
          </div>
          <div>
            <span className="font-medium">Slug:</span> {current.slug}
          </div>
          {current.defaultModel && (
            <div>
              <span className="font-medium">Model:</span> {current.defaultModel}
            </div>
          )}
          {current.skillIds && current.skillIds.length > 0 && (
            <div>
              <span className="font-medium">Skills:</span> {current.skillIds.join(', ')}
            </div>
          )}
          {current.routines && current.routines.length > 0 && (
            <div>
              <span className="font-medium">Routines:</span> {current.routines.join(', ')}
            </div>
          )}
          <div className="rounded bg-blue-50 p-2 text-slate-700 text-xs">
            ✓ Workspace values above are from backend merge (request &gt; profile &gt; defaults)
          </div>
        </div>
      )}
    </div>
  );
}
