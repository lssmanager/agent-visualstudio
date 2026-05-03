/**
 * N8nNodePanel
 * Panel de propiedades lateral para un nodo de tipo 'n8n' en el canvas de flows.
 *
 * Responsabilidades:
 *   1. Selector de workflow (combobox con los workflows de n8n)
 *   2. Input mapping: tabla editable key → expresión
 *   3. Acciones: Guardar, Sincronizar con n8n, Activar/Desactivar workflow
 *   4. Sección de ejecuciones recientes (últimas 5)
 */

import { useCallback, useEffect, useState } from 'react';
import type { FlowNode, N8nInputMapping, N8nNodeConfig } from '../../../lib/types-base';
import {
  activateN8nWorkflow,
  deactivateN8nWorkflow,
  listN8nExecutions,
  syncFlowToN8n,
  type N8nExecutionSummary,
} from '../../../lib/api';
import { useN8nWorkflows } from '../hooks/useN8nWorkflows';

// ── Helpers ────────────────────────────────────────────────────────────────────

function emptyConfig(): N8nNodeConfig {
  return { workflowId: '', inputMapping: {} };
}

function statusBadgeClass(status: N8nExecutionSummary['status']): string {
  const map: Record<string, string> = {
    success:  'bg-emerald-100 text-emerald-700',
    running:  'bg-blue-100 text-blue-700',
    error:    'bg-red-100 text-red-700',
    waiting:  'bg-amber-100 text-amber-700',
    canceled: 'bg-slate-100 text-slate-500',
  };
  return map[status] ?? 'bg-slate-100 text-slate-500';
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

// ── Sub-componente: InputMappingEditor ─────────────────────────────────────────

interface MappingEditorProps {
  mapping:  N8nInputMapping;
  onChange: (mapping: N8nInputMapping) => void;
}

function InputMappingEditor({ mapping, onChange }: MappingEditorProps) {
  const entries = Object.entries(mapping);

  const update = (key: string, value: string) => {
    onChange({ ...mapping, [key]: value });
  };

  const addRow = () => {
    const newKey = `param_${Date.now()}`;
    onChange({ ...mapping, [newKey]: '' });
  };

  const removeRow = (key: string) => {
    const next = { ...mapping };
    delete next[key];
    onChange(next);
  };

  const renameKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    // Prevent overwriting existing keys
    if (newKey in mapping && newKey !== oldKey) return;
    const next: N8nInputMapping = {};
    for (const [k, v] of Object.entries(mapping)) {
      next[k === oldKey ? newKey : k] = v;
    }
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1 text-xs font-medium text-slate-500 px-1">
        <span>Parámetro n8n</span>
        <span>Expresión / valor</span>
        <span />
      </div>

      {entries.length === 0 && (
        <p className="text-xs text-slate-400 px-1">
          Sin parámetros. Haz clic en «+ Añadir» para mapear entradas.
        </p>
      )}

      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[1fr_1fr_auto] gap-1 items-center">
          <input
            className="rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
            defaultValue={key}
            onBlur={(e) => renameKey(key, e.currentTarget.value.trim())}
            placeholder="nombre_param"
          />
          <input
            className="rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
            value={value}
            onChange={(e) => update(key, e.currentTarget.value)}
            placeholder='{{output.field}} o "valor literal"'
          />
          <button
            type="button"
            onClick={() => removeRow(key)}
            className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500"
            aria-label={`Eliminar parámetro ${key}`}
          >
            ✕
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="mt-1 self-start rounded border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600"
      >
        + Añadir parámetro
      </button>
    </div>
  );
}

// ── Sub-componente: ExecutionList ──────────────────────────────────────────────

interface ExecutionListProps {
  workflowId: string;
}

