/**
 * ModelSettings
 *
 * Panel de política de modelo LLM por scope jerárquico.
 * Diagnóstico F6-11:
 *   - ModelPolicy NO existe en schema.prisma todavía → backend_endpoint_existe: false
 *   - GET/PUT /api/studio/v1/model-policies → 404 hasta que se implemente ModelPoliciesController
 *   - LlmProvidersTab usa: openai, anthropic, openrouter, deepseek, qwen (5 providers reales)
 *   - SettingsPage usa tabs con array TABS as const → añadir 'Model Policy'
 *   - Design tokens: var(--text-primary), var(--text-muted), var(--color-primary),
 *     var(--border-primary), var(--card-bg), var(--input-border), var(--input-bg), var(--input-text)
 *   - No existe PolicyScope en api.ts → definir aquí + en api.ts
 *
 * Herencia: Agency → Department → Workspace → Agent
 * Si un scope tiene inherit: true, usa el modelo del scope padre.
 * Agency es el nivel raíz — no hereda de nadie.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Cpu,
  ChevronDown,
  Save,
  CheckCircle2,
  AlertCircle,
  Info,
  Loader2,
} from 'lucide-react';
import {
  getModelPolicies,
  upsertModelPolicy,
  type ModelPolicy,
  type PolicyScope,
} from '../../../lib/api';

// ── Constantes ────────────────────────────────────────────────────────

const SCOPES: { scope: PolicyScope; label: string; description: string }[] = [
  {
    scope: 'agency',
    label: 'Agency',
    description:
      'Default policy for the entire agency. All scopes below inherit unless overridden.',
  },
  {
    scope: 'department',
    label: 'Department',
    description: 'Overrides agency policy for a specific department.',
  },
  {
    scope: 'workspace',
    label: 'Workspace',
    description: 'Overrides department policy for a specific workspace.',
  },
  {
    scope: 'agent',
    label: 'Agent',
    description: 'Overrides workspace policy for a specific agent.',
  },
];

// Providers reales de LlmProvidersTab (mantener sincronizado).
// Actualizar si LlmProvidersTab añade nuevos providers.
const PROVIDERS: Record<string, { label: string; models: string[] }> = {
  openai: {
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  anthropic: {
    label: 'Anthropic',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  },
  openrouter: {
    label: 'OpenRouter',
    models: ['openrouter/auto', 'meta-llama/llama-3.1-70b-instruct', 'google/gemini-pro-1.5'],
  },
  deepseek: {
    label: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  },
  qwen: {
    label: 'Qwen / Alibaba',
    models: ['qwen2.5-72b-instruct', 'qwen2.5-32b-instruct', 'qwen-turbo'],
  },
};

// ── PolicyRow ─────────────────────────────────────────────────────────

interface PolicyRowProps {
  scopeDef: { scope: PolicyScope; label: string; description: string };
  scopeId: string;
  initialPolicy: ModelPolicy | null;
  inheritedFrom: ModelPolicy | null;
  onSaved: (policy: ModelPolicy) => void;
  isRoot: boolean;
}

function PolicyRow({
  scopeDef,
  scopeId,
  initialPolicy,
  inheritedFrom,
  onSaved,
  isRoot,
}: PolicyRowProps) {
  const [inherit, setInherit] = useState<boolean>(initialPolicy?.inherit ?? !isRoot);
  const [provider, setProvider] = useState<string>(initialPolicy?.provider ?? 'openai');
  const [model, setModel] = useState<string>(
    initialPolicy?.model ?? PROVIDERS['openai'].models[0],
  );
  const [temperature, setTemperature] = useState<number>(initialPolicy?.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState<number>(initialPolicy?.maxTokens ?? 2048);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    inherit !== (initialPolicy?.inherit ?? !isRoot) ||
    (!inherit &&
      (provider !== (initialPolicy?.provider ?? 'openai') ||
        model !== (initialPolicy?.model ?? PROVIDERS['openai'].models[0]) ||
        temperature !== (initialPolicy?.temperature ?? 0.7) ||
        maxTokens !== (initialPolicy?.maxTokens ?? 2048)));

  function handleProviderChange(p: string) {
    setProvider(p);
    const models = PROVIDERS[p]?.models ?? [];
    setModel(models[0] ?? '');
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await upsertModelPolicy(scopeDef.scope, scopeId, {
        inherit,
        ...(inherit ? {} : { provider, model, temperature, maxTokens }),
      });
      onSaved(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        msg.includes('404') || msg.includes('405')
          ? 'Model policy endpoint not yet available on the server (TODO: F-backend ModelPoliciesController).'
          : msg,
      );
    } finally {
      setSaving(false);
    }
  }

  const providerModels = PROVIDERS[provider]?.models ?? [];

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{
        borderColor: 'var(--border-primary)',
        background: 'var(--card-bg)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Cpu size={13} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <span
              className="text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {scopeDef.label}
            </span>
            {inherit && inheritedFrom && !inheritedFrom.inherit && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: '#eff6ff', color: '#2563eb' }}
              >
                inherits {inheritedFrom.provider ?? 'system'} /{' '}
                {inheritedFrom.model ?? 'default'}
              </span>
            )}
            {isRoot && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: '#f0fdf4', color: '#16a34a' }}
              >
                root
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {scopeDef.description}
          </p>
        </div>

        {/* Toggle inherit — deshabilitado para Agency (root) */}
        {!isRoot && (
          <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
            <input
              type="checkbox"
              checked={inherit}
              onChange={(e) => setInherit(e.target.checked)}
              className="rounded accent-[var(--color-primary)]"
            />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Inherit
            </span>
          </label>
        )}
      </div>

      {/* Override fields */}
      {!inherit && (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
        >
          {/* Provider */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Provider
            </label>
            <div className="relative">
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm appearance-none pr-7 focus:outline-none"
                style={{
                  borderColor: 'var(--input-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--input-text)',
                }}
              >
                {Object.entries(PROVIDERS).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
            </div>
          </div>

          {/* Model */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Model
            </label>
            <div className="relative">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm appearance-none pr-7 focus:outline-none"
                style={{
                  borderColor: 'var(--input-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--input-text)',
                }}
              >
                {providerModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
            </div>
          </div>

          {/* Temperature */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Temperature
              <span
                className="ml-1.5 font-mono tabular-nums"
                style={{ color: 'var(--color-primary)' }}
              >
                {temperature.toFixed(1)}
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full accent-[var(--color-primary)]"
            />
            <div
              className="flex justify-between text-[10px] mt-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              <span>0 deterministic</span>
              <span>2 creative</span>
            </div>
          </div>

          {/* Max Tokens */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Max Tokens
            </label>
            <input
              type="number"
              min={128}
              max={128000}
              step={256}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="w-full rounded-lg border px-3 py-2 text-sm tabular-nums focus:outline-none"
              style={{
                borderColor: 'var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--input-text)',
              }}
            />
          </div>
        </div>
      )}

      {/* Inherited banner */}
      {inherit && inheritedFrom && !inheritedFrom.inherit && (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: '#eff6ff', color: '#1d4ed8' }}
        >
          <Info size={12} className="flex-shrink-0 mt-0.5" />
          <span>
            Using <strong>{inheritedFrom.provider}</strong> /{' '}
            <strong>{inheritedFrom.model}</strong> from parent scope. Temperature:{' '}
            {inheritedFrom.temperature?.toFixed(1) ?? '—'}.
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: '#fee2e2', color: '#dc2626' }}
        >
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-1">
        {saved && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#059669' }}>
            <CheckCircle2 size={13} />
            Saved
          </div>
        )}
        <button
          type="button"
          disabled={saving || !isDirty}
          onClick={() => void handleSave()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition-opacity"
          style={{ background: 'var(--color-primary)' }}
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Save size={12} />
          )}
          {saving ? 'Saving…' : 'Save policy'}
        </button>
      </div>
    </div>
  );
}

