import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings as SettingsIcon, Server, Wifi, Link2, Shield, Zap, Plus, Trash2, RefreshCw } from 'lucide-react';

import { PageHeader } from '../../../components';
import { useStudioState } from '../../../lib/StudioStateContext';
import { useHierarchy } from '../../../lib/HierarchyContext';
import {
  getMcpServers,
  getBudgets,
  getHooks,
  getRuntimeCapabilities,
  getRuntimeChannels,
  removeMcpServer,
} from '../../../lib/api';
import type { HookSpec, RuntimeCapabilityMatrix } from '../../../lib/types';

const TABS = ['general', 'providers', 'runtimes', 'channels', 'integrations', 'diagnostics', 'security', 'automations'] as const;
type Tab = typeof TABS[number];

const TAB_LABEL: Record<Tab, string> = {
  general: 'General',
  providers: 'Providers',
  runtimes: 'Runtimes',
  channels: 'Channels',
  integrations: 'Integrations',
  diagnostics: 'Diagnostics',
  security: 'Security',
  automations: 'Automations',
};

function parseTab(value: string | null): Tab {
  if (TABS.includes(value as Tab)) return value as Tab;
  return 'general';
}

interface McpServer {
  id: string;
  name: string;
  url: string;
  protocol: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
}

interface Budget {
  id: string;
  name: string;
  scope: string;
  limitUsd: number;
  periodDays: number;
  currentUsageUsd: number;
  enabled: boolean;
}

function SectionLoading() {
  return (
    <div className="flex items-center gap-2 py-10 justify-center" style={{ color: 'var(--text-muted)' }}>
      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--tone-danger-border)', background: 'var(--tone-danger-bg)' }}>
      <p className="text-sm font-semibold" style={{ color: 'var(--tone-danger-text)' }}>Failed to load data</p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 text-xs font-semibold flex items-center gap-1"
        style={{ color: 'var(--color-primary)' }}
      >
        <RefreshCw size={11} /> Retry
      </button>
    </div>
  );
}

// ── General Tab ──────────────────────────────────────────────────────────

