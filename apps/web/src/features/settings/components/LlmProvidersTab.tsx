import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Star, Key } from 'lucide-react';
import { useForm } from 'react-hook-form';

import type { LlmProviderRecord } from '../../../lib/types';
import { listLlmProviders, upsertLlmProvider, deleteLlmProvider } from '../../../lib/channels-api';

const PROVIDERS = [
  { key: 'openai',     label: 'OpenAI',         placeholder: 'sk-…' },
  { key: 'anthropic',  label: 'Anthropic',       placeholder: 'sk-ant-…' },
  { key: 'openrouter', label: 'OpenRouter',      placeholder: 'sk-or-…' },
  { key: 'deepseek',   label: 'DeepSeek',        placeholder: 'key…' },
  { key: 'qwen',       label: 'Qwen / Alibaba',  placeholder: 'key…' },
];

interface Props { workspaceId: string }
interface AddForm { provider: string; label: string; apiKey: string; isDefault: boolean }

export function LlmProvidersTab({ workspaceId }: Props) {
  const [providers, setProviders] = useState<LlmProviderRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState<string | null>(null);
  const [showAdd, setShowAdd]     = useState(false);
  const [busy, setBusy]           = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } =
    useForm<AddForm>({ defaultValues: { provider: 'openai', label: '', apiKey: '', isDefault: false } });

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setProviders(await listLlmProviders(workspaceId)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd(values: AddForm) {
    setBusy('new'); setErr(null);
    try {
      const preset = PROVIDERS.find((p) => p.key === values.provider);
      await upsertLlmProvider(workspaceId, {
        provider: values.provider,
        label: values.label || preset?.label || values.provider,
        apiKey: values.apiKey,
        isDefault: values.isDefault,
      });
      reset(); setShowAdd(false); await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save key');
    } finally { setBusy(null); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this LLM provider?')) return;
    setBusy(id); setErr(null);
    try { await deleteLlmProvider(workspaceId, id); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Delete failed'); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>LLM API Keys</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Keys are AES-256 encrypted before being persisted. Never stored in .env.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          <Plus size={13} /> Add Key
        </button>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      {showAdd && (
        <form
          onSubmit={handleSubmit(handleAdd)}
          className="rounded-xl border p-4 space-y-3"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}
        >
          <p className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">New Provider</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Provider</label>
              <select
                {...register('provider', { required: true })}
                className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:outline-none"
              >
                {PROVIDERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Label (optional)</label>
              <input
                {...register('label')}
                placeholder="e.g., Production key"
                className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">API Key</label>
            <input
              {...register('apiKey', { required: 'API key required' })}
              type="password" autoComplete="off" placeholder="Paste key…"
              className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--input-text)] focus:outline-none"
            />
            {errors.apiKey && <p className="text-xs text-red-500 mt-0.5">{errors.apiKey.message}</p>}
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer">
            <input type="checkbox" {...register('isDefault')} className="accent-[var(--color-primary)]" />
            Set as default provider
          </label>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={busy === 'new'}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--color-primary)' }}
            >
              {busy === 'new' ? <Loader2 size={12} className="animate-spin" /> : <Key size={12} />}
              Save
            </button>
            <button type="button" onClick={() => { setShowAdd(false); reset(); }}
              className="px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ border: '1px solid var(--border-primary)', color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : providers.length === 0 ? (
        <div className="py-10 text-center">
          <Key size={32} className="mx-auto mb-3 text-[var(--text-faint)]" />
          <p className="text-sm text-[var(--text-muted)]">No LLM keys configured.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border p-3"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}>
              <Key size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {p.label}
                  {p.isDefault && <Star size={11} className="inline ml-1 text-yellow-400" fill="currentColor" />}
                </div>
                <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  {p.provider} · {p.maskedKey}
                </div>
              </div>
              <button onClick={() => void handleDelete(p.id)} disabled={busy === p.id}
                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                {busy === p.id
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