function ExecutionList({ workflowId }: ExecutionListProps) {
  const [executions, setExecutions] = useState<N8nExecutionSummary[]>([]);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    if (!workflowId) return;
    setLoading(true);
    listN8nExecutions(workflowId)
      .then((data) => setExecutions(data.slice(0, 5)))
      .catch(() => setExecutions([]))
      .finally(() => setLoading(false));
  }, [workflowId]);

  if (!workflowId) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        Ejecuciones recientes
      </p>
      {loading && <p className="text-xs text-slate-400">Cargando…</p>}
      {!loading && executions.length === 0 && (
        <p className="text-xs text-slate-400">Sin ejecuciones registradas.</p>
      )}
      {executions.map((ex) => (
        <div key={ex.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-slate-600">#{ex.id}</span>
            <span className="text-slate-400">{formatDate(ex.startedAt)}</span>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(ex.status)}`}>
            {ex.status}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Componente principal: N8nNodePanel ─────────────────────────────────────────

export interface N8nNodePanelProps {
  node:    FlowNode;
  flowId:  string;
  onSave:  (updated: FlowNode) => void;
  onClose: () => void;
}

export function N8nNodePanel({ node, flowId, onSave, onClose }: N8nNodePanelProps) {
  const { workflows, loading: workflowsLoading, error: workflowsError, refetch } = useN8nWorkflows();

  const [config, setConfig]         = useState<N8nNodeConfig>(() => node.n8n ?? emptyConfig());
  const [label, setLabel]           = useState(node.label ?? node.id);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [syncError,  setSyncError]  = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    setConfig(node.n8n ?? emptyConfig());
    setLabel(node.label ?? node.id);
    setSyncStatus('idle');
    setSyncError(null);
  }, [node.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedWorkflow = workflows.find((w) => w.id === config.workflowId);

  const handleSave = useCallback(() => {
    onSave({ ...node, label, n8n: config });
  }, [node, label, config, onSave]);

  const handleSync = useCallback(async () => {
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const result = await syncFlowToN8n(flowId, config.workflowId || undefined);
      if (!config.workflowId && result.id) {
        setConfig((c) => ({ ...c, workflowId: result.id }));
      }
      setSyncStatus('ok');
    } catch (err) {
      setSyncError((err as Error).message);
      setSyncStatus('error');
    }
  }, [flowId, config.workflowId]);

  const handleToggleActive = useCallback(async () => {
    if (!config.workflowId || !selectedWorkflow) return;
    setActivating(true);
    try {
      if (selectedWorkflow.active) {
        await deactivateN8nWorkflow(config.workflowId);
      } else {
        await activateN8nWorkflow(config.workflowId);
      }
      refetch();
    } catch (err) {
      console.error('[N8nNodePanel] toggle active error:', err);
    } finally {
      setActivating(false);
    }
  }, [config.workflowId, selectedWorkflow, refetch]);

  return (
    <aside
      className="flex h-full w-80 flex-col border-l border-slate-200 bg-white"
      aria-label="Panel de propiedades del nodo n8n"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect width="24" height="24" rx="4" fill="#EA4B71"/>
            <path d="M7 12h10M12 7v10" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span className="text-sm font-semibold text-slate-800">Nodo n8n</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Cerrar panel"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 1l12 12M13 1L1 13"/>
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">

        {/* Identificación del nodo */}
        <section className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600" htmlFor="n8n-node-label">
            Etiqueta del nodo
          </label>
          <input
            id="n8n-node-label"
            type="text"
            className="rounded border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={node.id}
          />
          <p className="text-[11px] text-slate-400">ID interno: <code className="font-mono">{node.id}</code></p>
        </section>

        {/* Selector de workflow */}
        <section className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600" htmlFor="n8n-workflow-select">
            Workflow n8n
          </label>

          {workflowsError && (
            <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-600">
              Error cargando workflows: {workflowsError}.{' '}
              <button type="button" onClick={refetch} className="underline hover:no-underline">
                Reintentar
              </button>
            </div>
          )}

          <div className="relative">
            <select
              id="n8n-workflow-select"
              className="w-full appearance-none rounded border border-slate-200 bg-white px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
              value={config.workflowId}
              onChange={(e) => setConfig((c) => ({ ...c, workflowId: e.target.value }))}
              disabled={workflowsLoading}
            >
              <option value="">
                {workflowsLoading ? 'Cargando workflows…' : '— Seleccionar workflow —'}
              </option>
              {workflows.map((wf) => (
                <option key={wf.id} value={wf.id}>
                  {wf.name}{wf.active ? ' ✓' : ''}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
              width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
            >
              <path d="M2 4l4 4 4-4"/>
            </svg>
          </div>

          {selectedWorkflow && (
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                selectedWorkflow.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {selectedWorkflow.active ? 'Activo' : 'Inactivo'}
              </span>
              <button
                type="button"
                disabled={activating}
                onClick={handleToggleActive}
                className="text-[11px] text-indigo-500 underline hover:no-underline disabled:opacity-50"
              >
                {activating ? 'Cambiando…' : selectedWorkflow.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          )}
        </section>

        {/* Webhook path */}
        <section className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600" htmlFor="n8n-webhook-path">
            Webhook path{' '}
            <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <input
            id="n8n-webhook-path"
            type="text"
            className="rounded border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={config.webhookPath ?? ''}
            onChange={(e) => setConfig((c) => ({ ...c, webhookPath: e.target.value || undefined }))}
            placeholder="/my-webhook"
          />
          <p className="text-[11px] text-slate-400">
            Rellena solo si este nodo dispara un webhook n8n, no una ejecución directa.
          </p>
        </section>

        {/* Input mapping */}
        <section className="flex flex-col gap-2">
          <div>
            <p className="text-xs font-medium text-slate-600">Input mapping</p>
            <p className="text-[11px] text-slate-400">
              Mapea entradas del canvas al payload que recibirá el workflow n8n.
              Usa <code className="font-mono">{'{{output.campo}}'}</code> para referencias dinámicas.
            </p>
          </div>
          <InputMappingEditor
            mapping={config.inputMapping}
            onChange={(m) => setConfig((c) => ({ ...c, inputMapping: m }))}
          />
        </section>

        {/* Ejecuciones recientes */}
        {config.workflowId && (
          <section>
            <ExecutionList workflowId={config.workflowId} />
          </section>
        )}

      </div>

      {/* Footer: acciones */}
      <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3">
        {syncStatus === 'ok' && (
          <p className="text-center text-xs text-emerald-600">
            ✓ Sincronizado con n8n correctamente
          </p>
        )}
        {syncStatus === 'error' && syncError && (
          <p className="text-center text-xs text-red-500">
            Error: {syncError}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={syncStatus === 'syncing'}
            onClick={handleSync}
            className="flex flex-1 items-center justify-center gap-1.5 rounded border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
          >
            {syncStatus === 'syncing' ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                Sincronizando…
              </>
            ) : (
              '↑ Sync n8n'
            )}
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            Guardar
          </button>
        </div>
      </div>
    </aside>
  );
}
