/**
 * useRealtimeRun.ts
 *
 * React hook for consuming SSE run updates in real time.
 *
 * Patterns adapted from:
 *   - Flowise: useStreamChat hook (EventSource consumer)
 *   - n8n: useExecutionStream composable
 *   - LangGraph JS: streamEvents() consumer
 *   - Semantic Kernel: StreamingKernelContent client
 *
 * Usage:
 *   const { events, status, steps } = useRealtimeRun(runId);
 *
 * Automatically:
 *   - Opens EventSource on mount
 *   - Closes on terminal event (completed/failed/cancelled)
 *   - Reconnects on transient disconnect (exponential backoff)
 *   - Cleans up on unmount
 */
import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export type RunStreamEvent = {
  event: string;
  [key: string]: unknown;
};

export type RealtimeRunStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'error';

export interface StepUpdate {
  stepId: string;
  nodeId: string;
  nodeType?: string;
  agentId?: string;
  status: string;
  costUsd?: number;
  tokenUsage?: { input: number; output: number };
  startedAt?: string;
  completedAt?: string;
}

export interface UseRealtimeRunResult {
  status: RealtimeRunStatus;
  events: RunStreamEvent[];
  steps: Map<string, StepUpdate>;
  lastEvent: RunStreamEvent | null;
  error: string | null;
  reconnect: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TERMINAL_EVENTS = new Set(['completed', 'failed', 'cancelled']);
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_MS = 1_000;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRealtimeRun(
  runId: string | null | undefined,
  options?: {
    /** API base URL — defaults to VITE_API_BASE_URL or window.location.origin */
    apiBase?: string;
    /** Called on each SSE event */
    onEvent?: (event: RunStreamEvent) => void;
    /** Max events to keep in state (prevents memory leak on long runs) */
    maxEvents?: number;
  },
): UseRealtimeRunResult {
  const apiBase =
    options?.apiBase ??
    (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL) ??
    '';
  const maxEvents = options?.maxEvents ?? 500;

  const [status, setStatus] = useState<RealtimeRunStatus>('idle');
  const [events, setEvents] = useState<RunStreamEvent[]>([]);
  const [steps, setSteps] = useState<Map<string, StepUpdate>>(new Map());
  const [lastEvent, setLastEvent] = useState<RunStreamEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  const cleanup = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!runId || !isMounted.current) return;

    cleanup();
    setStatus('connecting');
    setError(null);

    const url = `${apiBase}/api/studio/v1/runs/${runId}/stream`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      if (!isMounted.current) return;
      reconnectAttempt.current = 0;
      setStatus('connected');
    };

    es.onmessage = (msgEvent) => {
      if (!isMounted.current) return;

      let payload: RunStreamEvent;
      try {
        payload = JSON.parse(msgEvent.data as string) as RunStreamEvent;
      } catch {
        return;
      }

      setLastEvent(payload);
      setEvents((prev) => {
        const next = [...prev, payload];
        return next.length > maxEvents ? next.slice(-maxEvents) : next;
      });

      options?.onEvent?.(payload);

      // Update status
      if (payload.event === 'queued') setStatus('queued');
      else if (payload.event === 'started') setStatus('processing');
      else if (payload.event === 'completed') setStatus('completed');
      else if (payload.event === 'failed') setStatus('failed');
      else if (payload.event === 'cancelled') setStatus('cancelled');

      // Update step map (LangGraph stream node output pattern)
      if (payload.event?.startsWith('step:') && typeof payload.stepId === 'string') {
        setSteps((prev) => {
          const next = new Map(prev);
          const existing = next.get(payload.stepId as string) ?? ({} as StepUpdate);
          next.set(payload.stepId as string, {
            ...existing,
            stepId: payload.stepId as string,
            nodeId: (payload.nodeId as string) ?? existing.nodeId,
            nodeType: (payload.nodeType as string | undefined) ?? existing.nodeType,
            agentId: (payload.agentId as string | undefined) ?? existing.agentId,
            status: (payload.status as string) ?? existing.status,
            costUsd: (payload.costUsd as number | undefined) ?? existing.costUsd,
            tokenUsage: (payload.tokenUsage as StepUpdate['tokenUsage']) ?? existing.tokenUsage,
            startedAt: (payload.startedAt as string | undefined) ?? existing.startedAt,
            completedAt: (payload.completedAt as string | undefined) ?? existing.completedAt,
          });
          return next;
        });
      }

      // Auto-close on terminal events
      if (TERMINAL_EVENTS.has(payload.event)) {
        cleanup();
      }
    };

    es.onerror = () => {
      if (!isMounted.current) return;

      cleanup();
      setStatus('error');
      setError('SSE connection lost');

      // Exponential backoff reconnect
      if (reconnectAttempt.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = BASE_RECONNECT_MS * 2 ** reconnectAttempt.current;
        reconnectAttempt.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };
  }, [runId, apiBase, maxEvents, options, cleanup]);

  useEffect(() => {
    isMounted.current = true;
    if (runId) connect();
    return () => {
      isMounted.current = false;
      cleanup();
    };
  }, [runId, connect, cleanup]);

  return { status, events, steps, lastEvent, error, reconnect: connect };
}