function GeneralTab() {
  const { state } = useStudioState();
  const workspace = state.workspace;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Workspace', value: workspace?.name ?? '—' },
          { label: 'Default Model', value: workspace?.defaultModel ?? '—' },
          { label: 'Agents', value: String(state.agents.length) },
          { label: 'Flows', value: String(state.flows.length) },
          { label: 'Skills', value: String(state.skills.length) },
          { label: 'Profiles', value: String(state.profiles?.length ?? 0) },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg border p-3"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
          >
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</p>
            <p className="text-sm font-semibold mt-0.5 truncate" style={{ color: 'var(--text-primary)' }}>{value}</p>
          </div>
        ))}
      </div>
      {workspace?.id && (
        <div
          className="rounded-lg border p-3 space-y-1"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
        >
          <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>Workspace ID</p>
          <code className="text-xs break-all" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{workspace.id}</code>
        </div>
      )}
      {workspace?.tags && workspace.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {workspace.tags.map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Providers Tab (MCP servers) ──────────────────────────────────────────

function ProvidersTab() {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMcpServers();
      setServers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRemove = async (id: string) => {
    try {
      await removeMcpServer(id);
      await load();
    } catch {
      // error handled by re-loading
    }
  };

  if (loading) return <SectionLoading />;
  if (error) return <SectionError message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>MCP Tool Servers</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{servers?.length ?? 0} configured</p>
        </div>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          <Plus size={12} /> Add Server
        </button>
      </div>

      {!servers?.length ? (
        <div className="py-10 text-center rounded-lg border border-dashed" style={{ borderColor: 'var(--border-primary)' }}>
          <Server size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No MCP servers configured</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Add a provider to extend agent tool capabilities</p>
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((server) => (
            <div
              key={server.id}
              className="rounded-lg border p-4 flex items-start justify-between gap-4"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{server.name}</p>
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>
                    {server.protocol}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${server.enabled ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100'}`}>
                    {server.enabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
                <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{server.url}</p>
                {server.description && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{server.description}</p>
                )}
              </div>
              <button
                type="button"
                className="p-1.5 rounded hover:bg-red-50 flex-shrink-0"
                style={{ color: 'var(--tone-danger-text)' }}
                onClick={() => { void handleRemove(server.id); }}
                title="Remove server"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Runtimes Tab ─────────────────────────────────────────────────────────

function RuntimesTab() {
  const { state } = useStudioState();
  const [caps, setCaps] = useState<RuntimeCapabilityMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRuntimeCapabilities();
      setCaps(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runtime capabilities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <SectionLoading />;
  if (error) return <SectionError message={error} onRetry={load} />;

  const healthOk = state.runtime?.health?.ok ?? false;

  return (
    <div className="space-y-5">
      <div
        className="flex items-center gap-3 rounded-lg border p-4"
        style={{
          borderColor: healthOk ? 'var(--tone-success-border)' : 'var(--tone-danger-border)',
          background: healthOk ? 'var(--tone-success-bg)' : 'var(--tone-danger-bg)',
        }}
      >
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${healthOk ? 'bg-emerald-500' : 'bg-red-500'}`} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Runtime Health: {healthOk ? 'Online' : 'Offline'}
          </p>
          {caps && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Source: <code style={{ fontFamily: 'var(--font-mono)' }}>{caps.source}</code>
            </p>
          )}
        </div>
      </div>

      {caps && (
        <>
          <div>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>
              Topology Actions
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(caps.topology).map(([action, supported]) => (
                <div
                  key={action}
                  className="rounded-lg border p-3 flex items-center gap-2"
                  style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${supported ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                  <span className="text-sm capitalize" style={{ color: supported ? 'var(--text-primary)' : 'var(--text-muted)' }}>{action}</span>
                  <span className="ml-auto text-xs" style={{ color: supported ? 'var(--tone-success-text)' : 'var(--text-muted)' }}>
                    {supported ? 'available' : 'n/a'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>
              Inspection Capabilities
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(caps.inspection).map(([cap, supported]) => (
                <div
                  key={cap}
                  className="rounded-lg border p-3 flex items-center gap-2"
                  style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${supported ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                  <span className="text-sm capitalize" style={{ color: supported ? 'var(--text-primary)' : 'var(--text-muted)' }}>{cap}</span>
                  <span className="ml-auto text-xs" style={{ color: supported ? 'var(--tone-success-text)' : 'var(--text-muted)' }}>
                    {supported ? 'available' : 'n/a'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Channels Tab ─────────────────────────────────────────────────────────

function ChannelsTab() {
  const { canonical } = useHierarchy();
  const [channels, setChannels] = useState<Array<{ channel: string; sessions: number; activeSessions: number }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRuntimeChannels();
      setChannels(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load channel data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <SectionLoading />;
  if (error) return <SectionError message={error} onRetry={load} />;

  const channelBindings = canonical?.runtimeControl.channelBindings ?? [];

  return (
    <div className="space-y-5">
      {channels && channels.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>
              Active Runtime Channels ({channels.length})
            </p>
            <button type="button" onClick={load} className="text-xs flex items-center gap-1" style={{ color: 'var(--color-primary)' }}>
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
          <div className="space-y-2">
            {channels.map((ch) => (
              <div
                key={ch.channel}
                className="rounded-lg border p-3 flex items-center justify-between"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{ch.channel}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {ch.sessions} total · {ch.activeSessions} active
                  </p>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full ${ch.activeSessions > 0 ? 'bg-emerald-400' : 'bg-slate-300'}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {channelBindings.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>
            Channel Bindings ({channelBindings.length})
          </p>
          <div className="space-y-2">
            {channelBindings.map((binding) => (
              <div
                key={binding.id}
                className="rounded-lg border p-3"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{binding.channel}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${binding.enabled ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100'}`}>
                    {binding.enabled ? 'enabled' : 'disabled'}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                    {binding.sourceLevel}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Route: {binding.route}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!channels?.length && !channelBindings.length && (
        <div className="py-10 text-center rounded-lg border border-dashed" style={{ borderColor: 'var(--border-primary)' }}>
          <Wifi size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No active channels</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Channel data appears when the runtime is connected and sessions are active
          </p>
        </div>
      )}
    </div>
  );
}

// ── Integrations Tab (MCP + webhook hooks) ───────────────────────────────

function IntegrationsTab() {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [hooks, setHooks] = useState<HookSpec[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, h] = await Promise.all([getMcpServers(), getHooks()]);
      setServers(s);
      setHooks(h);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <SectionLoading />;
  if (error) return <SectionError message={error} onRetry={load} />;

  const webhookHooks = hooks?.filter((h) => h.action === 'webhook') ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>
          MCP Tool Providers ({servers?.length ?? 0})
        </p>
        {!servers?.length ? (
          <p className="text-sm py-2" style={{ color: 'var(--text-muted)' }}>No MCP servers configured. Add servers in the Providers tab.</p>
        ) : (
          <div className="space-y-2">
            {servers.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border p-3"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>{s.protocol}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${s.enabled ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100'}`}>
                    {s.enabled ? 'active' : 'inactive'}
                  </span>
                </div>
                <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{s.url}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>
          Webhook Integrations ({webhookHooks.length})
        </p>
        {!webhookHooks.length ? (
          <div
            className="rounded-lg border p-4 text-center border-dashed"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <Link2 size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No webhook hooks configured</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Create webhook hooks in the Automations tab</p>
          </div>
        ) : (
          <div className="space-y-2">
            {webhookHooks.map((h) => (
              <div
                key={h.id}
                className="rounded-lg border p-3 flex items-center gap-3"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${h.enabled ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{h.event}</p>
                  {typeof h.config.url === 'string' && (
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{h.config.url}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${h.enabled ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100'}`}>
                  {h.enabled ? 'active' : 'disabled'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Diagnostics Tab ──────────────────────────────────────────────────────

function DiagnosticsTab() {
  const { state } = useStudioState();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>Compile Diagnostics</p>
        {state.compile.diagnostics.length === 0 ? (
          <div
            className="flex items-center gap-3 rounded-lg border p-3"
            style={{ borderColor: 'var(--tone-success-border)', background: 'var(--tone-success-bg)' }}
          >
            <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            <p className="text-sm" style={{ color: 'var(--tone-success-text)' }}>No compile diagnostics. All artifacts are clean.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {state.compile.diagnostics.map((item) => (
              <li
                key={item}
                className="text-xs rounded-lg border px-3 py-2"
                style={{
                  borderColor: 'var(--tone-warning-border)',
                  background: 'var(--tone-warning-bg)',
                  color: 'var(--tone-warning-text)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>Runtime Health</p>
        <div
          className="flex items-center gap-3 rounded-lg border p-3"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
        >
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${state.runtime?.health?.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            {state.runtime?.health?.ok ? 'Runtime is online and responding' : 'Runtime is offline or not responding'}
          </p>
        </div>
      </div>

      {state.compile.artifacts && (state.compile.artifacts as unknown[]).length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>
            Compile Artifacts ({(state.compile.artifacts as unknown[]).length})
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {(state.compile.artifacts as unknown[]).length} artifact{(state.compile.artifacts as unknown[]).length === 1 ? '' : 's'} compiled successfully
          </p>
        </div>
      )}
    </div>
  );
}

// ── Security Tab ─────────────────────────────────────────────────────────

function SecurityTab() {
  const { state } = useStudioState();
  const [budgets, setBudgets] = useState<Budget[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBudgets();
      setBudgets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load security data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <SectionLoading />;
  if (error) return <SectionError message={error} onRetry={load} />;

  const policies = state.policies ?? [];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>Budget Controls ({budgets?.length ?? 0})</p>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            <Plus size={12} /> Add Budget
          </button>
        </div>

        {!budgets?.length ? (
          <div className="rounded-lg border border-dashed py-8 text-center" style={{ borderColor: 'var(--border-primary)' }}>
            <Shield size={28} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>No budgets configured</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Add cost budgets to control agent spending limits per scope</p>
          </div>
        ) : (
          <div className="space-y-3">
            {budgets.map((budget) => {
              const usePct = budget.limitUsd > 0 ? Math.min(100, (budget.currentUsageUsd / budget.limitUsd) * 100) : 0;
              const over = usePct >= 90;
              const warn = usePct >= 70;
              return (
                <div
                  key={budget.id}
                  className="rounded-lg border p-4"
                  style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{budget.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Scope: {budget.scope} · Period: {budget.periodDays}d</p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-semibold ${budget.enabled ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100'}`}
                    >
                      {budget.enabled ? 'active' : 'disabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    <span>${budget.currentUsageUsd.toFixed(2)} used</span>
                    <span className={over ? 'text-red-600 font-bold' : ''}>
                      ${budget.limitUsd.toFixed(2)} limit
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-primary)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${usePct}%`,
                        background: over ? '#ef4444' : warn ? '#f59e0b' : '#22c55e',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {policies.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>Active Policies ({policies.length})</p>
          <div className="space-y-2">
            {policies.map((policy: { id: string; name: string }) => (
              <div
                key={policy.id}
                className="rounded-lg border p-3 flex items-center gap-2"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
              >
                <Shield size={14} style={{ color: 'var(--color-primary)' }} />
                <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>{policy.name}</span>
                <code className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{policy.id}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Automations Tab (hooks grouped by event) ─────────────────────────────

function AutomationsTab() {
  const [hooks, setHooks] = useState<HookSpec[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getHooks();
      setHooks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load automations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <SectionLoading />;
  if (error) return <SectionError message={error} onRetry={load} />;

  const grouped = (hooks ?? []).reduce<Record<string, HookSpec[]>>((acc, hook) => {
    const ev = hook.event;
    if (!acc[ev]) acc[ev] = [];
    acc[ev].push(hook);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Automation Hooks</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{hooks?.length ?? 0} configured across {Object.keys(grouped).length} event types</p>
        </div>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          <Plus size={12} /> Add Hook
        </button>
      </div>

      {!hooks?.length ? (
        <div className="py-10 text-center rounded-lg border border-dashed" style={{ borderColor: 'var(--border-primary)' }}>
          <Zap size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No automation hooks configured</p>
          <p className="text-xs mt-1 max-w-xs mx-auto" style={{ color: 'var(--text-muted)' }}>
            Hooks fire on runtime events: before/after run, on error, on approval, and more
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([event, eventHooks]) => (
            <div key={event}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                {event}
              </p>
              <div className="space-y-2">
                {eventHooks.map((hook) => (
                  <div
                    key={hook.id}
                    className="rounded-lg border p-3 flex items-center gap-3"
                    style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${hook.enabled ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
                        {hook.action}
                        {hook.priority !== undefined ? <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-muted)' }}>priority {hook.priority}</span> : null}
                      </p>
                      {typeof hook.config.url === 'string' && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{hook.config.url}</p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${hook.enabled ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100'}`}>
                      {hook.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SettingsPage ──────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { scope } = useHierarchy();
  const activeTab = parseTab(searchParams.get('tab'));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader title="Settings" icon={SettingsIcon} description="Global configuration, providers, security, and diagnostics" />

      {!scope.agencyId && (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}
        >
          No agency selected. Create or connect an agency to configure studio settings.
        </div>
      )}

      <div className="flex gap-0.5 border-b flex-wrap" style={{ borderColor: 'var(--border-primary)' }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setSearchParams({ tab }, { replace: true })}
            className="px-4 py-2 text-sm font-medium transition-colors relative"
            style={{ color: activeTab === tab ? 'var(--color-primary)' : 'var(--text-muted)' }}
          >
            {TAB_LABEL[tab]}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: 'var(--color-primary)' }} />
            )}
          </button>
        ))}
      </div>

      <div className="rounded-xl border p-6" style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'providers' && <ProvidersTab />}
        {activeTab === 'runtimes' && <RuntimesTab />}
        {activeTab === 'channels' && <ChannelsTab />}
        {activeTab === 'integrations' && <IntegrationsTab />}
        {activeTab === 'diagnostics' && <DiagnosticsTab />}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'automations' && <AutomationsTab />}
      </div>
    </div>
  );
}
