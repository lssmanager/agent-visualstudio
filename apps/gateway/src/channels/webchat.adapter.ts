/**
 * webchat.adapter.ts — Adaptador WebChat (SSE + HTTP)
 *
 * Expone dos endpoints que el frontend puede consumir:
 *   POST /gateway/webchat/:sessionId/message  → mensaje entrante
 *   GET  /gateway/webchat/:sessionId/stream   → SSE de respuestas
 *
 * Inspirado en Flowise ChatFlow y n8n WebhookNode.
 */

import { Router, type Request, type Response } from 'express';
import { getPrisma } from '../../lib/prisma.js';
import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface';

export class WebChatAdapter extends BaseChannelAdapter {
  readonly channel = 'webchat';

  private readonly sseClients = new Map<string, Response[]>();

  // ── Lifecycle ─────────────────────────────────────────────────────────────────────

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;
    const db     = getPrisma();
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);
    this.credentials = config.credentials as Record<string, unknown>;
    console.info(`[webchat] Initialized for config ${channelConfigId}`);
  }

  async dispose(): Promise<void> {
    for (const [sessionId, clients] of this.sseClients) {
      clients.forEach((res) => res.end());
      console.info(`[webchat] Closed ${clients.length} SSE streams for session ${sessionId}`);
    }
    this.sseClients.clear();
  }

  // ── Send ────────────────────────────────────────────────────────────────────────

  async send(message: OutgoingMessage): Promise<void> {
    const db      = getPrisma();
    const clients = this.sseClients.get(message.externalId) ?? [];
    const payload = JSON.stringify({
      type:        'message',
      text:        message.text,
      richContent: message.richContent ?? null,
      metadata:    message.metadata    ?? {},
      ts:          new Date().toISOString(),
    });

    if (clients.length === 0) {
      await db.gatewaySession.update({
        where: {
          channelConfigId_externalId: {
            channelConfigId: this.channelConfigId,
            externalId:      message.externalId,
          },
        },
        data: {
          contextWindow:  { push: { role: 'assistant', content: message.text } } as any,
          lastActivityAt: new Date(),
        },
      });
      return;
    }

    clients.forEach((res) => { res.write(`data: ${payload}\n\n`); });
  }

  // ── Express Router ────────────────────────────────────────────────────────────────

  getRouter(): Router {
    const router = Router();

    router.post('/:sessionId/message', async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const { text, metadata } = req.body as { text: string; metadata?: Record<string, unknown> };

      if (!text?.trim()) {
        res.status(400).json({ ok: false, error: 'text is required' });
        return;
      }

      const msg: IncomingMessage = {
        externalId: sessionId,
        senderId:   sessionId,
        text:       text.trim(),
        type:       'text',
        metadata,
        receivedAt: this.makeTimestamp(),
      };

      await this.emit(msg);
      res.json({ ok: true });
    });

    router.get('/:sessionId/stream', (req: Request, res: Response) => {
      const { sessionId } = req.params;

      res.setHeader('Content-Type',    'text/event-stream');
      res.setHeader('Cache-Control',   'no-cache');
      res.setHeader('Connection',      'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      if (!this.sseClients.has(sessionId)) this.sseClients.set(sessionId, []);
      this.sseClients.get(sessionId)!.push(res);

      const heartbeat = setInterval(() => { res.write(': heartbeat\n\n'); }, 25_000);

      req.on('close', () => {
        clearInterval(heartbeat);
        const list = this.sseClients.get(sessionId) ?? [];
        const idx  = list.indexOf(res);
        if (idx !== -1) list.splice(idx, 1);
      });
    });

    router.get('/:sessionId/history', async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const db      = getPrisma();
      const session = await db.gatewaySession.findFirst({
        where: { channelConfigId: this.channelConfigId, externalId: sessionId },
      });
      res.json({ ok: true, history: (session?.contextWindow as unknown[]) ?? [] });
    });

    return router;
  }
}
