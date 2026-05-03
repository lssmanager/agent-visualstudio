/**
 * NodeDetail
 *
 * Panel de detalle de nodo abierto al seleccionar un step en:
 *   - RunTimeline (click en un row de step)
 *   - StatusTree (click en un agente expandido)
 *   - Canvas (click en un nodo activo durante ejecución)
 *
 * A diferencia de StepDetail (que muestra datos estáticos de un RunStep
 * ya completado), NodeDetail muestra el step EN VIVO:
 *   - Timer en vivo mientras status === 'running' | 'processing' | 'active'
 *   - Output parcial que llega en streaming (si el SSE lo envía)
 *   - Token velocity (tokens/seg) mientras el step corre
 *   - Al completarse, muestra los datos finales
 *
 * Hallazgos del diagnóstico (commit feat/F6-08):
 *   - RunStep.input  → Record<string, unknown> (de StepDetail.tsx)
 *   - RunStep.output → Record<string, unknown> (de StepDetail.tsx)
 *   - StepBadge acepta size="md" solamente (confirmado en StepDetail.tsx)
 *   - stream.partial.output.exists = false → SSE no envía partial output todavía
 *     (streamOutput siempre undefined hasta que el backend lo implemente)
 */
import { useEffect, useRef, useState } from 'react';
import {
  X, Clock, Zap, DollarSign, Hash,
  ChevronDown, ChevronUp, AlertTriangle, Cpu,
} from 'lucide-react';
import { StepBadge } from '../../../components/ui/StepBadge';
import type { RunStep } from '../../../lib/types';
import type { StepUpdate } from '../useRealtimeRun';

// Acepta tanto RunStep (datos completos de BD) como StepUpdate (datos SSE)
type StepLike = RunStep | StepUpdate;

// ── Helpers para normalizar los dos tipos ──────────────────────────────

function getId(s: StepLike): string {
  return 'id' in s ? (s as RunStep).id : (s as StepUpdate).stepId;
}
function getNodeType(s: StepLike): string {
  return (s as RunStep | StepUpdate).nodeType ?? 'unknown';
}
function getNodeId(s: StepLike): string {
  return (s as RunStep | StepUpdate).nodeId ?? getId(s);
}
function getStatus(s: StepLike): string {
  return (s as RunStep | StepUpdate).status ?? 'idle';
}
function getStartedAt(s: StepLike): string | undefined {
  return (s as RunStep | StepUpdate).startedAt ?? undefined;
}
function getCompletedAt(s: StepLike): string | undefined {
  return (s as RunStep | StepUpdate).completedAt ?? undefined;
}
function getTokenUsage(s: StepLike): { input: number; output: number } | undefined {
  return (s as RunStep | StepUpdate).tokenUsage ?? undefined;
}
function getCostUsd(s: StepLike): number | undefined {
  return (s as RunStep | StepUpdate).costUsd ?? undefined;
}
function getInput(s: StepLike): Record<string, unknown> | undefined {
  return 'input' in s ? (s as RunStep).input ?? undefined : undefined;
}
function getOutput(s: StepLike): Record<string, unknown> | undefined {
  return 'output' in s ? (s as RunStep).output ?? undefined : undefined;
}
function getError(s: StepLike): string | undefined {
  return 'error' in s ? (s as RunStep).error ?? undefined : undefined;
}

// ── Helpers de UI ─────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

function safePretty(value: unknown): string {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function truncateOutput(s: string, max = 2000): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '\n… (truncated)';
}

// ── Timer en vivo ─────────────────────────────────────────────────────

function useLiveTimer(startedAt: string | undefined, isLive: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isLive || !startedAt) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    const tick = () => {
      setElapsed(Date.now() - new Date(startedAt).getTime());
    };
    tick();
    intervalRef.current = setInterval(tick, 500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLive, startedAt]);

  return elapsed;
}

// ── Sección colapsable ────────────────────────────────────────────────

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
}

