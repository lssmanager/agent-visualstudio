/**
 * routes/webchat.ts — Rutas SSE + webhook para WebChat
 *
 * GET  /gateway/webchat/:channelId/stream
 *   Abre una conexión SSE. El browser pasa ?sessionId=<externalUserId>.
 *   El adapter hace fan-out a todas las tabs del mismo sessionId.
 *
 * POST /gateway/webchat/:channelId/message
 *   El widget del browser envía mensajes aquí.
 *   Body: { sessionId: string, text?: string, attachments?: [...] }
 *   Responde 200 cuando el gateway procesó el mensaje, 408 si timeout.
 *
 * POST /api/webchat/:channelId/reply   (ruta interna — requiere JWT)
 *   El agente (o el FlowEngine) llama aquí para enviar una respuesta
 *   al browser. Body: { sessionId: string, text: string, ... }
 *   Esta ruta NO está en el router de este archivo; se registra en
 *   server.ts bajo /api/ con logtoJwtMiddleware().
 */

import { Router, type Request, type Response } from 'express';
import { WebChatAdapter } from '@agent-vs/gateway-sdk';
import type { GatewayService } from '../gateway.service';

/**
 * Map of channelId → WebChatAdapter instance.
 * One adapter per ChannelConfig row — keeps SSE subscriber maps isolated
 * between different deployments / workspaces.
 */
const adapterCache = new Map<string, WebChatAdapter>();

function getAdapter(channelId: string): WebChatAdapter {
  if (!adapterCache.has(channelId)) {
    adapterCache.set(channelId, new WebChatAdapter());
  }
  return adapterCache.get(channelId)!;
}

// ---------------------------------------------------------------------------
// Public gateway routes  (/gateway/webchat/...)
// ---------------------------------------------------------------------------

export function webchatGatewayRouter(gatewayService: GatewayService): Router {
  const router = Router();

  // --- SSE stream ---
  router.get('/:channelId/stream', (req: Request, res: Response): void => {
    const adapter = getAdapter(req.params.channelId);
    // Inject channelId into query so the adapter can extract sessionId
    // The adapter reads req.query.sessionId via createSseHandler()
    adapter.createSseHandler()(req, res);
  });

  // --- Inbound message from browser ---
  router.post('/:channelId/message', (req: Request, res: Response): void => {
    const { channelId } = req.params;
    const adapter = getAdapter(channelId);

    // Use the adapter's webhook handler which enqueues and waits for processing
    const handler = adapter.createWebhookHandler();
    handler(req, res).then(async () => {
      // After the handler enqueues, dispatch to the gateway service
      const body = req.body as { sessionId?: string; text?: string };
      if (body?.sessionId) {
        await gatewayService
          .dispatch(channelId, req.body as Record<string, unknown>)
          .catch((err: unknown) => {
            console.error(`[webchat] dispatch error for channel ${channelId}:`, err);
          });
      }
    }).catch((err: unknown) => {
      console.error(`[webchat] handler error:`, err);
    });
  });

  return router;
}

// ---------------------------------------------------------------------------
// Internal API routes  (/api/webchat/...)  — requires JWT (applied in server.ts)
// ---------------------------------------------------------------------------

export function webchatApiRouter(gatewayService: GatewayService): Router {
  const router = Router();

  /**
   * POST /api/webchat/:channelId/reply
   * Body: { sessionId: string, text: string, attachments?: [...], buttons?: [...] }
   *
   * Called by the agent runtime (FlowEngine) to push a reply to the browser.
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
      // Resolve the GatewaySession to get its DB id
      const session = await (gatewayService as unknown as {
        sessions: { findSession: (c: string, u: string) => Promise<{ id: string } | null> };
      }).sessions.findSession(channelId, body.sessionId);

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
