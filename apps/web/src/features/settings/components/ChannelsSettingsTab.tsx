import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Radio, Trash2, RefreshCw, CheckCircle, XCircle, Loader2, Link2, WifiOff } from 'lucide-react';
import { useForm } from 'react-hook-form';

import type { ChannelKind, ChannelRecord } from '../../../lib/types';
import {
  listChannels, provisionChannel, bindChannel,
  deleteChannel, subscribeChannelStatus,
} from '../../../lib/channels-api';

// FIX-1: 7 entries — added 'teams' and 'webhook' to match ChannelKind enum
const CHANNEL_KINDS: { kind: ChannelKind; label: string; needsToken: boolean }[] = [
  { kind: 'telegram',  label: 'Telegram',        needsToken: true  },
  { kind: 'whatsapp',  label: 'WhatsApp',         needsToken: true  },
  { kind: 'discord',   label: 'Discord',          needsToken: true  },
  { kind: 'webchat',   label: 'Web Chat',         needsToken: false },
  { kind: 'slack',     label: 'Slack',            needsToken: true  },
  { kind: 'teams',     label: 'Microsoft Teams',  needsToken: true  },
  { kind: 'webhook',   label: 'Webhook',          needsToken: false },
];

// AUDIT-25: STATUS_ICON alineado con enum ChannelStatus del schema Prisma
//   ANTES:  idle | provisioning | active | error   (valores obsoletos)
//   AHORA:  provisioned | bound | offline | error   (valores reales de DB)
const STATUS_ICON: Record<ChannelRecord['status'], JSX.Element> = {
  provisioned: <Radio size={14} className="text-[var(--text-muted)]" />,
  bound:       <CheckCircle size={14} className="text-green-500" />,
  offline:     <WifiOff size={14} className="text-yellow-500" />,
  error:       <XCircle size={14} className="text-red-500" />,
};

// Labels legibles para la UI — evita mostrar valores internos del enum al usuario
const STATUS_LABEL: Record<ChannelRecord['status'], string> = {
  provisioned: 'Provisioned',
  bound:       'Active',
  offline:     'Offline',
  error:       'Error',
};

// FIX-2: valid statuses set — guard against unexpected SSE values
// Placed here alongside STATUS_LABEL so all status-related constants are grouped.
const VALID_STATUSES = new Set<string>(['provisioned', 'bound', 'error', 'offline']);

interface Props {
  workspaceId: string;
  agents: { id: string; name: string }[];
}

// FIX-3: AddForm extended with appId + appSecret for Slack / Teams
interface AddForm {
  kind:      ChannelKind;
  name:      string;
  token:     string;   // Telegram, WhatsApp, Discord
  appId:     string;   // Slack, Teams
  appSecret: string;   // Slack, Teams
}