function CollapsibleSection({
  title, children, defaultOpen = true, badge,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t" style={{ borderColor: 'var(--border-primary)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-left"
        style={{ color: 'var(--text-primary)', background: 'var(--bg-secondary)' }}
      >
        <span className="flex items-center gap-1.5">
          {title}
          {badge && (
            <span
              className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums"
              style={{ background: '#dbeafe', color: '#2563eb' }}
            >
              {badge}
            </span>
          )}
        </span>
        {open
          ? <ChevronUp size={12} color="var(--text-muted)" />
          : <ChevronDown size={12} color="var(--text-muted)" />}
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1">
          {children}
        </div>
      )}
    </div>
  );
}

// ── NodeDetail ────────────────────────────────────────────────────────

export interface NodeDetailProps {
  step: StepLike;
  /** true mientras el step está running — activa timer en vivo */
  isLive?: boolean;
  /**
   * Output parcial desde SSE (tokens llegando en streaming).
   * TODO: conectar cuando el backend emita step:output:partial events.
   * stream.partial.output.exists = false — pasar undefined por ahora.
   */
  streamOutput?: string;
  onClose: () => void;
  className?: string;
}

export function NodeDetail({
  step,
  isLive = false,
  streamOutput,
  onClose,
  className = '',
}: NodeDetailProps) {
  const nodeType    = getNodeType(step);
  const nodeId      = getNodeId(step);
  const status      = getStatus(step);
  const startedAt   = getStartedAt(step);
  const completedAt = getCompletedAt(step);
  const tokenUsage  = getTokenUsage(step);
  const costUsd     = getCostUsd(step);
  const inputData   = getInput(step);
  const outputData  = getOutput(step);
  const errorMsg    = getError(step);

  const elapsed = useLiveTimer(startedAt, isLive);

  // Velocidad en tokens/seg (solo cuando hay datos y está en vivo)
  const tokensPerSec =
    isLive && elapsed > 0 && tokenUsage && tokenUsage.output > 0
      ? (tokenUsage.output / (elapsed / 1000)).toFixed(1)
      : null;

  // Duración final cuando ya está completado
  const finalDuration =
    startedAt && completedAt
      ? formatDuration(new Date(completedAt).getTime() - new Date(startedAt).getTime())
      : null;

  const hasStreamOutput = typeof streamOutput === 'string' && streamOutput.length > 0;
  const hasStaticOutput = outputData != null && Object.keys(outputData).length > 0;
  const hasInput = inputData != null && Object.keys(inputData).length > 0;

  const nodeLabel = nodeType.charAt(0).toUpperCase() + nodeType.slice(1);

  return (
    <div
      className={`flex flex-col h-full overflow-hidden ${className}`}
      style={{
        background:   'var(--bg-primary)',
        borderColor:  'var(--border-primary)',
        borderWidth:  1,
        borderStyle:  'solid',
        borderRadius: 8,
      }}
    >
      {/* ── Header ────────────────────────────────────────────── */}
      <div
        className="flex items-start justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Cpu size={14} color="var(--color-accent, #2563eb)" />
            <h3
              className="text-sm font-semibold truncate"
              style={{ color: 'var(--text-primary)' }}
              title={`${nodeLabel} — ${nodeId}`}
            >
              {nodeLabel}
            </h3>
            <StepBadge status={status} size="md" />
          </div>
          <p className="text-[11px] mt-0.5 font-mono truncate" style={{ color: 'var(--text-muted)' }}>
            {nodeId}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel"
          className="ml-2 flex-shrink-0 p-1 rounded hover:bg-slate-100 transition-colors"
        >
          <X size={14} color="var(--text-muted)" />
        </button>
      </div>

      {/* ── Métricas rápidas ─────────────────────────────────── */}
      <div
        className="grid grid-cols-3 text-center py-2"
        style={{
          borderBottom: '1px solid var(--border-primary)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          borderTop: 'none',
        }}
      >
        {/* Duración / Timer */}
        <div
          className="flex flex-col items-center gap-0.5 px-2"
          style={{ borderRight: '1px solid var(--border-primary)' }}
        >
          <Clock size={11} color="var(--text-muted)" />
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {isLive ? formatDuration(elapsed) : (finalDuration ?? '—')}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {isLive ? 'elapsed' : 'duration'}
          </span>
        </div>

        {/* Tokens */}
        <div
          className="flex flex-col items-center gap-0.5 px-2"
          style={{ borderRight: '1px solid var(--border-primary)' }}
        >
          <Hash size={11} color="var(--text-muted)" />
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {tokenUsage ? (tokenUsage.input + tokenUsage.output).toLocaleString() : '—'}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {tokensPerSec ? `${tokensPerSec} tok/s` : 'tokens'}
          </span>
        </div>

        {/* Costo */}
        <div className="flex flex-col items-center gap-0.5 px-2">
          <DollarSign size={11} color="var(--text-muted)" />
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {costUsd != null ? `$${costUsd.toFixed(4)}` : '—'}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>cost</span>
        </div>
      </div>

      {/* ── Contenido scrollable ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Token breakdown */}
        {tokenUsage && (
          <div
            className="flex gap-4 px-4 py-2 text-xs border-b"
            style={{ borderColor: 'var(--border-primary)', color: 'var(--text-muted)' }}
          >
            <span>
              In:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {tokenUsage.input.toLocaleString()}
              </strong>
            </span>
            <span>
              Out:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {tokenUsage.output.toLocaleString()}
              </strong>
            </span>
            {isLive && tokensPerSec && (
              <span className="ml-auto flex items-center gap-1" style={{ color: '#2563eb' }}>
                <Zap size={10} />
                {tokensPerSec} tok/s
              </span>
            )}
          </div>
        )}

        {/* Timing detallado */}
        {(startedAt || completedAt) && (
          <CollapsibleSection title="Timing" defaultOpen={false}>
            <div className="space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              {startedAt && (
                <div className="flex justify-between">
                  <span>Started</span>
                  <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                    {formatTime(startedAt)}
                  </span>
                </div>
              )}
              {completedAt && (
                <div className="flex justify-between">
                  <span>Completed</span>
                  <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                    {formatTime(completedAt)}
                  </span>
                </div>
              )}
              {finalDuration && (
                <div className="flex justify-between">
                  <span>Duration</span>
                  <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {finalDuration}
                  </span>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="mx-4 my-3 rounded-md p-3" style={{ background: '#fee2e2' }}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} color="#dc2626" className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold" style={{ color: '#dc2626' }}>Error</p>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: '#991b1b', fontFamily: 'var(--font-mono)' }}
                >
                  {errorMsg}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Output — streaming parcial (en vivo) */}
        {hasStreamOutput && (
          <CollapsibleSection title="Output" badge="live" defaultOpen>
            <pre
              className="text-[11px] p-2 rounded overflow-auto max-h-64 whitespace-pre-wrap break-words"
              style={{
                background:  'var(--bg-tertiary)',
                color:       'var(--text-primary)',
                fontFamily:  'var(--font-mono)',
              }}
            >
              {truncateOutput(streamOutput!)}
              {isLive && (
                <span
                  className="inline-block w-1.5 h-3 ml-0.5 align-middle"
                  style={{
                    background: '#2563eb',
                    animation: 'nd-blink 1s step-end infinite',
                  }}
                />
              )}
            </pre>
            <style>{`@keyframes nd-blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
          </CollapsibleSection>
        )}

        {/* Output — datos completos (estático) */}
        {!hasStreamOutput && hasStaticOutput && (
          <CollapsibleSection title="Output" defaultOpen>
            <pre
              className="text-[11px] p-2 rounded overflow-auto max-h-64 whitespace-pre-wrap break-words"
              style={{
                background: 'var(--bg-tertiary)',
                color:      'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {safePretty(outputData)}
            </pre>
          </CollapsibleSection>
        )}

        {/* Input */}
        {hasInput && (
          <CollapsibleSection title="Input" defaultOpen={false}>
            <pre
              className="text-[11px] p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap break-words"
              style={{
                background: 'var(--bg-tertiary)',
                color:      'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {safePretty(inputData)}
            </pre>
          </CollapsibleSection>
        )}

        {/* Estado vacío */}
        {!hasInput && !hasStaticOutput && !hasStreamOutput && !errorMsg && (
          <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            {isLive ? 'Waiting for data…' : 'No data available for this step.'}
          </div>
        )}
      </div>
    </div>
  );
}
