import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, Star, Zap, CheckCircle2, XCircle, HelpCircle, Edit2, Check, X, RefreshCw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface N8nConnection {
  id: string;
  workspaceId: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
  isDefault: boolean;
  status?: 'unknown' | 'ok' | 'error' | 'testing';
  lastCheckedAt?: string;
  createdAt: string;
}

interface CreatePayload {
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  isDefault: boolean;
}

// ─── API helpers (prepared for real backend; mock fallback while F4a-02 lands) ─
const BASE = '/api/n8n-connections';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function listConnections(workspaceId: string) {
  return apiFetch<N8nConnection[]>(`${BASE}?workspaceId=${workspaceId}`);
}
function createConnection(workspaceId: string, payload: CreatePayload) {
  return apiFetch<N8nConnection>(BASE, { method: 'POST', body: JSON.stringify({ workspaceId, ...payload }) });
}
function updateConnection(id: string, patch: Partial<CreatePayload>) {
  return apiFetch<N8nConnection>(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}
function deleteConnection(id: string) {
  return apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' });
}
function testConnection(id: string) {
  return apiFetch<{ status: 'ok' | 'error'; message?: string }>(`${BASE}/${id}/test`, { method: 'POST' });
}

// ─── Mock local state (used when real backend is unavailable) ────────────────
let mockStore: N8nConnection[] = [];
let mockIdSeq = 1;

function useMockFallback(workspaceId: string) {
  const load   = useCallback(async () => mockStore.filter((c) => c.workspaceId === workspaceId), [workspaceId]);
  const create = useCallback(async (p: CreatePayload): Promise<N8nConnection> => {
    if (p.isDefault) mockStore = mockStore.map((c) => ({ ...c, isDefault: false }));
    const rec: N8nConnection = {
      id: `mock-${mockIdSeq++}`, workspaceId,
      name: p.name, baseUrl: p.baseUrl, apiKey: p.apiKey,
      enabled: p.enabled, isDefault: p.isDefault,
      status: 'unknown', createdAt: new Date().toISOString(),
    };
    mockStore = [...mockStore, rec];
    return rec;
  }, [workspaceId]);
  const update = useCallback(async (id: string, patch: Partial<CreatePayload>): Promise<N8nConnection> => {
    if (patch.isDefault) mockStore = mockStore.map((c) => ({ ...c, isDefault: c.id === id ? true : false }));
    mockStore = mockStore.map((c) => c.id === id ? { ...c, ...patch } : c);
    return mockStore.find((c) => c.id === id)!;
  }, []);
  const remove = useCallback(async (id: string) => { mockStore = mockStore.filter((c) => c.id !== id); }, []);
  const test   = useCallback(async (id: string): Promise<{ status: 'ok' | 'error'; message?: string }> => {
    const rec = mockStore.find((c) => c.id === id);
    if (!rec) return { status: 'error', message: 'Not found' };
    const ok = rec.baseUrl.startsWith('http');
    mockStore = mockStore.map((c) => c.id === id ? { ...c, status: ok ? 'ok' : 'error', lastCheckedAt: new Date().toISOString() } : c);
    return ok ? { status: 'ok' } : { status: 'error', message: 'baseUrl must start with http(s)' };
  }, []);
  return { load, create, update, remove, test };
}

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  unknown: { icon: HelpCircle,    color: 'var(--text-faint)',   label: 'Unknown',  bg: 'transparent' },
  testing: { icon: Loader2,       color: 'var(--color-primary)',label: 'Testing…', bg: 'transparent' },
  ok:      { icon: CheckCircle2,  color: '#16a34a',             label: 'OK',       bg: '#f0fdf4' },
  error:   { icon: XCircle,       color: '#dc2626',             label: 'Error',    bg: '#fef2f2' },
} as const;

