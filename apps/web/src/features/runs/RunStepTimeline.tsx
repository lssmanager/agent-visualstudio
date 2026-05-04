/**
 * RunStepTimeline.tsx
 * Timeline de steps de un Run con datos reales via SSE / polling (useRealtimeRun).
 * Muestra estado, tokens, costo y duración por step.
 *
 * Corregido:
 *   - steps es Map<string,StepUpdate> → convertir a array con Array.from()
 *   - usar campos reales de StepUpdate: nodeId, nodeType, agentId,
 *     tokenUsage.input/output, costUsd, startedAt, completedAt
 *   - runStatus viene de useRealtimeRun como alias de status
 *   - eliminado AgentCostBadge (dependía de props inexistentes)
 *   - banner de error + botón reconnect cuando SSE/polling falla
 */

import React from 'react';
import { useRealtimeRun } from './useRealtimeRun';

const STATUS_COLOR: Record<string, string> = {
  completed: '#22c55e',
  failed:    '#ef4444',
  running:   '#f59e0b',
  queued:    '#6366f1',
  skipped:   '#9ca3af',
  waiting_approval: '#f97316',
};

function statusDot(status: string): string {
  return STATUS_COLOR[status] ?? '#3a3a5e';
}

function formatDuration(startedAt?: string, completedAt?: string): string | null {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

interface Props { runId: string; }

export function RunStepTimeline({ runId }: Props) {
  const { runStatus, steps, error, reconnect } = useRealtimeRun(runId);

  // Convertir Map<string, StepUpdate> → array ordenado por startedAt
  const stepsArray = Array.from(steps.values()).sort((a, b) => {
    if (!a.startedAt && !b.startedAt) return 0;
    if (!a.startedAt) return 1;
    if (!b.startedAt) return -1;
    return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
  });

  if (error && stepsArray.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', color: '#ef4444', fontSize: 13,
        border: '1px solid #fee2e2', borderRadius: 8, background: '#fff1f2',
      }}>
        <span>SSE error: {error}</span>
        <button
          type="button"
          onClick={() => reconnect()}
          style={{
            marginLeft: 'auto', fontSize: 12, padding: '4px 10px',
            borderRadius: 6, border: '1px solid #fca5a5',
            background: '#fee2e2', color: '#dc2626', cursor: 'pointer',
          }}
        >
          Reconectar
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '8px 0' }}>
      {/* Header con runId y estado general */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 12px' }}>
        <span style={{ fontSize: 13, color: '#888' }}>Run</span>
        <code style={{
          fontSize: 11, color: '#6366f1',
          background: '#1e1e2e', padding: '1px 6px', borderRadius: 4,
        }}>
          {runId.slice(0, 8)}
        </code>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: STATUS_COLOR[runStatus] ?? '#888',
          background: '#1e1e2e', padding: '1px 8px', borderRadius: 10,
        }}>
          {runStatus}
        </span>
        {error && (
          <span style={{ fontSize: 11, color: '#f97316', marginLeft: 4 }}>⚠ polling</span>
        )}
      </div>

      {stepsArray.length === 0 && (
        <div style={{ padding: '12px 16px', color: '#666', fontSize: 13 }}>Waiting for steps…</div>
      )}

      {stepsArray.map((step, idx) => {
        const duration = formatDuration(step.startedAt, step.completedAt);

        return (
          <div
            key={step.stepId}
            style={{
              display: 'flex', gap: 12, padding: '8px 16px',
              borderBottom: '1px solid #2a2a3e',
              background: idx % 2 === 0 ? 'transparent' : '#1a1a2a',
            }}
          >
            {/* Dot + conector vertical */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 16 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: statusDot(step.status),
              }} />
              {idx < stepsArray.length - 1 && (
                <div style={{ width: 1, flex: 1, background: '#3a3a5e', marginTop: 2 }} />
              )}
            </div>

            {/* Contenido del step */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {/* Nombre: agentId si existe, o nodeId */}
                <span style={{ color: '#e0e0f0', fontSize: 13, fontWeight: 500 }}>
                  {step.agentId ?? step.nodeId ?? `Step ${idx + 1}`}
                </span>

                {/* Tipo de nodo */}
                {step.nodeType && (
                  <span style={{
                    fontSize: 11, color: '#888', background: '#2a2a3e',
                    padding: '1px 6px', borderRadius: 4,
                  }}>
                    {step.nodeType}
                  </span>
                )}

                {/* Duración */}
                {duration && (
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{duration}</span>
                )}

                {/* Tokens */}
                {step.tokenUsage && (
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>
                    {step.tokenUsage.input + step.tokenUsage.output} tok
                  </span>
                )}

                {/* Costo */}
                {step.costUsd != null && (
                  <span style={{ fontSize: 11, color: '#a3a3a3' }}>
                    ${step.costUsd.toFixed(4)}
                  </span>
                )}

                {/* Retries */}
                {step.retryCount != null && step.retryCount > 0 && (
                  <span style={{ fontSize: 11, color: '#f97316' }}>
                    ×{step.retryCount} retry
                  </span>
                )}
              </div>

              {/* Error inline */}
              {step.error && (
                <div style={{ marginTop: 4, color: '#ef4444', fontSize: 12 }}>{step.error}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
