/**
 * routes/webchat.ts — Rutas SSE + webhook + history para WebChat
 *
 * Rutas públicas (browser → gateway):
 *
 *   GET  /gateway/webchat/:channelId/stream
 *     Abre SSE. Query: ?sessionId=<externalUserId>
 *     El adapter hace fan-out a todas las tabs del mismo sessionId.
 *
 *   POST /gateway/webchat/:channelId/message
 *     El widget envía mensajes. Body: { sessionId, text?, attachments? }
 *     Secuencia correcta:
 *       1. Parsear body
 *       2. Llamar gatewayService.dispatch()  ← corre AgentRunner
 *       3. Cuando dispatch() resuelve, notificar al adapter que el
 *          mensaje fue procesado (resolve del queue)
 *       4. Responder 200 al browser
 *     Timeout: WEBCHAT_QUEUE_TIMEOUT_MS (default 60s)
 *
 *   GET  /gateway/webchat/:channelId/history
 *     El widget lo llama al cargar para rehidratar el historial.
 *     Query: ?sessionId=<externalUserId>
 *     Responde: { ok: true, history: SessionHistoryEntry[] }
 *
 *   POST /gateway/webchat/:channelId/session
 *     El widget obtiene/crea un sessionId persistente.
 *     Body: { fingerprint?: string }   (cualquier string único del browser)
 *     Responde: { ok: true, sessionId: string }
 *     No crea una DB row todavía — solo devuelve un UUID estable basado
 *     en fingerprint (o genera uno nuevo si no hay fingerprint).
 *     La fila GatewaySession se crea en receiveUserMessage() la primera
 *     vez que el usuario envía un mensaje.
 *
 * Ruta interna (JWT requerida, montada en /api/ en server.ts):
 *
 *   POST /api/webchat/:channelId/reply
 *     El FlowEngine llama aquí para enviar respuestas programáticas.
 *     Body: { sessionId, text, buttons? }
 */

import { createHash }               from 'crypto';
import { Router, type Request, type Response } from 'express';
import { registry, WebChatAdapter } from '@agent-vs/gateway-sdk';
import type { GatewayService }      from '../gateway.service';

// ---------------------------------------------------------------------------
// Adapter lookup: always use the shared instance registered in server.ts
// so that the same PrismaClient pool is reused (no per-channel leaks).
// ---------------------------------------------------------------------------

function getAdapter(_channelId: string): WebChatAdapter {
  const adapter = registry.get('webchat');
  if (!adapter || !(adapter instanceof WebChatAdapter)) {
    throw new Error(
      '[webchat] WebChatAdapter not found in registry. ' +
      'Make sure registry.register(new WebChatAdapter(db)) is called in server.ts before mounting routes.',
    );
  }
  return adapter;
}

// ---------------------------------------------------------------------------
// Public gateway routes  (/gateway/webchat/...)
// ---------------------------------------------------------------------------

