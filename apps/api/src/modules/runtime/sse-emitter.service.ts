/**
 * sse-emitter.service.ts
 *
 * Server-Sent Events (SSE) bus for real-time run updates.
 *
 * Patterns adapted from:
 *   - Flowise: SSEOutputParser + /api/v1/prediction/:id/stream
 *   - n8n: /executions/:id/stream (EventSource)
 *   - LangGraph: .stream() async iterator with event types
 *   - Semantic Kernel: StreamingChatMessageContent
 *
 * Usage:
 *   1. SseEmitterService.emit(runId, payload) — push event to all
 *      subscribers of that runId
 *   2. GET /runs/:id/stream — SSE endpoint registered in runs.controller
 *   3. Frontend useRealtimeRun() hook subscribes to this endpoint
 */
import type { Request, Response } from 'express';
import { EventEmitter } from 'node:events';

export interface SseEvent {
  event: string;
  [key: string]: unknown;
}

// One global bus — singleton per API process
const globalBus = new EventEmitter();
globalBus.setMaxListeners(200); // Support up to 200 concurrent SSE clients

export class SseEmitterService {
  /**
   * Emit an event to all SSE subscribers watching runId.
   * Called by RunQueueService and AgentExecutorService.
   */
  emit(runId: string, payload: SseEvent): void {
    globalBus.emit(`run:${runId}`, payload);
  }

  /**
   * Register an Express route handler for SSE streaming.
   *
   * GET /runs/:id/stream
   *
   * Client receives events like:
   *   data: {"event":"queued","jobId":"run-abc","enqueuedAt":"..."}
   *   data: {"event":"started","startedAt":"..."}
   *   data: {"event":"step:completed","stepId":"...","costUsd":0.002}
   *   data: {"event":"completed","status":"completed"}
   */
  streamHandler(req: Request, res: Response): void {
    const { id: runId } = req.params;

    // SSE headers — disable buffering for Nginx/Coolify proxy
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx passthrough
    res.flushHeaders();

    // Heartbeat every 15s to keep connection alive through proxies
    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 15_000);

    // Send initial connection event
    this._send(res, { event: 'connected', runId, connectedAt: new Date().toISOString() });

    // Subscribe to run events
    const listener = (payload: SseEvent) => {
      this._send(res, payload);

      // Auto-close stream on terminal events
      if (['completed', 'failed', 'cancelled'].includes(payload.event)) {
        cleanup();
      }
    };

    const channel = `run:${runId}`;
    globalBus.on(channel, listener);

    const cleanup = () => {
      clearInterval(heartbeat);
      globalBus.off(channel, listener);
      res.end();
    };

    // Client disconnect
    req.on('close', cleanup);
    req.on('aborted', cleanup);
  }

  private _send(res: Response, payload: SseEvent): void {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // Client disconnected mid-write — silently ignore
    }
  }
}

// Singleton instance shared across services
export const sseEmitter = new SseEmitterService();
