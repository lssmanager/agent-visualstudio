/**
 * useChannelStatus.ts — [F3a-37]
 *
 * Hook que abre un EventSource a /api/channels/:id/status/stream
 * y devuelve el estado en tiempo real del canal.
 *
 * Eventos SSE esperados del backend:
 *   event: channel:status   data: ChannelStatusEvent (JSON)
 *   event: channel:error    data: ChannelErrorEvent  (JSON)
 *   event: ping             data: {"ts": "ISO"}
 *
 * Reconexión: exponencial con jitter, máximo 30s, se detiene
 * al hacer cleanup (unmount o cuando channelId cambia).
 *
 * Si el backend no soporta SSE todavía, cae a polling
 * cada POLL_INTERVAL_MS con testChannel().
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChannelLiveStatus,
  ChannelStatusEvent,
  ChannelErrorEvent,
} from '../types';

const SSE_ENDPOINT     = (id: string) => `/api/channels/${id}/status/stream`;
const MAX_RETRY_MS     = 30_000;
const BASE_RETRY_MS    = 1_000;
const POLL_INTERVAL_MS = 15_000;

function jitter(ms: number) {
  return ms + Math.random() * ms * 0.3;
}

interface UseChannelStatusOptions {
  /** Habilitar fallback a polling si SSE no disponible. Default: true */
  pollFallback?: boolean;
  /** Callback de polling (testChannel) — solo necesario si pollFallback=true */
  onPoll?: (id: string) => Promise<{ ok: boolean; latency: number; message: string }>;
}

export function useChannelStatus(
  channelId: string | null,
  opts: UseChannelStatusOptions = {},
): ChannelLiveStatus {
  const { pollFallback = true, onPoll } = opts;

  const [liveStatus, setLiveStatus] = useState<ChannelLiveStatus>({
    sseState:      'connecting',
    sseError:      null,
    channelStatus: null,
    reconnectIn:   null,
    attemptCount:  0,
  });

  const esRef          = useRef<EventSource | null>(null);
  const retryTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptRef     = useRef(0);
  const closedRef      = useRef(false);

  const clearTimers = useCallback(() => {
    if (retryTimerRef.current)  clearTimeout(retryTimerRef.current);
    if (pollTimerRef.current)   clearInterval(pollTimerRef.current);
    if (countdownRef.current)   clearInterval(countdownRef.current);
    retryTimerRef.current  = null;
    pollTimerRef.current   = null;
    countdownRef.current   = null;
  }, []);

  const startCountdown = useCallback((totalMs: number) => {
    let remaining = Math.ceil(totalMs / 1000);
    setLiveStatus(prev => ({ ...prev, reconnectIn: remaining }));
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownRef.current!);
        countdownRef.current = null;
        setLiveStatus(prev => ({ ...prev, reconnectIn: null }));
      } else {
        setLiveStatus(prev => ({ ...prev, reconnectIn: remaining }));
      }
    }, 1000);
  }, []);

  const startPolling = useCallback(() => {
    if (!channelId || !onPoll || !pollFallback) return;
    clearInterval(pollTimerRef.current!);

    const poll = async () => {
      if (!channelId) return;
      try {
        const result = await onPoll(channelId);
        setLiveStatus(prev => ({
          ...prev,
          sseState: 'connected',
          channelStatus: {
            channelId,
            connected:      result.ok,
            latencyMs:      result.latency,
            messagesPerMin: 0,
            lastError:      result.ok ? null : result.message,
            lastErrorAt:    result.ok ? null : new Date().toISOString(),
            updatedAt:      new Date().toISOString(),
          },
        }));
      } catch {
        setLiveStatus(prev => ({
          ...prev,
          sseState: 'error',
          sseError: 'Error en polling',
        }));
      }
    };

    void poll();
    pollTimerRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
  }, [channelId, onPoll, pollFallback]);

  const connect = useCallback(() => {
    if (!channelId || closedRef.current) return;

    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    if (typeof EventSource === 'undefined') {
      setLiveStatus(prev => ({
        ...prev,
        sseState:    'error',
        sseError:    'SSE no disponible — usando polling',
        reconnectIn: null,
      }));
      startPolling();
      return;
    }

    setLiveStatus(prev => ({
      ...prev,
      sseState:     attemptRef.current > 0 ? 'reconnecting' : 'connecting',
      sseError:     null,
      attemptCount: attemptRef.current,
    }));

    const es = new EventSource(SSE_ENDPOINT(channelId), { withCredentials: true });
    esRef.current = es;

    es.addEventListener('channel:status', (ev: MessageEvent<string>) => {
      try {
        const data = JSON.parse(ev.data) as ChannelStatusEvent;
        attemptRef.current = 0;
        setLiveStatus(prev => ({
          ...prev,
          sseState:      'connected',
          sseError:      null,
          channelStatus: data,
          reconnectIn:   null,
          attemptCount:  0,
        }));
      } catch { /* malformed — ignore */ }
    });

    es.addEventListener('channel:error', (ev: MessageEvent<string>) => {
      try {
        const data = JSON.parse(ev.data) as ChannelErrorEvent;
        setLiveStatus(prev => ({
          ...prev,
          channelStatus: prev.channelStatus
            ? {
                ...prev.channelStatus,
                lastError:   data.message,
                lastErrorAt: data.timestamp,
                connected:   data.recoverable ? prev.channelStatus.connected : false,
              }
            : null,
        }));
      } catch { /* ignore */ }
    });

    es.addEventListener('ping', () => {
      setLiveStatus(prev =>
        prev.sseState === 'connected' ? prev : { ...prev, sseState: 'connected' },
      );
    });

    es.onopen = () => {
      attemptRef.current = 0;
      clearTimers();
      setLiveStatus(prev => ({
        ...prev,
        sseState:     'connected',
        sseError:     null,
        reconnectIn:  null,
        attemptCount: 0,
      }));
    };

    es.onerror = () => {
      if (closedRef.current) return;

      es.close();
      esRef.current = null;

      const attempt = ++attemptRef.current;
      const delay   = Math.min(jitter(BASE_RETRY_MS * Math.pow(2, attempt - 1)), MAX_RETRY_MS);

      setLiveStatus(prev => ({
        ...prev,
        sseState:     'reconnecting',
        sseError:     `Conexión perdida — reintentando (intento ${attempt})`,
        attemptCount: attempt,
      }));

      startCountdown(delay);

      retryTimerRef.current = setTimeout(() => {
        if (!closedRef.current) connect();
      }, delay);
    };
  }, [channelId, clearTimers, startCountdown, startPolling]);

  useEffect(() => {
    if (!channelId) {
      setLiveStatus({
        sseState:      'closed',
        sseError:      null,
        channelStatus: null,
        reconnectIn:   null,
        attemptCount:  0,
      });
      return;
    }

    closedRef.current  = false;
    attemptRef.current = 0;
    connect();

    return () => {
      closedRef.current = true;
      clearTimers();
      esRef.current?.close();
      esRef.current = null;
    };
  }, [channelId, connect, clearTimers]);

  return liveStatus;
}
