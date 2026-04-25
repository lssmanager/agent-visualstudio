/**
 * RunStepTimeline.tsx
 * Timeline de steps de un Run con datos reales via SSE (useRealtimeRun).
 * Muestra estado, tokens, costo y duración por step.
 *
 * Patrones: LangGraph Studio trace panel + Flowise execution log.
 */

import React from 'react';
import { useRealtimeRun } from './useRealtimeRun';
import { AgentCostBadge } from '../agents/AgentCostBadge';

interface Props { runId: string; }

export function RunStepTimeline({ runId }: Props) {
  const { steps, runStatus, error } = useRealtimeRun(runId);

  if (error) {
    return <div style={{ color: '#ef4444', padding: 16 }}>SSE error: {error}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 12px' }}>
        <span style={{ fontSize: 13, color: '#888' }}>Run</span>
        <code style={{ fontSize: 11, color: '#6366f1', background: '#1e1e2e', padding: '1px 6px', borderRadius: 4 }}>
          {runId.slice(0, 8)}
        </code>
        <AgentCostBadge
          status={runStatus as 'idle' | 'running' | 'done' | 'error'}
          compact
        />
      </div>

      {steps.length === 0 && (
        <div style={{ padding: '12px 16px', color: '#666', fontSize: 13 }}>Waiting for steps…</div>
      )}

      {steps.map((step, idx) => (
        <div
          key={step.stepId}
          style={{
            display: 'flex', gap: 12, padding: '8px 16px',
            borderBottom: '1px solid #2a2a3e',
            background: idx % 2 === 0 ? 'transparent' : '#1a1a2a',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 16 }}>
            <div
              style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background:
                  step.status === 'done'    ? '#22c55e' :
                  step.status === 'error'   ? '#ef4444' :
                  step.status === 'running' ? '#f59e0b' : '#3a3a5e',
              }}
            />
            {idx < steps.length - 1 && (
              <div style={{ width: 1, flex: 1, background: '#3a3a5e', marginTop: 2 }} />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: '#e0e0f0', fontSize: 13, fontWeight: 500 }}>
                {step.agentName ?? step.nodeId ?? `Step ${idx + 1}`}
              </span>
              {step.nodeKind && (
                <span style={{ fontSize: 11, color: '#888', background: '#2a2a3e', padding: '1px 6px', borderRadius: 4 }}>
                  {step.nodeKind}
                </span>
              )}
              <AgentCostBadge
                status={step.status as 'idle' | 'running' | 'done' | 'error' | 'pending_approval'}
                tokensUsed={step.tokensUsed}
                costUsd={step.costUsd}
                durationMs={step.durationMs}
                compact
              />
            </div>

            {step.output && (
              <div style={{ marginTop: 4, color: '#a0a0b0', fontSize: 12, lineHeight: 1.5 }}>
                {typeof step.output === 'string'
                  ? step.output.slice(0, 200) + (step.output.length > 200 ? '…' : '')
                  : JSON.stringify(step.output).slice(0, 200)}
              </div>
            )}

            {step.error && (
              <div style={{ marginTop: 4, color: '#ef4444', fontSize: 12 }}>{step.error}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