function StatusBadge({ status }: { status: N8nConnection['status'] }) {
  const s = STATUS_CONFIG[status ?? 'unknown'];
  const Icon = s.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}22` }}
    >
      <Icon size={11} className={status === 'testing' ? 'animate-spin' : ''} />
      {s.label}
    </span>
  );
}

// ─── Add / Edit form ──────────────────────────────────────────────────────────
interface FormState { name: string; baseUrl: string; apiKey: string; enabled: boolean; isDefault: boolean }
const EMPTY_FORM: FormState = { name: '', baseUrl: 'https://', apiKey: '', enabled: true, isDefault: false };

function ConnectionForm({
  initial = EMPTY_FORM,
  onSave,
  onCancel,
  saving,
}: {
  initial?: FormState;
  onSave: (v: FormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [v, setV] = useState<FormState>(initial);
  const f = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((prev) => ({ ...prev, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSave(v); };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>Connection Details</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Name *</label>
          <input required value={v.name} onChange={f('name')} placeholder="Production n8n"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)' }} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Base URL *</label>
          <input required value={v.baseUrl} onChange={f('baseUrl')} placeholder="https://n8n.example.com"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none font-mono"
            style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)' }} />
        </div>
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>API Key</label>
        <input value={v.apiKey} onChange={f('apiKey')} type="password" autoComplete="off" placeholder="n8n_api_…"
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
          style={{ borderColor: 'var(--input-border)', background: 'var(--input-bg)', color: 'var(--input-text)' }} />
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={v.enabled} onChange={f('enabled')} className="accent-[var(--color-primary)]" />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={v.isDefault} onChange={f('isDefault')} className="accent-[var(--color-primary)]" />
          Set as default
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}>
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 rounded-lg text-xs font-semibold"
          style={{ border: '1px solid var(--border-primary)', color: 'var(--text-muted)' }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function ConnectionRow({
  conn, onDelete, onTest, onEdit, onSetDefault, busy,
}: {
  conn: N8nConnection;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  onEdit: (conn: N8nConnection) => void;
  onSetDefault: (id: string) => void;
  busy: string | null;
}) {
  const isBusy = busy === conn.id;
  return (
    <div className="flex items-start gap-3 rounded-xl border p-3"
      style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)', opacity: conn.enabled ? 1 : 0.55 }}>
      <Zap size={14} style={{ color: conn.enabled ? 'var(--color-primary)' : 'var(--text-faint)', flexShrink: 0, marginTop: 2 }} />
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{conn.name}</span>
          {conn.isDefault && <Star size={11} className="text-yellow-400" fill="currentColor" />}
          {!conn.enabled && <span className="text-xs rounded px-1.5 py-0.5 font-medium" style={{ background: 'var(--surface-muted)', color: 'var(--text-faint)' }}>disabled</span>}
        </div>
        <div className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)' }}>{conn.baseUrl}</div>
        <div className="flex items-center gap-2 pt-0.5">
          <StatusBadge status={busy === `test-${conn.id}` ? 'testing' : conn.status} />
          {conn.lastCheckedAt && (
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
              checked {new Date(conn.lastCheckedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {/* Test */}
        <button
          onClick={() => onTest(conn.id)}
          disabled={!!busy}
          title="Test connection"
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-40"
        >
          {busy === `test-${conn.id}`
            ? <Loader2 size={13} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
            : <RefreshCw size={13} style={{ color: 'var(--color-primary)' }} />}
        </button>
        {/* Edit */}
        <button
          onClick={() => onEdit(conn)}
          disabled={!!busy}
          title="Edit"
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-40"
        >
          <Edit2 size={13} style={{ color: 'var(--text-muted)' }} />
        </button>
        {/* Set default */}
        {!conn.isDefault && (
          <button
            onClick={() => onSetDefault(conn.id)}
            disabled={!!busy}
            title="Set as default"
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-40"
          >
            <Star size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
        )}
        {/* Delete */}
        <button
          onClick={() => onDelete(conn.id)}
          disabled={isBusy}
          title="Delete"
          className="p-1.5 rounded-lg transition-colors hover:bg-red-50 disabled:opacity-40"
        >
          {isBusy
            ? <Loader2 size={13} className="animate-spin text-red-400" />
            : <Trash2 size={13} className="text-red-400" />}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props { workspaceId: string }

export function N8nConnections({ workspaceId }: Props) {
  const [connections, setConnections] = useState<N8nConnection[]>([]);
  const [loading, setLoading]         = useState(true);
  const [err, setErr]                 = useState<string | null>(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [editTarget, setEditTarget]   = useState<N8nConnection | null>(null);
  const [busy, setBusy]               = useState<string | null>(null);
  const useMock                       = useRef(false);
  const mock                          = useMockFallback(workspaceId);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = useMock.current
        ? await mock.load()
        : await listConnections(workspaceId);
      setConnections(data);
    } catch {
      // Real API not available yet — fall back to local mock state
      useMock.current = true;
      setConnections(await mock.load());
    } finally {
      setLoading(false);
    }
  }, [workspaceId, mock]);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd(values: FormState) {
    setBusy('new'); setErr(null);
    try {
      if (useMock.current) await mock.create(values);
      else await createConnection(workspaceId, values);
      setShowAdd(false); await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create');
    } finally { setBusy(null); }
  }

  async function handleEdit(values: FormState) {
    if (!editTarget) return;
    setBusy('edit'); setErr(null);
    try {
      if (useMock.current) await mock.update(editTarget.id, values);
      else await updateConnection(editTarget.id, values);
      setEditTarget(null); await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update');
    } finally { setBusy(null); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this n8n connection?')) return;
    setBusy(id); setErr(null);
    try {
      if (useMock.current) await mock.remove(id);
      else await deleteConnection(id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    } finally { setBusy(null); }
  }

  async function handleTest(id: string) {
    setBusy(`test-${id}`); setErr(null);
    // Optimistically mark as testing
    setConnections((prev) => prev.map((c) => c.id === id ? { ...c, status: 'testing' } : c));
    try {
      const result = useMock.current
        ? await mock.test(id)
        : await testConnection(id);
      setConnections((prev) =>
        prev.map((c) => c.id === id
          ? { ...c, status: result.status, lastCheckedAt: new Date().toISOString() }
          : c
        )
      );
      if (result.status === 'error') setErr(`Test failed: ${result.message ?? 'Unreachable'}`);
    } catch (e) {
      setConnections((prev) => prev.map((c) => c.id === id ? { ...c, status: 'error' } : c));
      setErr(e instanceof Error ? e.message : 'Test failed');
    } finally { setBusy(null); }
  }

  async function handleSetDefault(id: string) {
    setBusy(id); setErr(null);
    try {
      if (useMock.current) await mock.update(id, { isDefault: true });
      else await updateConnection(id, { isDefault: true });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally { setBusy(null); }
  }

  const editInitial: FormState | undefined = editTarget
    ? { name: editTarget.name, baseUrl: editTarget.baseUrl, apiKey: '', enabled: editTarget.enabled, isDefault: editTarget.isDefault }
    : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>n8n Connections</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Register n8n instances used as workflow / automation backend. API keys are AES-256 encrypted.
          </p>
        </div>
        <button
          onClick={() => { setShowAdd((v) => !v); setEditTarget(null); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          <Plus size={13} /> Add Connection
        </button>
      </div>

      {/* Error banner */}
      {err && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <XCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{err}</p>
          <button onClick={() => setErr(null)} className="ml-auto"><X size={13} className="text-red-400" /></button>
        </div>
      )}

      {/* Add form */}
      {showAdd && !editTarget && (
        <ConnectionForm
          onSave={(v) => void handleAdd(v)}
          onCancel={() => setShowAdd(false)}
          saving={busy === 'new'}
        />
      )}

      {/* Edit form */}
      {editTarget && (
        <ConnectionForm
          initial={editInitial}
          onSave={(v) => void handleEdit(v)}
          onCancel={() => setEditTarget(null)}
          saving={busy === 'edit'}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
        </div>
      ) : connections.length === 0 ? (
        <div className="py-12 text-center">
          <Zap size={32} className="mx-auto mb-3" style={{ color: 'var(--text-faint)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No n8n connections yet.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>Add one to enable workflow automation.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((c) => (
            <ConnectionRow
              key={c.id}
              conn={c}
              busy={busy}
              onDelete={(id) => void handleDelete(id)}
              onTest={(id) => void handleTest(id)}
              onEdit={(conn) => { setEditTarget(conn); setShowAdd(false); }}
              onSetDefault={(id) => void handleSetDefault(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
