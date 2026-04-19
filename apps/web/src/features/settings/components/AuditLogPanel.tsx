import { useEffect, useState } from 'react';

import { getAuditLog } from '../../../lib/api';

interface AuditEntry {
  id: string;
  timestamp: string;
  resource: string;
  resourceId?: string;
  action: string;
  detail: string;
}

export function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [resourceFilter, setResourceFilter] = useState('');

  async function load() {
    try {
      setEntries(await getAuditLog({ resource: resourceFilter || undefined }));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [resourceFilter]);

  if (loading) {
    return <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading audit log...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Audit Log</h3>
        <select
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
          className="rounded border px-2 py-1 text-[10px]"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <option value="">All resources</option>
          <option value="hook">Hooks</option>
          <option value="run">Runs</option>
          <option value="agent">Agents</option>
          <option value="flow">Flows</option>
          <option value="deploy">Deploys</option>
        </select>
      </div>

      {entries.length === 0 ? (
        <div className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>
          No audit entries. Events will appear here as hooks and operations execute.
        </div>
      ) : (
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                    {entry.resource}
                  </span>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{entry.action}</span>
                </div>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="mt-0.5" style={{ color: 'var(--text-muted)' }}>{entry.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
