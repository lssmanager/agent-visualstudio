/**
 * webchat.adapter.ts — Adaptador WebChat (SSE + HTTP)
 *
 * Expone dos endpoints que el frontend puede consumir:
 *   POST /gateway/webchat/:sessionId/message  → mensaje entrante
 *   GET  /gateway/webchat/:sessionId/stream   → SSE de respuestas
 *
 * El servidor Fastify/Express del gateway monta las rutas usando
 * WebChatAdapter.getRouter().
 *
 * Inspirado en Flowise ChatFlow y n8n WebhookNode.
 */

import { Router, type Request, type Response } from 'express';
import { prisma } from '../../../api/src/modules/core/db/prisma.service';
import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface';

export class WebChatAdapter extends BaseChannelAdapter {
  readonly channel = 'webchat';

  // SSE clients: sessionId → list of Response streams
  private readonly sseClients = new Map<string, Response[]>();

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;
    const config = await prisma.channelConfig.findUnique({
      where: { id: channelConfigId },
    });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);
    this.credentials = config.credentials as Record<string, unknown>;
    console.info(`[webchat] Initialized for config ${channelConfigId}`);
  }

  async dispose(): Promise<void> {
    // Cerrar todos los streams SSE activos
    for (const [sessionId, clients] of this.sseClients) {
      clients.forEach((res) => res.end());
      console.info(`[webchat] Closed ${clients.length} SSE streams for session ${sessionId}`);
    }
    this.sseClients.clear();
  }

  // ── Send ─────────────────────────────────────────────────────────────────

  async send(message: OutgoingMessage): Promise<void> {
    const clients = this.sseClients.get(message.externalId) ?? [];
    const payload = JSON.stringify({
      type: 'message',
      text: message.text,
      richContent: message.richContent ?? null,
      metadata: message.metadata ?? {},
      ts: new Date().toISOString(),
    });

    if (clients.length === 0) {
      // Guardar en DB para que el cliente la recupere en el próximo poll
      await prisma.gatewaySession.update({
        where: {
          channelConfigId_externalId: {
            channelConfigId: this.channelConfigId,
            externalId: message.externalId,
          },
        },
        data: {
          contextWindow: {
            push: { role: 'assistant', content: message.text },
          } as any,
          lastActivityAt: new Date(),
        },
      });
      return;
    }

    // Enviar por SSE a todos los clientes activos de esta sesión
    clients.forEach((res) => {
      res.write(`data: ${payload}\n\n`);
    });
  }

  // ── Express Router ───────────────────────────────────────────────────────

  getRouter(): Router {
    const router = Router();

    // POST /webchat/:sessionId/message — mensaje entrante del usuario
    router.post('/:sessionId/message', async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const { text, metadata } = req.body as {
        text: string;
        metadata?: Record<string, unknown>;
      };

      if (!text?.trim()) {
        res.status(400).json({ ok: false, error: 'text is required' });
        return;
      }

      const msg: IncomingMessage = {
        externalId: sessionId,
        senderId: sessionId,
        text: text.trim(),
        type: 'text',
        metadata,
        receivedAt: this.makeTimestamp(),
      };

      await this.emit(msg);
      res.json({ ok: true });
    });

    // GET /webchat/:sessionId/stream — SSE stream de respuestas
    router.get('/:sessionId/stream', (req: Request, res: Response) => {
      const { sessionId } = req.params;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      if (!this.sseClients.has(sessionId)) {
        this.sseClients.set(sessionId, []);
      }
      this.sseClients.get(sessionId)!.push(res);

      // Heartbeat para mantener la conexión viva
      const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 25_000);

      req.on('close', () => {
        clearInterval(heartbeat);
        const clients = this.sseClients.get(sessionId) ?? [];
        const idx = clients.indexOf(res);
        if (idx !== -1) clients.splice(idx, 1);
      });
    });

    // GET /webchat/:sessionId/history — historial para HTTP polling
    router.get('/:sessionId/history', async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const session = await prisma.gatewaySession.findFirst({
        where: {
          channelConfigId: this.channelConfigId,
          externalId: sessionId,
        },
      });
      res.json({
        ok: true,
        history: (session?.contextWindow as unknown[]) ?? [],
      });
    });

    return router;
  }
}