// ── ModelSettings — componente principal ─────────────────────────────

interface ModelSettingsProps {
  agencyId?: string;
  departmentId?: string;
  workspaceId?: string;
  agentId?: string;
}

export function ModelSettings({
  agencyId = '__global__',
  departmentId = '__global__',
  workspaceId = '__global__',
  agentId = '__global__',
}: ModelSettingsProps) {
  const [policies, setPolicies] = useState<ModelPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopeIds: { [K in PolicyScope]: string } = {
    agency: agencyId,
    department: departmentId,
    workspace: workspaceId,
    agent: agentId,
  };

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getModelPolicies();
      setPolicies(data);
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        msg.includes('404') || msg.includes('405')
          ? 'Model policies endpoint not yet available (TODO: F-backend ModelPoliciesController). The form below is still usable once the backend is ready.'
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPolicies();
  }, [fetchPolicies]);

  function getPolicyForScope(scope: PolicyScope): ModelPolicy | null {
    const id = scopeIds[scope];
    return policies.find((p) => p.scope === scope && p.scopeId === id) ?? null;
  }

  function getInheritedPolicy(scope: PolicyScope): ModelPolicy | null {
    const order: PolicyScope[] = ['agency', 'department', 'workspace', 'agent'];
    const idx = order.indexOf(scope);
    for (let i = idx - 1; i >= 0; i--) {
      const p = getPolicyForScope(order[i]);
      if (p && !p.inherit) return p;
    }
    return null;
  }

  function handleSaved(updated: ModelPolicy) {
    setPolicies((prev) => {
      const exists = prev.some(
        (p) => p.scope === updated.scope && p.scopeId === updated.scopeId,
      );
      return exists
        ? prev.map((p) =>
            p.scope === updated.scope && p.scopeId === updated.scopeId ? updated : p,
          )
        : [...prev, updated];
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Cpu size={16} style={{ color: 'var(--color-primary)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Model Policy
          </h3>
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Configure which LLM model is used at each hierarchy level.
          Lower scopes inherit from higher ones unless overridden.
        </p>
      </div>

      {/* Cascade diagram */}
      <div
        className="rounded-lg px-3 py-2 text-[11px] font-mono"
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-primary)',
          color: 'var(--text-muted)',
        }}
      >
        Agency{' '}
        <span style={{ color: 'var(--color-primary)' }}>→</span> Department{' '}
        <span style={{ color: 'var(--color-primary)' }}>→</span> Workspace{' '}
        <span style={{ color: 'var(--color-primary)' }}>→</span> Agent
        <span className="ml-2 font-sans" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
          (arrow = inherits from)
        </span>
      </div>

      {/* Load error — no bloquea el panel */}
      {error && !loading && (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
          style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}
        >
          <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={14} className="animate-spin" />
          Loading policies…
        </div>
      )}

      {/* Una fila por scope */}
      {SCOPES.map((scopeDef, idx) => (
        <PolicyRow
          key={scopeDef.scope}
          scopeDef={scopeDef}
          scopeId={scopeIds[scopeDef.scope]}
          initialPolicy={getPolicyForScope(scopeDef.scope)}
          inheritedFrom={getInheritedPolicy(scopeDef.scope)}
          onSaved={handleSaved}
          isRoot={idx === 0}
        />
      ))}
    </div>
  );
}
