/** @deprecated Reemplazado por Approvals.tsx (F6-10). Eliminar en F6-cleanup.
 *
 * PROBLEMAS que motivaron el reemplazo:
 *   1. Usa fetch propio a /runs?status=pending_approval — endpoint no canónico.
 *   2. Usa POST .../resolve — endpoint no existe en api.ts.
 *   3. Tipo PendingApproval local, distinto de RunSpec/RunStep.
 *   4. Dark mode hardcodeado (#1e1e2e) en lugar de design tokens.
 *   5. Estaba huérfano — no montado en ningún shell al momento de F6-10.
 *
 * Ver: apps/web/src/features/operations/components/Approvals.tsx
 */

import React, { useCallback, useEffect, useState } from 'react';

const API = (path: string) => `/api/studio/v1${path}`;

interface PendingApproval {
  runId: string;
  stepId: string;
  agentName?: string;
  message?: string;
  choices?: string[];
  createdAt: string;
}

interface Props {
  pollingIntervalMs?: number;
  onResolved?: (runId: string, decision: string) => void;
}

export function PendingApprovals({ pollingIntervalMs = 5_000, onResolved }: Props) {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch(API('/runs?status=pending_approval'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { runs?: PendingApproval[] };
      setApprovals(data.runs ?? []);
      setError(null);
    } catch (err: unknown) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchApprovals().finally(() => setLoading(false));
    const interval = setInterval(fetchApprovals, pollingIntervalMs);
    return () => clearInterval(interval);
  }, [fetchApprovals, pollingIntervalMs]);

  const resolve = useCallback(
    async (runId: string, stepId: string, decision: string) => {
      setBusy(runId);
      try {
        const res = await fetch(API(`/runs/${runId}/steps/${stepId}/resolve`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setApprovals((prev) => prev.filter((a) => a.runId !== runId || a.stepId !== stepId));
        onResolved?.(runId, decision);
      } catch (err: unknown) {
        setError(String(err));
      } finally {
        setBusy(null);
      }
    },
    [onResolved],
  );

  if (loading && approvals.length === 0) {
    return <div style={{ padding: 16, color: '#888', fontSize: 13 }}>Loading pending approvals…</div>;
  }
  if (error) {
    return <div style={{ padding: 16, color: '#ef4444', fontSize: 13 }}>Error: {error}</div>;
  }
  if (approvals.length === 0) {
    return (
      <div style={{ padding: 24, color: '#666', fontSize: 13, textAlign: 'center' }}>
        ✓ No pending approvals
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#ec4899', marginBottom: 4 }}>
        ⏳ Pending Approvals ({approvals.length})
      </div>

      {approvals.map((a) => (
        <div
          key={`${a.runId}-${a.stepId}`}
          style={{
            background: '#1e1e2e',
            border: '1px solid #ec489933',
            borderLeft: '3px solid #ec4899',
            borderRadius: 8,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: '#e0e0f0', fontSize: 13 }}>
              {a.agentName ?? 'Agent'}
            </span>
            <code style={{ fontSize: 10, color: '#888', background: '#2a2a3e', padding: '1px 5px', borderRadius: 3 }}>
              {a.runId.slice(0, 8)}
            </code>
          </div>

          {a.message && (
            <div style={{ color: '#a0a0b0', fontSize: 12, lineHeight: 1.5 }}>{a.message}</div>
          )}

          <div style={{ color: '#555', fontSize: 11 }}>
            {new Date(a.createdAt).toLocaleString()}
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {(a.choices ?? ['approve', 'reject']).map((choice) => (
              <button
                key={choice}
                disabled={busy === a.runId}
                onClick={() => void resolve(a.runId, a.stepId, choice)}
                style={{
                  flex: 1, padding: '5px 10px', borderRadius: 5,
                  border: 'none',
                  cursor: busy === a.runId ? 'not-allowed' : 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background:
                    choice === 'approve' || choice === 'yes' ? '#22c55e22' : '#ef444422',
                  color:
                    choice === 'approve' || choice === 'yes' ? '#22c55e' : '#ef4444',
                  textTransform: 'capitalize',
                  opacity: busy === a.runId ? 0.6 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {busy === a.runId ? '…' : choice}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
