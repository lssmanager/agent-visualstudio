import { useEffect, useState } from 'react';
import { Plus, Trash2, Server } from 'lucide-react';

import { getMcpServers, addMcpServer, removeMcpServer } from '../../../lib/api';

interface McpServer {
  id: string;
  name: string;
  url: string;
  protocol: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
}

export function McpRegistryPanel() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [protocol, setProtocol] = useState<'stdio' | 'sse' | 'http'>('http');

  async function load() {
    try {
      setServers(await getMcpServers());
    } catch {
      setServers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate() {
    await addMcpServer({ name, url, protocol, enabled: true });
    setCreating(false);
    setName('');
    setUrl('');
    await load();
  }

  async function handleRemove(id: string) {
    await removeMcpServer(id);
    await load();
  }

  if (loading) {
    return <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading MCP servers...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>MCP Servers</h3>
        <button
          onClick={() => setCreating(!creating)}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          <Plus size={12} /> Register Server
        </button>
      </div>

      {creating && (
        <div
          className="rounded border p-3 space-y-2"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Server name"
            className="w-full rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--border-primary)' }} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Server URL or command"
            className="w-full rounded border px-2 py-1 text-xs font-mono" style={{ borderColor: 'var(--border-primary)' }} />
          <select value={protocol} onChange={(e) => setProtocol(e.target.value as typeof protocol)}
            className="rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--border-primary)' }}>
            <option value="http">HTTP</option>
            <option value="sse">SSE</option>
            <option value="stdio">Stdio</option>
          </select>
          <button onClick={handleCreate} className="rounded px-3 py-1 text-xs font-medium text-white"
            style={{ background: 'var(--color-primary)' }}>Register</button>
        </div>
      )}

      {servers.length === 0 ? (
        <div className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>
          No MCP servers registered. Register tool servers to extend agent capabilities.
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((s) => (
            <div
              key={s.id}
              className="rounded border p-3 flex items-center justify-between"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
            >
              <div className="flex items-center gap-2">
                <Server size={14} style={{ color: 'var(--text-muted)' }} />
                <div>
                  <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</div>
                  <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{s.url}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {s.protocol} — {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <button onClick={() => void handleRemove(s.id)} className="p-1 rounded" style={{ color: '#dc2626' }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
