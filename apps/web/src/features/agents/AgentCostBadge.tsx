/**
 * AgentCostBadge.tsx
 * Badge que muestra tokens y costo de un agente en un run.
 * Los datos vienen de DB real (via useRealtimeRun o props).
 *
 * Patrón: LangGraph trace metadata + Flowise cost calculation.
 */

import React from 'react';

interface Props {
  tokensUsed?: number;
  costUsd?: number;
  durationMs?: number;
  status?: 'idle' | 'running' | 'done' | 'error' | 'pending_approval';
  compact?: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  idle:             '#64748b',
  running:          '#f59e0b',
  done:             '#22c55e',
  error:            '#ef4444',
  pending_approval: '#ec4899',
};

export function AgentCostBadge({
  tokensUsed, costUsd, durationMs, status = 'idle', compact = false,
}: Props) {
  const color = STATUS_COLOR[status] ?? '#64748b';

  if (compact) {
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: '#1e1e2e', borderRadius: 20, padding: '2px 8px',
          fontSize: 11, color, border: `1px solid ${color}33`,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {status.replace('_', ' ')}
        {tokensUsed !== undefined && (
          <span style={{ color: '#888' }}>{tokensUsed.toLocaleString()} tok</span>
        )}
      </span>
    );
  }

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 2,
        background: '#1e1e2e', borderRadius: 8, padding: '6px 10px',
        fontSize: 12, minWidth: 120, border: `1px solid ${color}44`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <span style={{ color, fontWeight: 600, textTransform: 'capitalize' }}>
          {status.replace('_', ' ')}
        </span>
      </div>
      {tokensUsed !== undefined && (
        <div style={{ color: '#a0a0b0' }}>
          <span style={{ color: '#e0e0f0', fontWeight: 500 }}>{tokensUsed.toLocaleString()}</span> tokens
        </div>
      )}
      {costUsd !== undefined && (
        <div style={{ color: '#a0a0b0' }}>
          <span style={{ color: '#e0e0f0', fontWeight: 500 }}>${costUsd.toFixed(5)}</span>
        </div>
      )}
      {durationMs !== undefined && (
        <div style={{ color: '#a0a0b0' }}>
          <span style={{ color: '#e0e0f0', fontWeight: 500 }}>{(durationMs / 1000).toFixed(2)}s</span>
        </div>
      )}
    </div>
  );
}
