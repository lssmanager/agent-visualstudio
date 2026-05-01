/**
 * server.ts — Gateway Express Application
 *
 * Monta todos los routers de canal y expone:
 *
 *   GET  /healthz
 *
 *   — WebChat (browser ↔ agente) —
 *   GET  /gateway/webchat/:channelId/stream
 *   POST /gateway/webchat/:channelId/message
 *   GET  /gateway/webchat/:channelId/history
 *   POST /gateway/webchat/:channelId/session
 *
 *   — Telegram —
 *   POST /gateway/telegram/:channelId
 *
 *   — Slack —
 *   POST /gateway/slack/:channelId
 *
 *   — Webhook genérico —
 *   POST /gateway/webhook/:channelId
 *   GET  /gateway/webhook/:channelId/health
 *
 *   — API interna (JWT requerida) —
 *   POST /api/webchat/:channelId/reply
 *   *    /api/channels/...
 *
 * Inspirado en Flowise Server y n8n WebhookServer.
 */

import express, { type Application } from 'express';
import type { PrismaClient }          from '@prisma/client';
import { PrismaService }              from './prisma/prisma.service.js';
import { AgentResolverService }       from './agent-resolver.service.js';
import { GatewayService }             from './gateway.service.js';
import { webchatGatewayRouter, webchatApiRouter } from './routes/webchat.js';
import { telegramRouter }             from './routes/telegram.js';
import { slackRouter }                from './routes/slack.js';
import { webhookRouter }              from './routes/webhook.js';
import { channelsApiRouter }          from './routes/channels.js';

// ---------------------------------------------------------------------------
// AppOptions — permite inyectar mocks en tests
// ---------------------------------------------------------------------------

export interface AppOptions {
  /** PrismaService o mock compatible con PrismaClient (testing) */
  db?: PrismaService | PrismaClient;
}

// ---------------------------------------------------------------------------
// createApp
// ---------------------------------------------------------------------------

export function createApp(opts: AppOptions = {}): Application {
  const app = express();

  // Instanciar PrismaService (o usar el mock inyectado)
  const db = (opts.db ?? new PrismaService()) as PrismaService;

  // GatewayService recibe PrismaService + AgentResolverService
  const resolver       = new AgentResolverService(db);
  const gatewayService = new GatewayService(db, resolver);

  // -------------------------------------------------------------------------
  // 0. Core middleware
  // -------------------------------------------------------------------------
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // -------------------------------------------------------------------------
  // 1. Security headers — van ANTES de montar rutas para cubrir todas las
  //    respuestas, incluidas las de los channel adapters y la API interna.
  // -------------------------------------------------------------------------
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // -------------------------------------------------------------------------
  // 2. Health check
  // -------------------------------------------------------------------------
  app.get('/healthz', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // -------------------------------------------------------------------------
  // 3. Gateway public routes — cada canal tiene su router dedicado.
  //    Los adaptadores son singletons gestionados por gateway-sdk registry;
  //    no se instancian ni registran manualmente aquí.
  // -------------------------------------------------------------------------
  app.use('/gateway/webchat',  webchatGatewayRouter(gatewayService));
  app.use('/gateway/telegram', telegramRouter(gatewayService));
  app.use('/gateway/slack',    slackRouter(gatewayService));
  app.use('/gateway/webhook',  webhookRouter(gatewayService));

  // -------------------------------------------------------------------------
  // 4. Internal API routes (JWT middleware a aplicar aquí si se requiere)
  // -------------------------------------------------------------------------
  app.use('/api/webchat',  webchatApiRouter(gatewayService));
  app.use('/api/channels', channelsApiRouter(db, gatewayService));

  // -------------------------------------------------------------------------
  // 5. 404 fallback
  // -------------------------------------------------------------------------
  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Not found' });
  });

  return app;
}
