import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Radio, Trash2, RefreshCw, CheckCircle, XCircle,
  Loader2, Link2, WifiOff, Edit2, X, ChevronDown, ChevronRight,
  Users, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { useForm } from 'react-hook-form';

import type { ChannelKind, ChannelRecord, ChannelBinding } from '../../../lib/types';
import {
  listChannels, provisionChannel, updateChannel, bindChannel,
  deleteChannel, subscribeChannelStatus,
  listBindings, createBinding, updateBinding, deleteBinding,
} from '../../../lib/channels-api';

// 7 channel kinds — matches ChannelKind enum in Prisma schema
const CHANNEL_KINDS: { kind: ChannelKind; label: string; needsToken: boolean }[] = [
  { kind: 'telegram',  label: 'Telegram',        needsToken: true  },
  { kind: 'whatsapp',  label: 'WhatsApp',         needsToken: true  },
  { kind: 'discord',   label: 'Discord',          needsToken: true  },
  { kind: 'webchat',   label: 'Web Chat',         needsToken: false },
  { kind: 'slack',     label: 'Slack',            needsToken: true  },
  { kind: 'teams',     label: 'Microsoft Teams',  needsToken: true  },
  { kind: 'webhook',   label: 'Webhook',          needsToken: false },
];

const BINDING_MODES: { value: ChannelBinding['mode']; label: string; desc: string }[] = [
  { value: 'primary',   label: 'Primary',   desc: 'Handles all messages by default' },
  { value: 'fallback',  label: 'Fallback',  desc: 'Used when primary is unavailable' },
  { value: 'broadcast', label: 'Broadcast', desc: 'Receives a copy of every message' },
];

const STATUS_ICON: Record<ChannelRecord['status'], JSX.Element> = {
  provisioned: <Radio size={14} className="text-[var(--text-muted)]" />,
  bound:       <CheckCircle size={14} className="text-green-500" />,
  offline:     <WifiOff size={14} className="text-yellow-500" />,
  error:       <XCircle size={14} className="text-red-500" />,
};

const STATUS_LABEL: Record<ChannelRecord['status'], string> = {
  provisioned: 'Provisioned',
  bound:       'Active',
  offline:     'Offline',
  error:       'Error',
};

const VALID_STATUSES = new Set<ChannelRecord['status']>(['provisioned', 'bound', 'error', 'offline']);
function isValidStatus(s: string): s is ChannelRecord['status'] {
  return VALID_STATUSES.has(s as ChannelRecord['status']);
}

interface Props {
  workspaceId: string;
  agents: { id: string; name: string }[];
}

interface AddForm {
  kind:        ChannelKind;
  name:        string;
  token:       string;
  appId:       string;
  appSecret:   string;
  appPassword: string;
}

interface EditForm {
  name: string;
}

interface BindingForm {
  agentId: string;
  mode: ChannelBinding['mode'];
}

// ─── Sub-component: BindingRow ────────────────────────────────────────────────
interface BindingRowProps {
  binding: ChannelBinding;
  agents: { id: string; name: string }[];
  busy: boolean;
  onToggle: (b: ChannelBinding) => void;
  onModeChange: (b: ChannelBinding, mode: ChannelBinding['mode']) => void;
  onDelete: (b: ChannelBinding) => void;
}

function BindingRow({ binding, agents, busy, onToggle, onModeChange, onDelete }: BindingRowProps) {
  const agentName = binding.agentName ?? agents.find((a) => a.id === binding.agentId)?.name ?? binding.agentId;
  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-3 py-2 text-xs"
      style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
    >
      {/* toggle enabled */}
      <button
        title={binding.enabled ? 'Disable binding' : 'Enable binding'}
        onClick={() => onToggle(binding)}
        disabled={busy}
        className="flex-shrink-0 disabled:opacity-50"
      >
        {binding.enabled
          ? <ToggleRight size={18} className="text-green-500" />
          : <ToggleLeft  size={18} style={{ color: 'var(--text-faint)' }} />}
      </button>

      {/* agent name */}
      <span className="flex-1 font-medium truncate" style={{ color: 'var(--text-primary)' }}>
        {agentName}
      </span>

      {/* mode selector */}
      <select
        value={binding.mode}
        onChange={(e) => onModeChange(binding, e.target.value as ChannelBinding['mode'])}
        disabled={busy}
        className="rounded border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--input-text)] focus:outline-none disabled:opacity-50"
        title="Binding mode"
      >
        {BINDING_MODES.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>

      {/* delete */}
      <button
        title="Remove binding"
        onClick={() => onDelete(binding)}
        disabled={busy}
        className="p-1 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
      >
        {busy
          ? <Loader2 size={12} className="animate-spin text-red-400" />
          : <Trash2 size={12} className="text-red-400" />}
      </button>
    </div>
  );
}