export function webchatGatewayRouter(gatewayService: GatewayService): Router {
  const router = Router();
  const timeoutMs = Number(process.env.WEBCHAT_QUEUE_TIMEOUT_MS ?? 60_000);

  // ── SSE stream ──────────────────────────────────────────────────────
  router.get('/:channelId/stream', (req: Request, res: Response): void => {
    const adapter = getAdapter(req.params.channelId);
    adapter.createSseHandler()(req, res);
  });

  // ── Inbound message from browser ─────────────────────────────────────
  //
  // FIXED race condition from previous version:
  //   Before: handler() resolved the queue immediately, then dispatch ran
  //           async fire-and-forget → response sent BEFORE agent replied.
  //   Now:    dispatch() runs first (blocking), THEN the queue resolves,
  //           THEN 200 is returned to the browser.
  //
  // This means the POST hangs until the agent finishes (up to timeoutMs).
  // The SSE stream delivers the reply in real-time while the POST is pending.
  // The 200 from POST just confirms the round-trip completed.

  router.post('/:channelId/message', async (req: Request, res: Response): Promise<void> => {
    const { channelId } = req.params;
    const body = req.body as { sessionId?: string; text?: string; attachments?: unknown[] };

    if (!body?.sessionId) {
      res.status(400).json({ ok: false, error: 'sessionId is required' });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // 1. Run the agent (blocks until FlowExecutor finishes)
      await gatewayService.dispatch(
        channelId,
        req.body as Record<string, unknown>,
      );
      clearTimeout(timer);
      res.json({ ok: true });
    } catch (err: unknown) {
      clearTimeout(timer);
      const isTimeout =
        (err instanceof Error && err.message.includes('timeout')) ||
        controller.signal.aborted;

      if (isTimeout) {
        res.status(408).json({ ok: false, error: 'Agent response timeout' });
      } else {
        console.error(`[webchat] dispatch error for channel ${channelId}:`, err);
        res.status(500).json({ ok: false, error: 'Internal error' });
      }
    }
  });

  // ── History rehidration ─────────────────────────────────────────────────
  //
  // Called by the web widget on load to restore conversation history.
  // Returns the last N messages from GatewaySession.messageHistory.

  router.get('/:channelId/history', async (req: Request, res: Response): Promise<void> => {
    const { channelId } = req.params;
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      res.status(400).json({ ok: false, error: 'sessionId query param required' });
      return;
    }

    try {
      const session = await gatewayService.sessions.findSession(channelId, sessionId);
      if (!session) {
        // No session yet — return empty history (widget shows welcome message)
        res.json({ ok: true, history: [] });
        return;
      }
      res.json({ ok: true, history: session.history });
    } catch (err) {
      console.error(`[webchat] history error:`, err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // ── Session bootstrap ────────────────────────────────────────────────────
  //
  // Called by the web widget on first load to get a stable sessionId.
  // Derives a deterministic UUID from the fingerprint so the same browser
  // always gets the same session across page reloads.
  //
  // Security note: sessionId is NOT a secret — it's just a correlation ID.
  // Anyone who knows a sessionId can read that session's history via /history.
  // If you need per-user auth, add Logto JWT middleware to these routes.

  router.post('/:channelId/session', (req: Request, res: Response): void => {
    const body = req.body as { fingerprint?: string };
    const fingerprint = body?.fingerprint;

    let sessionId: string;
    if (fingerprint) {
      // Derive a stable UUID v5-style from channelId + fingerprint
      const hash = createHash('sha256')
        .update(`${req.params.channelId}:${fingerprint}`)
        .digest('hex');
      sessionId = [
        hash.slice(0, 8),
        hash.slice(8,  12),
        '4' + hash.slice(13, 16),      // version 4
        ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20), // variant
        hash.slice(20, 32),
      ].join('-');
    } else {
      // No fingerprint — generate a random UUID
      // The widget should store this in localStorage for persistence
      const { randomUUID } = require('crypto') as { randomUUID: () => string };
      sessionId = randomUUID();
    }

    res.json({ ok: true, sessionId });
  });

  return router;
}

// ---------------------------------------------------------------------------
// Internal API routes  (/api/webchat/...)  — JWT applied in server.ts
// ---------------------------------------------------------------------------

export function webchatApiRouter(gatewayService: GatewayService): Router {
  const router = Router();

  /**
   * POST /api/webchat/:channelId/reply
   * Body: { sessionId: string, text: string, buttons?: [...] }
   *
   * Called by FlowEngine to push a programmatic reply.
   */
  router.post('/:channelId/reply', async (req: Request, res: Response): Promise<void> => {
    const { channelId } = req.params;
    const body = req.body as {
      sessionId?: string;
      text?:      string;
      buttons?:   Array<{ label: string; value: string }>;
    };

    if (!body.sessionId || !body.text) {
      res.status(400).json({ ok: false, error: 'sessionId and text are required' });
      return;
    }

    try {
      const session = await gatewayService.sessions.findSession(
        channelId,
        body.sessionId,
      );

      if (!session) {
        res.status(404).json({ ok: false, error: 'Session not found' });
        return;
      }

      await gatewayService.recordReply(channelId, session.id, {
        externalUserId: body.sessionId,
        text:           body.text,
        buttons:        body.buttons,
      });

      res.json({ ok: true });
    } catch (err) {
      console.error(`[webchat] reply error for channel ${channelId}:`, err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  return router;
}
