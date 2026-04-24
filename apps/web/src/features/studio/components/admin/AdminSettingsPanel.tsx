/**
 * AdminSettingsPanel — scope-aware settings surface embedded in the Administration tab.
 *
 * - global/defaults (agency)  → full tabs: Providers · Runtimes · Channels · Security · Automations
 * - partial (department)      → Channels · Security, with inheritance note
 * - scoped (workspace/agent)  → effective config summary + links to full Settings
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Server, Wifi, Shield, Zap, RefreshCw, Plus, Trash2,
  Info, ExternalLink, ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getMcpServers,
  getBudgets,
  getHooks,
  getRuntimeCapabilities,
  getRuntimeChannels,
  removeMcpServer,
} from '../../../../lib/api';
import { useHierarchy } from '../../../../lib/HierarchyContext';
import { useStudioState } from '../../../../lib/StudioStateContext';
import type { HookSpec, RuntimeCapabilityMatrix } from '../../../../lib/types';
import type { ScopeSettingsMode } from '../../../../lib/ScopeViewRegistry';

interface AdminSettingsPanelProps {
  settingsScope: ScopeSettingsMode['value'];
}

// ── Shared helpers ────────────────────────────────────────────────────────

function PanelLoading() {
  const createHref = workspace?.id
    ? `/agents-builder?mode=create&type=agent&parentWorkspaceId=${encodeURIComponent(workspace.id)}`
    : '/agents-builder?mode=create&type=agent';

  return (
    <div className="flex items-center gap-2 py-8 justify-center" style={{ color: 'var(--text-muted)' }}>
      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--tone-danger-border)', background: 'var(--tone-danger-bg)' }}>
      <p className="text-xs font-semibold" style={{ color: 'var(--tone-danger-text)' }}>Error</p>
      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{message}</p>
      <button type="button" onClick={onRetry} className="mt-1.5 text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--color-primary)' }}>
        <RefreshCw size={10} /> Retry
      </button>
    </div>
  );
}

function sectionLabel(text: string) {
  return (
    <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>{text}</p>
  );
}

function row(children: React.ReactNode) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
      {children}
    </div>
  );
}

// ── Providers (MCP Servers) ───────────────────────────────────────────────

function ProvidersSection() {
  const [servers, setServers] = useState<Array<{ id: string; name: string; url: string; protocol: string; enabled: boolean }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setServers(await getMcpServers()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleRemove = async (id: string) => { try { await removeMcpServer(id); await load(); } catch { /* ignored */ } };

  if (loading) return <PanelLoading />;
  if (error) return <PanelError message={error} onRetry={load} />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {sectionLabel(`MCP Providers (${servers?.length ?? 0})`)}
        <button type="button" className="text-xs flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold" style={{ background: 'var(--color-primary)', color: '#fff' }}>
          <Plus size={11} /> Add
        </button>
      </div>
      {!servers?.length ? (
        <div className="py-6 text-center border border-dashed rounded-lg" style={{ borderColor: 'var(--border-primary)' }}>
          <Server size={24} className="mx-auto mb-1.5" style={{ color: 'var(--text-muted)' }} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No MCP servers configured</p>
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((s) => (
            <div key={s.id} className="rounded-lg border p-3 flex items-center gap-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
              <Server size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>{s.protocol}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${s.enabled ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100'}`}>{s.enabled ? 'on' : 'off'}</span>
                </div>
                <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{s.url}</p>
              </div>
              <button type="button" className="p-1 rounded" style={{ color: 'var(--tone-danger-text)' }} onClick={() => { void handleRemove(s.id); }} title="Remove">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Runtimes ──────────────────────────────────────────────────────────────

function RuntimesSection() {
  const { state } = useStudioState();
  const [caps, setCaps] = useState<RuntimeCapabilityMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setCaps(await getRuntimeCapabilities()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <PanelLoading />;
  if (error) return <PanelError message={error} onRetry={load} />;

  const healthOk = state.runtime?.health?.ok ?? false;

  return (
    <div className="space-y-3">
      {sectionLabel('Runtime Capabilities')}
      <div className="flex items-center gap-3 rounded-lg border p-3" style={{
        borderColor: healthOk ? 'var(--tone-success-border)' : 'var(--tone-danger-border)',
        background: healthOk ? 'var(--tone-success-bg)' : 'var(--tone-danger-bg)',
      }}>
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${healthOk ? 'bg-emerald-500' : 'bg-red-500'}`} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{healthOk ? 'Runtime Online' : 'Runtime Offline'}</p>
          {caps && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Source: <code style={{ fontFamily: 'var(--font-mono)' }}>{caps.source}</code></p>}
        </div>
      </div>
      {caps && (
        <>
          {sectionLabel('Topology Actions')}
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(caps.topology).map(([action, ok]) => (
              <div key={action} className="rounded-md border p-2.5 flex items-center gap-2" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                <span className="text-xs capitalize" style={{ color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{action}</span>
              </div>
            ))}
          </div>
          {sectionLabel('Inspection')}
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(caps.inspection).map(([cap, ok]) => (
              <div key={cap} className="rounded-md border p-2.5 flex items-center gap-2" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                <span className="text-xs capitalize" style={{ color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{cap}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Channels ─────────────────────────────────────────────────────────────

function ChannelsSection() {
  const { canonical } = useHierarchy();
  const [channels, setChannels] = useState<Array<{ channel: string; sessions: number; activeSessions: number }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setChannels(await getRuntimeChannels()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <PanelLoading />;
  if (error) return <PanelError message={error} onRetry={load} />;

  const bindings = canonical?.runtimeControl.channelBindings ?? [];

  return (
    <div className="space-y-3">
      {channels && channels.length > 0 && (
        <>
          {sectionLabel(`Runtime Channels (${channels.length})`)}
          <div className="space-y-2">
            {channels.map((ch) => (
              <div key={ch.channel} className="rounded-lg border p-3 flex items-center justify-between" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{ch.channel}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{ch.sessions} total · {ch.activeSessions} active</p>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full ${ch.activeSessions > 0 ? 'bg-emerald-400' : 'bg-slate-300'}`} />
              </div>
            ))}
          </div>
        </>
      )}
      {bindings.length > 0 && (
        <>
          {sectionLabel(`Channel Bindings (${bindings.length})`)}
          <div className="space-y-2">
            {bindings.map((b) => (
              <div key={b.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Wifi size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{b.channel}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${b.enabled ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100'}`}>{b.enabled ? 'enabled' : 'disabled'}</span>
                  <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{b.sourceLevel}</span>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Route: {b.route}</p>
              </div>
            ))}
          </div>
        </>
      )}
      {!channels?.length && !bindings.length && (
        <div className="py-6 text-center border border-dashed rounded-lg" style={{ borderColor: 'var(--border-primary)' }}>
          <Wifi size={24} className="mx-auto mb-1.5" style={{ color: 'var(--text-muted)' }} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No active channels or bindings</p>
        </div>
      )}
    </div>
  );
}

// ── Security (budgets + policies) ─────────────────────────────────────────

function SecuritySection() {
  const { state } = useStudioState();
  const [budgets, setBudgets] = useState<Array<{ id: string; name: string; scope: string; limitUsd: number; periodDays: number; currentUsageUsd: number; enabled: boolean }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setBudgets(await getBudgets()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <PanelLoading />;
  if (error) return <PanelError message={error} onRetry={load} />;

  const policies = state.policies ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {sectionLabel(`Cost Budgets (${budgets?.length ?? 0})`)}
        <button type="button" className="text-xs flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold" style={{ background: 'var(--color-primary)', color: '#fff' }}>
          <Plus size={11} /> Add Budget
        </button>
      </div>
      {!budgets?.length ? (
        <div className="py-6 text-center border border-dashed rounded-lg" style={{ borderColor: 'var(--border-primary)' }}>
          <Shield size={24} className="mx-auto mb-1.5" style={{ color: 'var(--text-muted)' }} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No budgets configured</p>
        </div>
      ) : (
        <div className="space-y-2">
          {budgets.map((b) => {
            const pct = b.limitUsd > 0 ? Math.min(100, (b.currentUsageUsd / b.limitUsd) * 100) : 0;
            const over = pct >= 90; const warn = pct >= 70;
            return (
              <div key={b.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{b.name}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${b.enabled ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100'}`}>{b.enabled ? 'active' : 'off'}</span>
                </div>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  <span>{b.scope} · {b.periodDays}d</span>
                  <span className={over ? 'text-red-600 font-bold' : ''}>${b.currentUsageUsd.toFixed(2)} / ${b.limitUsd.toFixed(2)}</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border-primary)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? '#ef4444' : warn ? '#f59e0b' : '#22c55e' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {policies.length > 0 && (
        <>
          {sectionLabel(`Policies (${policies.length})`)}
          <div className="space-y-1.5">
            {policies.map((p: { id: string; name: string }) => (
              <div key={p.id} className="rounded-lg border p-2.5 flex items-center gap-2" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
                <Shield size={13} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                <span className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                <code className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.id}</code>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Automations (hooks grouped by event) ─────────────────────────────────

function AutomationsSection() {
  const [hooks, setHooks] = useState<HookSpec[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setHooks(await getHooks()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <PanelLoading />;
  if (error) return <PanelError message={error} onRetry={load} />;

  const grouped = (hooks ?? []).reduce<Record<string, HookSpec[]>>((acc, h) => {
    (acc[h.event] ??= []).push(h); return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {sectionLabel(`Hooks (${hooks?.length ?? 0})`)}
        <button type="button" className="text-xs flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold" style={{ background: 'var(--color-primary)', color: '#fff' }}>
          <Plus size={11} /> Add Hook
        </button>
      </div>
      {!hooks?.length ? (
        <div className="py-6 text-center border border-dashed rounded-lg" style={{ borderColor: 'var(--border-primary)' }}>
          <Zap size={24} className="mx-auto mb-1.5" style={{ color: 'var(--text-muted)' }} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No hooks configured</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([event, eventHooks]) => (
            <div key={event}>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>{event}</p>
              <div className="space-y-1.5">
                {eventHooks.map((h) => (
                  <div key={h.id} className="rounded-lg border p-2.5 flex items-center gap-2.5" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${h.enabled ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                    <span className="text-sm capitalize flex-1" style={{ color: 'var(--text-primary)' }}>{h.action}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${h.enabled ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100'}`}>{h.enabled ? 'on' : 'off'}</span>
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

// ── Scoped settings summary (workspace / agent / subagent) ────────────────

function ScopedSettingsSummary() {
  const { state } = useStudioState();
  const { selectedNode, scope } = useHierarchy();
  const navigate = useNavigate();
  const workspace = state.workspace;

  const agent = scope.agentId
    ? state.agents.find((a) => a.id === scope.agentId) ?? null
    : scope.subagentId
      ? state.agents.find((a) => a.id === scope.subagentId) ?? null
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
        <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }} />
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Scoped settings override inherited defaults. Full configuration is available in the{' '}
          <button
            type="button"
            className="font-semibold underline"
            style={{ color: 'var(--color-primary)' }}
            onClick={() => navigate('/settings')}
          >
            global Settings
          </button>{' '}
          and{' '}
          <button
            type="button"
            className="font-semibold underline"
            style={{ color: 'var(--color-primary)' }}
            onClick={() => navigate(createHref)}
          >
            Entity Editor
          </button>.
        </p>
      </div>

      {workspace && (
        <>
          {sectionLabel('Workspace')}
          <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
            {[
              { label: 'Name', value: workspace.name },
              { label: 'Default Model', value: workspace.defaultModel ?? '—' },
              { label: 'Skills', value: `${workspace.skillIds?.length ?? 0} assigned` },
              { label: 'Routing Rules', value: `${workspace.routingRules?.length ?? 0}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {agent && (
        <>
          {sectionLabel(`${agent.kind === 'subagent' ? 'Subagent' : 'Agent'}: ${agent.name}`)}
          <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
            {[
              { label: 'Model', value: agent.model ?? '—' },
              { label: 'Role', value: agent.role ?? '—' },
              { label: 'Skills', value: `${agent.skillRefs?.length ?? 0} assigned` },
              { label: 'Channels', value: `${agent.channelBindings?.length ?? 0} bindings` },
              { label: 'Handoffs', value: `${agent.handoffRules?.length ?? 0} rules` },
              { label: 'Enabled', value: agent.isEnabled ? 'Yes' : 'No' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => navigate(createHref)}
        className="w-full flex items-center justify-between rounded-lg border p-3 text-left"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
      >
        <span className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Open Entity Editor</span>
        <ChevronRight size={14} style={{ color: 'var(--color-primary)' }} />
      </button>
    </div>
  );
}

// ── Main AdminSettingsPanel ───────────────────────────────────────────────

type SettingsTab = 'providers' | 'runtimes' | 'channels' | 'security' | 'automations';

const GLOBAL_TABS: Array<{ id: SettingsTab; label: string; Icon: typeof Server }> = [
  { id: 'providers', label: 'Providers', Icon: Server },
  { id: 'runtimes', label: 'Runtimes', Icon: RefreshCw },
  { id: 'channels', label: 'Channels', Icon: Wifi },
  { id: 'security', label: 'Security', Icon: Shield },
  { id: 'automations', label: 'Automations', Icon: Zap },
];

const DEPT_TABS: Array<{ id: SettingsTab; label: string; Icon: typeof Server }> = [
  { id: 'channels', label: 'Channels', Icon: Wifi },
  { id: 'security', label: 'Security', Icon: Shield },
];

export function AdminSettingsPanel({ settingsScope }: AdminSettingsPanelProps) {
  const navigate = useNavigate();

  const tabs = settingsScope === 'global/defaults' ? GLOBAL_TABS : settingsScope === 'partial' ? DEPT_TABS : null;
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');

  // Reset to first tab when scope changes
  useEffect(() => {
    if (tabs && !tabs.find((t) => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [settingsScope]); // eslint-disable-line react-hooks/exhaustive-deps

  if (settingsScope === 'scoped') {
    return <ScopedSettingsSummary />;
  }

  return (
    <div className="space-y-4">
      {settingsScope === 'partial' && (
        <div className="flex items-start gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
          <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Department applies partial overrides. Providers, runtimes, and automations are inherited from agency defaults.{' '}
            <button
              type="button"
              className="font-semibold underline inline-flex items-center gap-0.5"
              style={{ color: 'var(--color-primary)' }}
              onClick={() => navigate('/settings')}
            >
              Global Settings <ExternalLink size={10} />
            </button>
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-0.5 border-b" style={{ borderColor: 'var(--border-primary)' }}>
        {tabs?.map((t) => {
          const Icon = t.Icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold relative transition-colors"
              style={{ color: activeTab === t.id ? 'var(--color-primary)' : 'var(--text-muted)' }}
            >
              <Icon size={12} />
              {t.label}
              {activeTab === t.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: 'var(--color-primary)' }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'providers' && <ProvidersSection />}
        {activeTab === 'runtimes' && <RuntimesSection />}
        {activeTab === 'channels' && <ChannelsSection />}
        {activeTab === 'security' && <SecuritySection />}
        {activeTab === 'automations' && <AutomationsSection />}
      </div>
    </div>
  );
}