// ─── Sub-component: ChannelRow ────────────────────────────────────────────────
interface ChannelRowProps {
  ch: ChannelRecord;
  agents: { id: string; name: string }[];
  busy: string | null;
  workspaceId: string;
  onRefresh: () => void;
  onEdit: (ch: ChannelRecord) => void;
  onDelete: (ch: ChannelRecord) => void;
}

function ChannelRow({ ch, agents, busy, workspaceId, onRefresh, onEdit, onDelete }: ChannelRowProps) {
  const [expanded, setExpanded]     = useState(false);
  const [bindings, setBindings]     = useState<ChannelBinding[]>([]);
  const [loadingB, setLoadingB]     = useState(false);
  const [busyB, setBusyB]           = useState<string | null>(null);
  const [showBind, setShowBind]     = useState(false);
  const [bindErr, setBindErr]       = useState<string | null>(null);

  const { register, handleSubmit, reset: resetBind, formState: { errors: bindErrors } } =
    useForm<BindingForm>({ defaultValues: { agentId: '', mode: 'primary' } });

  const loadBindings = useCallback(async () => {
    setLoadingB(true); setBindErr(null);
    try {
      const data = await listBindings(workspaceId, ch.id);
      setBindings(data);
    } catch (e) {
      setBindErr(e instanceof Error ? e.message : 'Failed to load bindings');
    } finally {
      setLoadingB(false);
    }
  }, [workspaceId, ch.id]);

  useEffect(() => {
    if (expanded) void loadBindings();
  }, [expanded, loadBindings]);

  async function handleCreateBinding(values: BindingForm) {
    if (!values.agentId) return;
    setBusyB('new'); setBindErr(null);
    try {
      await createBinding(workspaceId, ch.id, { agentId: values.agentId, mode: values.mode, enabled: true });
      resetBind();
      setShowBind(false);
      await loadBindings();
      onRefresh();
    } catch (e) {
      setBindErr(e instanceof Error ? e.message : 'Failed to create binding');
    } finally {
      setBusyB(null);
    }
  }

  async function handleToggleBinding(b: ChannelBinding) {
    setBusyB(b.id); setBindErr(null);
    try {
      const updated = await updateBinding(workspaceId, ch.id, b.id, { enabled: !b.enabled });
      setBindings((prev) => prev.map((x) => x.id === b.id ? updated : x));
    } catch (e) {
      setBindErr(e instanceof Error ? e.message : 'Failed to update binding');
    } finally {
      setBusyB(null);
    }
  }

  async function handleModeChange(b: ChannelBinding, mode: ChannelBinding['mode']) {
    setBusyB(b.id); setBindErr(null);
    try {
      const updated = await updateBinding(workspaceId, ch.id, b.id, { mode });
      setBindings((prev) => prev.map((x) => x.id === b.id ? updated : x));
    } catch (e) {
      setBindErr(e instanceof Error ? e.message : 'Failed to update mode');
    } finally {
      setBusyB(null);
    }
  }

  async function handleDeleteBinding(b: ChannelBinding) {
    if (!confirm(`Remove binding with agent "${b.agentName ?? b.agentId}"?`)) return;
    setBusyB(b.id); setBindErr(null);
    try {
      await deleteBinding(workspaceId, ch.id, b.id);
      setBindings((prev) => prev.filter((x) => x.id !== b.id));
      onRefresh();
    } catch (e) {
      setBindErr(e instanceof Error ? e.message : 'Failed to delete binding');
    } finally {
      setBusyB(null);
    }
  }

  const isBusy = busy === ch.id;

  return (
    <div
      className="rounded-xl border overflow-hidden transition-all"
      style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}
    >
      {/* ── Channel header row ── */}
      <div className="flex items-center gap-3 p-3">
        <div className="flex-shrink-0">{STATUS_ICON[ch.status]}</div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {ch.name}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {ch.kind} · {STATUS_LABEL[ch.status]}
          </div>
        </div>

        {/* binding count badge */}
        {ch.agentId && (
          <span
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: 'color-mix(in oklab, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)' }}
          >
            <Link2 size={10} /> Bound
          </span>
        )}

        {/* refresh */}
        <button
          title="Refresh status"
          onClick={onRefresh}
          disabled={!!busy}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} style={{ color: 'var(--text-muted)' }} />
        </button>

        {/* edit */}
        <button
          title="Edit channel"
          onClick={() => onEdit(ch)}
          disabled={isBusy}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
        >
          <Edit2 size={13} style={{ color: 'var(--text-muted)' }} />
        </button>

        {/* delete */}
        <button
          title="Delete channel"
          onClick={() => onDelete(ch)}
          disabled={isBusy}
          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {isBusy
            ? <Loader2 size={13} className="animate-spin text-red-500" />
            : <Trash2 size={13} className="text-red-400" />}
        </button>

        {/* expand bindings */}
        <button
          title={expanded ? 'Collapse bindings' : 'Manage bindings'}
          onClick={() => setExpanded((v) => !v)}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          {expanded
            ? <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
            : <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />}
        </button>
      </div>

      {/* ── Bindings panel (expanded) ── */}
      {expanded && (
        <div
          className="border-t px-4 py-3 space-y-3"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              <Users size={11} className="inline mr-1" />Agent Bindings
            </p>
            {agents.length > 0 && (
              <button
                onClick={() => setShowBind((v) => !v)}
                className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-colors"
                style={{ color: 'var(--color-primary)' }}
              >
                {showBind ? <X size={11} /> : <Plus size={11} />}
                {showBind ? 'Cancel' : 'Add Binding'}
              </button>
            )}
          </div>

          {bindErr && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{bindErr}</p>
          )}

          {/* New binding form */}
          {showBind && (
            <form
              onSubmit={handleSubmit(handleCreateBinding)}
              className="rounded-lg border p-3 space-y-2"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Agent</label>
                  <select
                    {...register('agentId', { required: 'Agent required' })}
                    className="w-full rounded border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 text-xs text-[var(--input-text)] focus:outline-none"
                  >
                    <option value="">— select agent —</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  {bindErrors.agentId && <p className="text-xs text-red-500 mt-0.5">{bindErrors.agentId.message}</p>}
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Mode</label>
                  <select
                    {...register('mode')}
                    className="w-full rounded border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 text-xs text-[var(--input-text)] focus:outline-none"
                  >
                    {BINDING_MODES.map((m) => (
                      <option key={m.value} value={m.value} title={m.desc}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busyB === 'new'}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--color-primary)' }}
                >
                  {busyB === 'new' ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
                  Bind
                </button>
              </div>
            </form>
          )}

          {/* Binding list */}
          {loadingB ? (
            <div className="flex justify-center py-3">
              <Loader2 size={16} className="animate-spin text-[var(--color-primary)]" />
            </div>
          ) : bindings.length === 0 ? (
            <div className="py-4 text-center">
              <Users size={20} className="mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                No agent bindings yet.
                {agents.length === 0 ? ' Create agents first to bind them.' : ' Use "Add Binding" to connect an agent.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {bindings.map((b) => (
                <BindingRow
                  key={b.id}
                  binding={b}
                  agents={agents}
                  busy={busyB === b.id}
                  onToggle={handleToggleBinding}
                  onModeChange={handleModeChange}
                  onDelete={handleDeleteBinding}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main: ChannelsSettingsTab ────────────────────────────────────────────────
export function ChannelsSettingsTab({ workspaceId, agents }: Props) {
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState<string | null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [editTarget, setEditTarget] = useState<ChannelRecord | null>(null);
  const [busy, setBusy]         = useState<string | null>(null);
  const sseCleanups             = useRef<Map<string, () => void>>(new Map());

  // ── Add form ──
  const {
    register, handleSubmit, watch, reset,
    formState: { errors },
  } = useForm<AddForm>({
    defaultValues: { kind: 'telegram', name: '', token: '', appId: '', appSecret: '', appPassword: '' },
    shouldUnregister: true,
  });
  const selectedKind        = watch('kind');
  const needsToken          = CHANNEL_KINDS.find((c) => c.kind === selectedKind)?.needsToken ?? false;
  const needsAppCredentials = selectedKind === 'slack' || selectedKind === 'teams';
  const isTeams             = selectedKind === 'teams';

  // ── Edit form ──
  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    formState: { errors: editErrors },
  } = useForm<EditForm>({ defaultValues: { name: '' } });

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await listChannels(workspaceId);
      setChannels(
        data.map((ch) => ({
          ...ch,
          status: isValidStatus(ch.status) ? ch.status : 'offline',
        }))
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load channels');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  // Stable channelIds to avoid re-subscribing SSE on non-id updates
  const channelIds = useMemo(
    () => channels.map((c) => c.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channels.map((c) => c.id).join(',')],
  );

  // SSE subscriptions keyed by channel id
  useEffect(() => {
    const map = sseCleanups.current;
    channelIds.forEach((id) => {
      if (!map.has(id)) {
        const unsub = subscribeChannelStatus(workspaceId, id, (data) => {
          if (!isValidStatus(data.status)) return;
          setChannels((prev) =>
            prev.map((c) => c.id === id ? { ...c, status: data.status } : c)
          );
        });
        map.set(id, unsub);
      }
    });
    map.forEach((unsub, id) => {
      if (!channelIds.includes(id)) { unsub(); map.delete(id); }
    });
    return () => { map.forEach((u) => u()); map.clear(); };
  }, [channelIds, workspaceId]);

  // ── Add channel ──
  async function handleAdd(values: AddForm) {
    setBusy('new'); setErr(null);
    try {
      const kind = values.kind;
      if (kind === 'slack') {
        await provisionChannel(workspaceId, { kind, name: values.name, appId: values.appId, appSecret: values.appSecret });
      } else if (kind === 'teams') {
        await provisionChannel(workspaceId, { kind, name: values.name, appId: values.appId, appPassword: values.appPassword });
      } else if (kind === 'telegram' || kind === 'whatsapp' || kind === 'discord') {
        await provisionChannel(workspaceId, { kind, name: values.name, token: values.token });
      } else {
        await provisionChannel(workspaceId, { kind, name: values.name });
      }
      reset();
      setShowAdd(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to provision channel');
    } finally {
      setBusy(null);
    }
  }

  // ── Edit channel ──
  function openEdit(ch: ChannelRecord) {
    setEditTarget(ch);
    resetEdit({ name: ch.name });
  }

  async function handleEdit(values: EditForm) {
    if (!editTarget) return;
    setBusy(editTarget.id); setErr(null);
    try {
      await updateChannel(workspaceId, editTarget.id, { name: values.name });
      setEditTarget(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update channel');
    } finally {
      setBusy(null);
    }
  }

  // ── Delete channel ──
  async function handleDelete(ch: ChannelRecord) {
    if (!confirm(`Delete channel "${ch.name}"? This also removes all bindings.`)) return;
    setBusy(ch.id); setErr(null);
    try {
      await deleteChannel(workspaceId, ch.id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(null);
    }
  }

  // ── Early-exit: no workspace ──
  if (!workspaceId) {
    return (
      <div className="py-10 text-center">
        <Radio size={32} className="mx-auto mb-3" style={{ color: 'var(--text-faint)' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No workspace selected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Channels</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Connect Telegram, WhatsApp, Discord, Slack, Web Chat, Teams, or Webhook.
            Tokens are encrypted at rest. Expand a channel to manage its agent bindings.
          </p>
        </div>
        <button
          onClick={() => { setShowAdd((v) => !v); setEditTarget(null); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all"
          style={{ background: 'var(--color-primary)' }}
        >
          {showAdd ? <X size={13} /> : <Plus size={13} />}
          {showAdd ? 'Cancel' : 'Add Channel'}
        </button>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      {/* ── Edit Channel modal ── */}
      {editTarget && (
        <form
          onSubmit={handleSubmitEdit(handleEdit)}
          className="rounded-xl border p-4 space-y-3"
          style={{ borderColor: 'var(--color-primary)', background: 'var(--card-bg)' }}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>
              Edit: {editTarget.name}
            </p>
            <button type="button" onClick={() => setEditTarget(null)} className="p-1">
              <X size={14} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Display name</label>
            <input
              {...registerEdit('name', { required: 'Name required' })}
              className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:outline-none"
            />
            {editErrors.name && <p className="text-xs text-red-500 mt-0.5">{editErrors.name.message}</p>}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy === editTarget.id}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--color-primary)' }}
            >
              {busy === editTarget.id ? <Loader2 size={12} className="animate-spin" /> : <Edit2 size={12} />}
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              className="px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ border: '1px solid var(--border-primary)', color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Add Channel form ── */}
      {showAdd && (
        <form
          onSubmit={handleSubmit(handleAdd)}
          className="rounded-xl border p-4 space-y-3"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}
        >
          <p className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">New Channel</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Type</label>
              <select
                {...register('kind', { required: true })}
                className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:outline-none"
              >
                {CHANNEL_KINDS.map((c) => (
                  <option key={c.kind} value={c.kind}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Display name</label>
              <input
                {...register('name', { required: 'Required' })}
                placeholder="My Telegram bot"
                className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:outline-none"
              />
              {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name.message}</p>}
            </div>
          </div>

          {needsToken && !needsAppCredentials && (
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Bot Token</label>
              <input
                {...register('token', { required: 'Token required' })}
                type="password" autoComplete="off" placeholder="Paste bot token…"
                className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:outline-none"
              />
              {errors.token && <p className="text-xs text-red-500 mt-0.5">{errors.token.message}</p>}
            </div>
          )}

          {needsAppCredentials && (
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">App ID</label>
              <input
                {...register('appId', { required: 'App ID required' })}
                placeholder="App ID…"
                className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:outline-none"
              />
              {errors.appId && <p className="text-xs text-red-500 mt-0.5">{errors.appId.message}</p>}
            </div>
          )}

          {needsAppCredentials && !isTeams && (
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">App Secret</label>
              <input
                {...register('appSecret', { required: 'App Secret required' })}
                type="password" autoComplete="off" placeholder="App Secret…"
                className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:outline-none"
              />
              {errors.appSecret && <p className="text-xs text-red-500 mt-0.5">{errors.appSecret.message}</p>}
            </div>
          )}

          {isTeams && (
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">App Password</label>
              <input
                {...register('appPassword', { required: 'App Password required' })}
                type="password" autoComplete="off" placeholder="App Password…"
                className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:outline-none"
              />
              {errors.appPassword && <p className="text-xs text-red-500 mt-0.5">{errors.appPassword.message}</p>}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit" disabled={busy === 'new'}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--color-primary)' }}
            >
              {busy === 'new' ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Provision
            </button>
            <button
              type="button" onClick={() => { setShowAdd(false); reset(); }}
              className="px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ border: '1px solid var(--border-primary)', color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Channel list ── */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : channels.length === 0 ? (
        <div className="py-10 text-center">
          <Radio size={32} className="mx-auto mb-3" style={{ color: 'var(--text-faint)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No channels configured yet.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Add a channel above to start receiving messages from Telegram, WhatsApp, and more.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map((ch) => (
            <ChannelRow
              key={ch.id}
              ch={ch}
              agents={agents}
              busy={busy}
              workspaceId={workspaceId}
              onRefresh={load}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
