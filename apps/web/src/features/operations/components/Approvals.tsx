/**
 * Approvals
 *
 * Panel definitivo de aprobaciones pendientes. Reemplaza PendingApprovals.tsx.
 *
 * Diagnóstico F6-10:
 *   - RunSpec.steps: RunStep[] confirmado en core-types/src/run-spec.ts → sin (as any)
 *   - RunStatus incluye 'waiting_approval' → filtro directo tipado
 *   - StepStatus incluye 'waiting_approval' → step.status comparación directa
 *   - RunStep NO tiene campo 'message' ni 'choices' → acceso con (step as any)
 *   - PendingApprovals.tsx NO estaba montado en ningún shell → huérfano
 *   - backend_filtra_status: false (getRuns() no acepta ?status param en api.ts)
 *     → estrategia: getRuns() + filtro client-side
 *   - approveStep/rejectStep de api.ts (POST .../approve y .../reject)
 *   - PendingApprovals usaba POST .../resolve → endpoint no existe en api.ts
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckSquare, Clock, Inbox, RefreshCw, XCircle, CheckCircle } from 'lucide-react';
import { getRuns, approveStep, rejectStep } from '../../../lib/api';
import type { RunSpec, RunStep } from '../../../lib/types';

// ── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

/** Extrae steps en waiting_approval de un RunSpec.
 *  RunSpec.steps: RunStep[] está tipado — sin cast. */
function pendingSteps(run: RunSpec): RunStep[] {
  return run.steps.filter(s => s.status === 'waiting_approval');
}

// ── ApprovalCard ─────────────────────────────────────────────────────────────

interface ApprovalCardProps {
  run: RunSpec;
  step: RunStep;
  onResolved: (decision: 'approved' | 'rejected') => void;
}

