/**
 * webchat.adapter.ts — Adaptador WebChat (HTTP + SSE)
 *
 * Endpoints:
 *   POST /gateway/webchat/:sessionId/message  → mensaje entrante
 *   GET  /gateway/webchat/:sessionId/stream   → SSE de respuestas
 *
 * El servidor Express del gateway monta las rutas usando
 * WebChatAdapter.getRouter().
 *
 * Inspirado en Flowise ChatFlow y n8n WebhookNode.
 */

import { Router, type Request, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import {
  BaseChannelAdapter,
  type ChannelType,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface';

export class WebChatAdapter extends BaseChannelAdapter {
  readonly channel = 'webchat' as const satisfies ChannelType;

  private readonly sseClients = new Map<string, Response[]>();

  constructor(private readonly db: PrismaClient) {
    super();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────────────────────

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;
    const config = await this.db.channelConfig.findUnique({
      where: { id: channelConfigId },
    });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);
    this.credentials = config.credentials as Record<string, unknown>;
    console.info(`[webchat] Initialized channelConfigId=${channelConfigId}`);
  }

  async dispose(): Promise<void> {
    for (const clients of this.sseClients.values()) {
      for (const res of clients) {
        try { res.end(); } catch { /* ignore */ }
      }
    }
    this.sseClients.clear();
  }

  // ── Send ───────────────────────────────────────────────────────────────────────────────────

  async send(message: OutgoingMessage): Promise<void> {
    const clients = this.sseClients.get(message.externalId) ?? [];

    const payload = JSON.stringify({
      text:        message.text,
      type:        message.type ?? 'text',
      richContent: message.richContent ?? null,
      ts:          new Date().toISOString(),
    });

    if (clients.length > 0) {
      for (const client of clients) {
        try {
          client.write(`data: ${payload}\n\n`);
        } catch {
          // client disconnected
        }
      }
      return;
    }

    await this.db.gatewaySession.update({
      where: {
        channelConfigId_externalId: {
          channelConfigId: this.channelConfigId,
          externalId:      message.externalId,
        },
      },
      data: {
        pendingMessages: {
          push: payload,
        },
      },
    });
  }

  // ── Express Router ───────────────────────────────────────────────────────────────────────────

  getRouter(): Router {
    const router = Router();

    // POST /:sessionId/message — mensaje entrante del widget
    router.post('/:sessionId/message', async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const { text, metadata } = req.body as { text: string; metadata?: Record<string, unknown> };

      if (!text?.trim()) {
        res.status(400).json({ ok: false, error: 'text required' });
        return;
      }

      const msg: IncomingMessage = {
        channelConfigId: this.channelConfigId,
        channelType:     'webchat',
        externalId:      sessionId,
        senderId:        sessionId,
        text:            text.trim(),
        type:            'text',
        metadata,
        receivedAt:      this.makeTimestamp(),
      };

      await this.emit(msg);
      res.json({ ok: true });
    });

    // GET /:sessionId/stream — SSE stream
    router.get('/:sessionId/stream', (req: Request, res: Response) => {
      const { sessionId } = req.params;

      res.setHeader('Content-Type',  'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection',    'keep-alive');
      res.flushHeaders();

      const clients = this.sseClients.get(sessionId) ?? [];
      clients.push(res);
      this.sseClients.set(sessionId, clients);

      req.on('close', () => {
        const updated = (this.sseClients.get(sessionId) ?? []).filter((c) => c !== res);
        if (updated.length === 0) {
          this.sseClients.delete(sessionId);
        } else {
          this.sseClients.set(sessionId, updated);
        }
      });
    });

    // GET /:sessionId/history — historial para HTTP polling
    router.get('/:sessionId/history', async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const session = await this.db.gatewaySession.findFirst({
        where: {
          channelConfigId: this.channelConfigId,
          externalId: sessionId,
        },
      });
      res.json({ ok: true, messages: session?.pendingMessages ?? [] });
    });

    return router;
  }
}
