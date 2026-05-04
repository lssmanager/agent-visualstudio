/**
 * useRealtimeRun.ts
 *
 * React hook for consuming SSE run updates in real time.
 * Falls back to polling if SSE is unavailable (no /runs/stream endpoint).
 *
 * Patterns adapted from:
 *   - Flowise: useStreamChat hook (EventSource consumer)
 *   - n8n: useExecutionStream composable
 *   - LangGraph JS: streamEvents() consumer
 *   - Semantic Kernel: StreamingKernelContent client
 *
 * Usage:
 *   const { events, status, runStatus, steps } = useRealtimeRun(runId);
 *
 * Automatically:
 *   - Attempts SSE first; falls back to polling (2 500 ms) if SSE fails
 *   - Closes on terminal event (completed/failed/cancelled)
 *   - Reconnects on transient disconnect (exponential backoff, max 5 attempts)
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

/** Campos reales de StepUpdate — alineados con RunStep de core-types/run-spec */
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
  error?: string;
  retryCount?: number;
}

export interface UseRealtimeRunResult {
  /** Estado actual de la conexión SSE / polling */
  status: RealtimeRunStatus;
  /**
   * Alias de `status` — mantenido para compatibilidad con RunStepTimeline
   * y otros consumidores que usen el nombre `runStatus`.
   */
  runStatus: RealtimeRunStatus;
  events: RunStreamEvent[];
  /** Mapa stepId → StepUpdate con los campos reales de RunStep */
  steps: Map<string, StepUpdate>;
  lastEvent: RunStreamEvent | null;
  error: string | null;
  reconnect: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TERMINAL_EVENTS = new Set(['completed', 'failed', 'cancelled']);
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_MS = 1_000;
const POLL_INTERVAL_MS = 2_500;

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
  // true cuando SSE falló y estamos en modo polling
  const [pollingMode, setPollingMode] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    stopPolling();
  }, [stopPolling]);

  // ── Polling fallback ───────────────────────────────────────────────────────
  // Llama a GET /runs/:runId y sintetiza StepUpdate desde RunSpec.steps

  const startPolling = useCallback(() => {
    if (!runId || !isMounted.current) return;
    setPollingMode(true);
    setStatus('connected'); // polling activo = conexión funcional

    const fetchRun = async () => {
      try {
        const res = await fetch(`${apiBase}/api/studio/v1/runs/${runId}`);
        if (!res.ok) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const run = await res.json() as any;
        if (!isMounted.current) return;

        // Mapear RunSpec.steps[] → Map<stepId, StepUpdate>
        if (Array.isArray(run.steps)) {
          setSteps(() => {
            const next = new Map<string, StepUpdate>();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const s of run.steps as any[]) {
              next.set(s.id as string, {
                stepId: s.id as string,
                nodeId: (s.nodeId as string) ?? '',
                nodeType: s.nodeType as string | undefined,
                agentId: s.agentId as string | undefined,
                status: s.status as string,
                costUsd: s.costUsd as number | undefined,
                tokenUsage: s.tokenUsage as { input: number; output: number } | undefined,
                startedAt: s.startedAt as string | undefined,
                completedAt: s.completedAt as string | undefined,
                error: s.error as string | undefined,
                retryCount: s.retryCount as number | undefined,
              });
            }
            return next;
          });
        }

        // Actualizar status general desde RunSpec.status
        const runStatus = run.status as string;
        if (runStatus === 'queued') setStatus('queued');
        else if (runStatus === 'running') setStatus('processing');
        else if (runStatus === 'completed') setStatus('completed');
        else if (runStatus === 'failed') setStatus('failed');
        else if (runStatus === 'cancelled') setStatus('cancelled');

        // Detener polling si el run terminó
        if (TERMINAL_EVENTS.has(runStatus)) {
          stopPolling();
        }
      } catch {
        // silencioso — el polling reintentará en el siguiente tick
      }
    };

    void fetchRun();
    pollTimer.current = setInterval(() => void fetchRun(), POLL_INTERVAL_MS);
  }, [runId, apiBase, stopPolling]);

  // ── SSE connection ─────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    if (!runId || !isMounted.current) return;

    cleanup();
    setStatus('connecting');
    setError(null);
    setPollingMode(false);

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

      // Actualizar status
      if (payload.event === 'queued') setStatus('queued');
      else if (payload.event === 'started') setStatus('processing');
      else if (payload.event === 'completed') setStatus('completed');
      else if (payload.event === 'failed') setStatus('failed');
      else if (payload.event === 'cancelled') setStatus('cancelled');

      // Actualizar step map — campos reales de StepUpdate / RunStep
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
            error: (payload.error as string | undefined) ?? existing.error,
            retryCount: (payload.retryCount as number | undefined) ?? existing.retryCount,
          });
          return next;
        });
      }

      // Cerrar SSE en eventos terminales
      if (TERMINAL_EVENTS.has(payload.event)) {
        cleanup();
      }
    };

    es.onerror = () => {
      if (!isMounted.current) return;

      cleanup();
      setError('SSE connection lost');

      if (reconnectAttempt.current < MAX_RECONNECT_ATTEMPTS) {
        // Reintento con backoff exponencial
        const delay = BASE_RECONNECT_MS * 2 ** reconnectAttempt.current;
        reconnectAttempt.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      } else {
        // SSE agotó reintentos → cambiar a modo polling
        setStatus('error');
        startPolling();
      }
    };
  }, [runId, apiBase, maxEvents, options, cleanup, startPolling]);

  useEffect(() => {
    isMounted.current = true;
    if (runId) connect();
    return () => {
      isMounted.current = false;
      cleanup();
    };
  }, [runId, connect, cleanup]);

  return {
    status,
    runStatus: status, // alias para compatibilidad con RunStepTimeline
    events,
    steps,
    lastEvent,
    error,
    reconnect: connect,
  };
}