function ApprovalCard({ run, step, onResolved }: ApprovalCardProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // message y choices no están en el tipo RunStep — acceso seguro con cast
  const message = (step as unknown as { message?: string }).message;
  const choices = (step as unknown as { choices?: string[] }).choices ?? [];
  const hasCustomChoices = choices.length > 0;

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      await approveStep(run.id, step.id);
      onResolved('approved');
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  async function handleReject() {
    setLoading(true);
    setError(null);
    try {
      await rejectStep(run.id, step.id, reason || undefined);
      onResolved('rejected');
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  async function handleChoice(choice: string) {
    setLoading(true);
    setError(null);
    try {
      if (choice === 'reject' || choice === 'no') {
        await rejectStep(run.id, step.id, choice);
        onResolved('rejected');
      } else {
        await approveStep(run.id, step.id);
        onResolved('approved');
      }
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  const waitingSince = step.startedAt ?? run.startedAt;

  return (
    <div
      className="rounded-lg border p-3 space-y-2.5"
      style={{ borderColor: '#d97706', background: 'var(--bg-secondary, #fffbeb)' }}
    >
      {/* Header: nodeType + tiempo */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare size={13} color="#d97706" />
          <span
            className="text-xs font-semibold"
            style={{ color: 'var(--text-primary, #92400e)' }}
          >
            {step.nodeType
              ? `${step.nodeType.charAt(0).toUpperCase()}${step.nodeType.slice(1)}`
              : 'Approval required'}
          </span>
          {step.nodeId && (
            <span
              className="text-[10px]"
              style={{ color: 'var(--text-muted, #78350f)' }}
            >
              — {step.nodeId}
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-1 text-[10px]"
          style={{ color: 'var(--text-muted, #78350f)' }}
        >
          <Clock size={10} />
          {timeAgo(waitingSince)}
        </div>
      </div>

      {/* Run ID + Flow ID */}
      <div className="flex items-center gap-2 flex-wrap">
        <code
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{
            background: 'var(--bg-tertiary, #fef3c7)',
            color: 'var(--text-muted, #92400e)',
          }}
        >
          run:{run.id.slice(0, 8)}
        </code>
        <code
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{
            background: 'var(--bg-tertiary, #fef3c7)',
            color: 'var(--text-muted, #92400e)',
          }}
        >
          flow:{run.flowId.slice(0, 8)}
        </code>
        {step.agentId && (
          <code
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{
              background: 'var(--bg-tertiary, #fef3c7)',
              color: 'var(--text-muted, #92400e)',
            }}
          >
            agent:{step.agentId.slice(0, 8)}
          </code>
        )}
      </div>

      {/* Mensaje del step (campo extendido, no tipado) */}
      {message && (
        <p
          className="text-xs leading-relaxed"
          style={{ color: 'var(--text-primary, #78350f)' }}
        >
          {message}
        </p>
      )}

      {/* Error de la última acción */}
      {error && (
        <div
          className="rounded px-2 py-1.5 text-[11px]"
          style={{ background: '#fee2e2', color: '#dc2626' }}
        >
          {error}
        </div>
      )}

      {/* Textarea de rejection reason — solo en flujo estándar */}
      {!hasCustomChoices && (
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Optional rejection reason…"
          disabled={loading}
          className="w-full rounded border px-2 py-1.5 text-[11px] resize-none"
          style={{ borderColor: '#fcd34d', background: 'white' }}
          rows={2}
        />
      )}

      {/* Botones */}
      <div className="flex gap-2 flex-wrap">
        {hasCustomChoices ? (
          choices.map(choice => (
            <button
              key={choice}
              type="button"
              disabled={loading}
              onClick={() => void handleChoice(choice)}
              className="flex-1 rounded px-3 py-1.5 text-xs font-semibold capitalize transition-opacity disabled:opacity-50"
              style={{
                background:
                  choice === 'approve' || choice === 'yes'
                    ? '#059669'
                    : choice === 'reject' || choice === 'no'
                    ? '#dc2626'
                    : '#6366f1',
                color: 'white',
              }}
            >
              {loading ? '…' : choice}
            </button>
          ))
        ) : (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleApprove()}
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50"
              style={{ background: '#059669' }}
            >
              <CheckCircle size={12} />
              {loading ? '…' : 'Approve'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleReject()}
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50"
              style={{ background: '#dc2626' }}
            >
              <XCircle size={12} />
              {loading ? '…' : 'Reject'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Approvals — componente principal ─────────────────────────────────────────

interface ApprovalsProps {
  /** Intervalo de polling en ms (default: 5000) */
  pollingIntervalMs?: number;
  /** Callback al resolver una aprobación */
  onResolved?: (runId: string, stepId: string, decision: 'approved' | 'rejected') => void;
}

export function Approvals({ pollingIntervalMs = 5_000, onResolved }: ApprovalsProps) {
  const [runs, setRuns] = useState<RunSpec[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const mounted = useRef(true);

  const fetchPending = useCallback(async () => {
    if (!mounted.current) return;
    try {
      // Estrategia B: getRuns() + filtro client-side.
      // RunStatus incluye 'waiting_approval' → filtro directo tipado.
      // También capturamos runs cuyo status sea 'waiting_approval' a nivel de run,
      // O que tengan al menos un step en 'waiting_approval'.
      const allRuns = await getRuns();
      if (!mounted.current) return;

      const pending = allRuns.filter(
        r =>
          r.status === 'waiting_approval' ||
          r.steps.some(s => s.status === 'waiting_approval'),
      );

      setRuns(pending);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    }
  }, []);

  // Carga inicial + polling
  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    fetchPending().finally(() => {
      if (mounted.current) setLoading(false);
    });
    const timer = setInterval(() => { void fetchPending(); }, pollingIntervalMs);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [fetchPending, pollingIntervalMs]);

  // Optimistic remove al resolver + refetch confirmatorio
  function handleResolved(
    runId: string,
    stepId: string,
    decision: 'approved' | 'rejected',
  ) {
    setRuns(prev =>
      prev
        .map(r => {
          if (r.id !== runId) return r;
          const updatedSteps = r.steps.filter(s => s.id !== stepId);
          // Si el run ya no tiene steps pendientes, quitarlo de la lista
          const stillPending = updatedSteps.some(s => s.status === 'waiting_approval');
          if (!stillPending) return null;
          return { ...r, steps: updatedSteps };
        })
        .filter((r): r is RunSpec => r !== null),
    );
    onResolved?.(runId, stepId, decision);
    // Refrescar desde servidor para confirmar estado real
    void fetchPending();
  }

  // Aplanar todos los steps pendientes
  const allPendingCards: Array<{ run: RunSpec; step: RunStep }> = runs.flatMap(r =>
    pendingSteps(r).map(step => ({ run: r, step })),
  );
  const count = allPendingCards.length;

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{
          borderColor: 'var(--border-primary)',
          background: 'var(--bg-secondary)',
        }}
      >
        <div className="flex items-center gap-2">
          <CheckSquare size={14} color="#d97706" />
          <span
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            Pending Approvals
          </span>
          {count > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
              style={{ background: '#fef3c7', color: '#92400e' }}
            >
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span
              className="text-[10px]"
              style={{ color: 'var(--text-muted)' }}
            >
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={() => { void fetchPending(); }}
            disabled={loading}
            aria-label="Refresh approvals"
            className="p-1 rounded transition-colors disabled:opacity-50"
            style={{ color: 'var(--text-muted)' }}
          >
            <RefreshCw
              size={12}
              style={{ animation: loading ? 'spin 1s linear infinite' : undefined }}
            />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Error */}
        {error && (
          <div
            className="mx-4 mt-3 rounded-md px-3 py-2 text-xs"
            style={{ background: '#fee2e2', color: '#dc2626' }}
          >
            {error}
          </div>
        )}

        {/* Loading inicial */}
        {loading && count === 0 && !error && (
          <div
            className="flex items-center gap-2 px-4 py-6 text-xs"
            style={{ color: 'var(--text-muted)' }}
          >
            <RefreshCw size={12} />
            Loading approvals…
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && count === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <Inbox
              size={28}
              style={{ color: 'var(--text-faint, #d1d5db)', marginBottom: 12 }}
            />
            <p
              className="text-sm font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              No pending approvals
            </p>
            <p
              className="text-xs mt-1"
              style={{ color: 'var(--text-faint, #9ca3af)' }}
            >
              Steps waiting for human input will appear here.
            </p>
          </div>
        )}

        {/* Lista de aprobaciones */}
        {count > 0 && (
          <div className="p-3 space-y-2">
            {allPendingCards.map(({ run, step }) => (
              <ApprovalCard
                key={`${run.id}-${step.id}`}
                run={run}
                step={step}
                onResolved={decision =>
                  handleResolved(run.id, step.id, decision)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* TODO: cuando Approvals esté validado en producción,
          eliminar PendingApprovals.tsx (F6-cleanup) */}
    </div>
  );
}