export function ChannelsSettingsTab({ workspaceId, agents }: Props) {
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState<string | null>(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [busy, setBusy]         = useState<string | null>(null); // channelId being acted on
  const sseCleanups             = useRef<Map<string, () => void>>(new Map());

  const { register, handleSubmit, watch, reset, formState: { errors } } =
    useForm<AddForm>({
      defaultValues: { kind: 'telegram', name: '', token: '', appId: '', appSecret: '' },
    });
  const selectedKind       = watch('kind');
  const needsToken         = CHANNEL_KINDS.find((c) => c.kind === selectedKind)?.needsToken ?? false;
  // FIX-3: helper — Slack and Teams need appId + appSecret instead of a plain bot token
  const needsAppCredentials = selectedKind === 'slack' || selectedKind === 'teams';

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await listChannels(workspaceId);
      setChannels(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load channels');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  // SSE subscriptions for active channels
  useEffect(() => {
    const map = sseCleanups.current;
    channels.forEach((ch) => {
      if (!map.has(ch.id)) {
        const unsub = subscribeChannelStatus(workspaceId, ch.id, (data) => {
          // FIX-2: guard — discard unexpected status values before casting
          if (!VALID_STATUSES.has(data.status)) return;
          setChannels((prev) =>
            prev.map((c) =>
              c.id === ch.id ? { ...c, status: data.status as ChannelRecord['status'] } : c,
            ),
          );
        });
        map.set(ch.id, unsub);
      }
    });
    // Clean up stale subscriptions
    map.forEach((unsub, id) => {
      if (!channels.find((c) => c.id === id)) { unsub(); map.delete(id); }
    });
    return () => { map.forEach((u) => u()); map.clear(); };
  }, [channels, workspaceId]);

  async function handleAdd(values: AddForm) {
    setBusy('new'); setErr(null);
    try {
      // FIX-3: route credentials correctly based on kind
      await provisionChannel(workspaceId, {
        kind:      values.kind,
        name:      values.name,
        token:     needsAppCredentials ? undefined              : (values.token     || undefined),
        appId:     needsAppCredentials ? (values.appId     || undefined) : undefined,
        appSecret: needsAppCredentials ? (values.appSecret || undefined) : undefined,
      });
      reset();
      setShowAdd(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to provision channel');
    } finally {
      setBusy(null);
    }
  }

  async function handleBind(channelId: string, agentId: string) {
    setBusy(channelId); setErr(null);
    try {
      await bindChannel(workspaceId, channelId, agentId);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Bind failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(channelId: string) {
    if (!confirm('Delete this channel?')) return;
    setBusy(channelId); setErr(null);
    try {
      await deleteChannel(workspaceId, channelId);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Channels</h3>
          {/* FIX-1: header text updated to include Teams and Webhook */}
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Connect Telegram, WhatsApp, Discord, Slack, Web Chat, Teams, or Webhook. Tokens are encrypted at rest.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all"
          style={{ background: 'var(--color-primary)' }}
        >
          <Plus size={13} /> Add Channel
        </button>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      {/* Add form */}
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

          {/* FIX-3: simple bot token for telegram/whatsapp/discord */}
          {needsToken && !needsAppCredentials && (
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Bot Token</label>
              <input
                {...register('token', { required: 'Token required' })}
                type="password"
                autoComplete="off"
                placeholder="Paste bot token…"
                className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:outline-none"
              />
              {errors.token && <p className="text-xs text-red-500 mt-0.5">{errors.token.message}</p>}
            </div>
          )}

          {/* FIX-3: appId + appSecret grid for slack/teams */}
          {needsAppCredentials && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">App ID</label>
                <input
                  {...register('appId', { required: 'App ID required' })}
                  placeholder="App ID…"
                  className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:outline-none"
                />
                {errors.appId && <p className="text-xs text-red-500 mt-0.5">{errors.appId.message}</p>}
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">App Secret</label>
                <input
                  {...register('appSecret', { required: 'App Secret required' })}
                  type="password"
                  autoComplete="off"
                  placeholder="App Secret…"
                  className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:outline-none"
                />
                {errors.appSecret && <p className="text-xs text-red-500 mt-0.5">{errors.appSecret.message}</p>}
              </div>
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

      {/* Channel list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : channels.length === 0 ? (
        <div className="py-10 text-center">
          <Radio size={32} className="mx-auto mb-3 text-[var(--text-faint)]" />
          <p className="text-sm text-[var(--text-muted)]">No channels configured yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className="flex items-center gap-3 rounded-xl border p-3 transition-all"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}
            >
              <div className="flex-shrink-0">{STATUS_ICON[ch.status]}</div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {ch.name}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {ch.kind} · {STATUS_LABEL[ch.status]}
                </div>
              </div>

              {/* Bind to agent */}
              {agents.length > 0 && (
                <select
                  value={ch.agentId ?? ''}
                  onChange={(e) => { if (e.target.value) void handleBind(ch.id, e.target.value); }}
                  disabled={!!busy}
                  className="text-xs rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-1.5 text-[var(--input-text)] focus:outline-none"
                  title="Bind agent"
                >
                  <option value="">— agent —</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}

              {/* Test connection */}
              <button
                title="Refresh status"
                onClick={() => void load()}
                disabled={!!busy}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
              >
                <RefreshCw size={13} style={{ color: 'var(--text-muted)' }} />
              </button>

              {/* Bind indicator */}
              {ch.agentId && (
                <Link2 size={13} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              )}

              {/* Delete */}
              <button
                title="Delete channel"
                onClick={() => void handleDelete(ch.id)}
                disabled={busy === ch.id}
                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {busy === ch.id
                  ? <Loader2 size={13} className="animate-spin text-red-500" />
                  : <Trash2 size={13} className="text-red-400" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
