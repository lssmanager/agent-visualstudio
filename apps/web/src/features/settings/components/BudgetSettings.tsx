import { useState } from 'react';
import { Plus, Trash2, Pencil, ShieldAlert, BellRing, PauseCircle, X, Check } from 'lucide-react';
import type { BudgetPolicy, BudgetScope, BudgetAction } from '../../../types/budget';

// ─── Mock types matching StudioStateContext shape ────────────────────────────
interface Agent   { id: string; name: string; }
interface Channel { id: string; name: string; type?: string; }

interface Props {
  workspaceId: string;
  agents: Agent[];
  channels?: Channel[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────
function buildMockPolicies(workspaceId: string, agents: Agent[], channels: Channel[]): BudgetPolicy[] {
  const now = new Date().toISOString();
  const mocks: BudgetPolicy[] = [
    {
      id: 'bp-ws-1',
      scope: 'workspace',
      scopeId: workspaceId,
      scopeLabel: 'This Workspace',
      limitUSD: 200,
      limitTokens: undefined,
      action: 'hard-stop',
      enabled: true,
      createdAt: now,
      usedUSD: 47.82,
    },
  ];
  if (agents[0]) {
    mocks.push({
      id: 'bp-ag-1',
      scope: 'agent',
      scopeId: agents[0].id,
      scopeLabel: agents[0].name,
      limitTokens: 500_000,
      limitUSD: undefined,
      action: 'notify',
      enabled: true,
      createdAt: now,
      usedTokens: 312_450,
    });
  }
  if (channels[0]) {
    mocks.push({
      id: 'bp-ch-1',
      scope: 'channel',
      scopeId: channels[0].id,
      scopeLabel: channels[0].name,
      limitUSD: 50,
      limitTokens: undefined,
      action: 'pause',
      enabled: false,
      createdAt: now,
      usedUSD: 3.10,
    });
  }
  return mocks;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SCOPE_TABS = ['All', 'Workspace', 'Agents', 'Channels'] as const;
type ScopeTab = typeof SCOPE_TABS[number];

const ACTION_ICONS: Record<BudgetAction, React.ReactNode> = {
  'hard-stop': <ShieldAlert size={13} />,
  'notify':    <BellRing    size={13} />,
  'pause':     <PauseCircle size={13} />,
};

const ACTION_LABELS: Record<BudgetAction, string> = {
  'hard-stop': 'Hard stop',
  'notify':    'Notify',
  'pause':     'Pause',
};

function progressColor(pct: number): string {
  if (pct > 90) return '#dc2626';
  if (pct > 70) return '#d97706';
  return 'var(--color-primary)';
}

function usagePct(policy: BudgetPolicy): number {
  if (policy.limitTokens && policy.usedTokens)
    return Math.min((policy.usedTokens / policy.limitTokens) * 100, 100);
  if (policy.limitUSD && policy.usedUSD)
    return Math.min((policy.usedUSD / policy.limitUSD) * 100, 100);
  return 0;
}

function fmtLimit(policy: BudgetPolicy): string {
  const parts: string[] = [];
  if (policy.limitTokens != null) parts.push(`${(policy.limitTokens / 1000).toFixed(0)}k tk`);
  if (policy.limitUSD    != null) parts.push(`$${policy.limitUSD.toFixed(2)}`);
  return parts.length ? parts.join(' / ') : '—';
}

function fmtUsed(policy: BudgetPolicy): string {
  const parts: string[] = [];
  if (policy.limitTokens != null) parts.push(`${((policy.usedTokens ?? 0) / 1000).toFixed(1)}k tk`);
  if (policy.limitUSD    != null) parts.push(`$${(policy.usedUSD ?? 0).toFixed(2)}`);
  return parts.length ? parts.join(' / ') : '—';
}

// ─── Empty form state ─────────────────────────────────────────────────────────
const EMPTY_FORM = {
  scope: 'workspace' as BudgetScope,
  scopeId: '',
  scopeLabel: '',
  limitTokens: '' as string | number,
  limitUSD: '' as string | number,
  action: 'notify' as BudgetAction,
  enabled: true,
};

// ─── Component ───────────────────────────────────────────────────────────────
export function BudgetSettings({ workspaceId, agents, channels = [] }: Props) {
  const [policies, setPolicies] = useState<BudgetPolicy[]>(() =>
    buildMockPolicies(workspaceId, agents, channels)
  );
  const [activeTab, setActiveTab] = useState<ScopeTab>('All');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  const visiblePolicies = policies.filter((p) => {
    if (activeTab === 'All')       return true;
    if (activeTab === 'Workspace') return p.scope === 'workspace';
    if (activeTab === 'Agents')    return p.scope === 'agent';
    if (activeTab === 'Channels')  return p.scope === 'channel';
    return true;
  });

  // ── Scope target options ───────────────────────────────────────────────────
  function targetOptions(scope: BudgetScope): { id: string; label: string }[] {
    if (scope === 'workspace') return [{ id: workspaceId, label: 'This Workspace' }];
    if (scope === 'agent')     return agents.map((a) => ({ id: a.id, label: a.name }));
    if (scope === 'channel')   return channels.map((c) => ({ id: c.id, label: c.name }));
    return [];
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, scopeId: workspaceId, scopeLabel: 'This Workspace' });
    setShowForm(true);
  }

  function openEdit(policy: BudgetPolicy) {
    setEditId(policy.id);
    setForm({
      scope: policy.scope,
      scopeId: policy.scopeId,
      scopeLabel: policy.scopeLabel ?? '',
      limitTokens: policy.limitTokens ?? '',
      limitUSD: policy.limitUSD ?? '',
      action: policy.action,
      enabled: policy.enabled,
    });
    setShowForm(true);
  }

  function handleSave() {
    const base: BudgetPolicy = {
      id: editId ?? `bp-${Date.now()}`,
      scope: form.scope,
      scopeId: form.scopeId,
      scopeLabel: form.scopeLabel || undefined,
      limitTokens: form.limitTokens !== '' ? Number(form.limitTokens) : undefined,
      limitUSD: form.limitUSD !== '' ? Number(form.limitUSD) : undefined,
      action: form.action,
      enabled: form.enabled,
      createdAt: new Date().toISOString(),
    };
    if (editId) {
      setPolicies((prev) => prev.map((p) => (p.id === editId ? base : p)));
    } else {
      setPolicies((prev) => [...prev, base]);
    }
    setShowForm(false);
    setEditId(null);
  }

  function handleToggle(id: string) {
    setPolicies((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  }

  function handleDelete(id: string) {
    setPolicies((prev) => prev.filter((p) => p.id !== id));
    setDeletingId(null);
  }

  function handleScopeChange(scope: BudgetScope) {
    const opts = targetOptions(scope);
    setForm((f) => ({
      ...f,
      scope,
      scopeId: opts[0]?.id ?? '',
      scopeLabel: opts[0]?.label ?? '',
    }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Budget Policies</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Spending limits per workspace, agent or channel with enforcement actions.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          <Plus size={13} /> Add Policy
        </button>
      </div>

      {/* Scope tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border-primary)' }}>
        {SCOPE_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-3 py-1.5 text-xs font-medium relative transition-colors"
            style={{ color: activeTab === tab ? 'var(--color-primary)' : 'var(--text-muted)' }}
          >
            {tab}
            {activeTab === tab && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: 'var(--color-primary)' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Inline form (create/edit) */}
      {showForm && (
        <div
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              {editId ? 'Edit Policy' : 'New Policy'}
            </span>
            <button onClick={() => setShowForm(false)} style={{ color: 'var(--text-muted)' }}>
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Scope */}
            <div>
              <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Scope</label>
              <select
                value={form.scope}
                onChange={(e) => handleScopeChange(e.target.value as BudgetScope)}
                className="w-full rounded border px-2 py-1.5 text-xs"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                <option value="workspace">Workspace</option>
                <option value="agent">Agent</option>
                <option value="channel">Channel</option>
              </select>
            </div>

            {/* Target */}
            <div>
              <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Target</label>
              <select
                value={form.scopeId}
                onChange={(e) => {
                  const opts = targetOptions(form.scope);
                  const lbl = opts.find((o) => o.id === e.target.value)?.label ?? '';
                  setForm((f) => ({ ...f, scopeId: e.target.value, scopeLabel: lbl }));
                }}
                className="w-full rounded border px-2 py-1.5 text-xs"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                {targetOptions(form.scope).map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
                {targetOptions(form.scope).length === 0 && (
                  <option value="">No targets available</option>
                )}
              </select>
            </div>

            {/* Limit tokens */}
            <div>
              <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Token limit (optional)</label>
              <input
                type="number"
                value={form.limitTokens}
                onChange={(e) => setForm((f) => ({ ...f, limitTokens: e.target.value }))}
                placeholder="e.g. 500000"
                className="w-full rounded border px-2 py-1.5 text-xs"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Limit USD */}
            <div>
              <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>USD limit (optional)</label>
              <input
                type="number"
                step="0.01"
                value={form.limitUSD}
                onChange={(e) => setForm((f) => ({ ...f, limitUSD: e.target.value }))}
                placeholder="e.g. 50.00"
                className="w-full rounded border px-2 py-1.5 text-xs"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Action */}
            <div>
              <label className="block text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Enforcement action</label>
              <select
                value={form.action}
                onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as BudgetAction }))}
                className="w-full rounded border px-2 py-1.5 text-xs"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                <option value="notify">Notify</option>
                <option value="pause">Pause</option>
                <option value="hard-stop">Hard stop</option>
              </select>
            </div>

            {/* Enabled */}
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Enabled</span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                  className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  style={{ background: form.enabled ? 'var(--color-primary)' : 'var(--bg-tertiary)' }}
                >
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                    style={{ transform: form.enabled ? 'translateX(18px)' : 'translateX(2px)' }}
                  />
                </button>
              </label>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              className="flex items-center gap-1 rounded px-3 py-1.5 text-xs font-medium text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              <Check size={12} /> {editId ? 'Save changes' : 'Create policy'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded px-3 py-1.5 text-xs font-medium"
              style={{ color: 'var(--text-muted)', background: 'var(--bg-tertiary)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Policy table */}
      {visiblePolicies.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            No budget policies for this scope. Click <strong>Add Policy</strong> to create one.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-primary)' }}>
          {/* Table header */}
          <div
            className="grid text-[10px] font-semibold uppercase tracking-wide px-4 py-2"
            style={{
              gridTemplateColumns: '1fr 1fr 1fr 1fr 80px 72px',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border-primary)',
            }}
          >
            <span>Scope</span>
            <span>Target</span>
            <span>Limit</span>
            <span>Action</span>
            <span>Enabled</span>
            <span></span>
          </div>

          {/* Rows */}
          {visiblePolicies.map((policy, idx) => {
            const pct = usagePct(policy);
            return (
              <div
                key={policy.id}
                className="grid items-center px-4 py-3"
                style={{
                  gridTemplateColumns: '1fr 1fr 1fr 1fr 80px 72px',
                  background: idx % 2 === 0 ? 'var(--card-bg)' : 'var(--bg-primary)',
                  borderBottom: idx < visiblePolicies.length - 1 ? '1px solid var(--border-primary)' : undefined,
                }}
              >
                {/* Scope badge */}
                <span>
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
                    style={{
                      background: policy.scope === 'workspace'
                        ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)'
                        : policy.scope === 'agent'
                        ? 'color-mix(in srgb, #7c3aed 15%, transparent)'
                        : 'color-mix(in srgb, #0891b2 15%, transparent)',
                      color: policy.scope === 'workspace'
                        ? 'var(--color-primary)'
                        : policy.scope === 'agent'
                        ? '#7c3aed'
                        : '#0891b2',
                    }}
                  >
                    {policy.scope}
                  </span>
                </span>

                {/* Target */}
                <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {policy.scopeLabel ?? policy.scopeId}
                </span>

                {/* Limit + progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>{fmtLimit(policy)}</span>
                    {pct > 0 && (
                      <span className="text-[10px] font-mono" style={{ color: pct > 90 ? '#dc2626' : 'var(--text-muted)' }}>
                        {fmtUsed(policy)} used
                      </span>
                    )}
                  </div>
                  {pct > 0 && (
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)', width: '90%' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: progressColor(pct) }}
                      />
                    </div>
                  )}
                </div>

                {/* Action */}
                <div
                  className="flex items-center gap-1.5 text-xs"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {ACTION_ICONS[policy.action]}
                  {ACTION_LABELS[policy.action]}
                </div>

                {/* Toggle */}
                <div>
                  <button
                    type="button"
                    onClick={() => handleToggle(policy.id)}
                    className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                    style={{ background: policy.enabled ? 'var(--color-primary)' : 'var(--bg-tertiary)' }}
                    aria-label={policy.enabled ? 'Disable policy' : 'Enable policy'}
                  >
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                      style={{ transform: policy.enabled ? 'translateX(18px)' : 'translateX(2px)' }}
                    />
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 justify-end">
                  <button
                    onClick={() => openEdit(policy)}
                    className="p-1.5 rounded transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label="Edit policy"
                  >
                    <Pencil size={13} />
                  </button>
                  {deletingId === policy.id ? (
                    <>
                      <button
                        onClick={() => handleDelete(policy.id)}
                        className="p-1.5 rounded text-red-500"
                        aria-label="Confirm delete"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="p-1.5 rounded"
                        style={{ color: 'var(--text-muted)' }}
                        aria-label="Cancel delete"
                      >
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDeletingId(policy.id)}
                      className="p-1.5 rounded transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      aria-label="Delete policy"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
