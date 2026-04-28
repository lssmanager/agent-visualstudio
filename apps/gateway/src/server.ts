/**
 * server.ts — Express app factory del Gateway
 *
 * Exporta createApp() para ser usado tanto por el entry point (index.ts)
 * como por los tests de integración sin levantar el puerto.
 *
 * Rutas montadas:
 *   GET  /health                                — liveness probe
 *   GET  /static/*                              — archivos estáticos (widget JS)
 *   GET  /webchat-widget.js                     — shortcut al widget embeddable
 *   POST /gateway/telegram/:channelId           — Telegram webhook
 *   GET  /gateway/webchat/:channelId/stream     — SSE
 *   POST /gateway/webchat/:channelId/message    — inbound webchat
 *   GET  /gateway/webchat/:channelId/history    — historial de sesión
 *   POST /gateway/webchat/:channelId/session    — bootstrap sessionId
 *   POST /api/webchat/:channelId/reply          — reply interno (JWT)
 *   POST /api/channels                          — crear canal (JWT)
 *   GET  /api/channels                          — listar canales (JWT)
 *   GET  /api/channels/:id                      — detalle canal (JWT)
 *   PATCH /api/channels/:id                     — actualizar canal (JWT)
 *   DELETE /api/channels/:id                    — eliminar canal (JWT)
 *   POST /api/channels/:id/activate             — activar canal (JWT)
 *   POST /api/channels/:id/deactivate           — desactivar canal (JWT)
 *   POST /api/channels/:id/bindings             — agregar binding (JWT)
 *   DELETE /api/channels/:id/bindings/:bid      — eliminar binding (JWT)
 *
 * Seguridad:
 *   applySecurityMiddleware() aplica Helmet, CORS, rate limiting y JWT
 *   (ver apps/gateway/src/middleware/security.middleware.ts)
 */

import path                         from 'path';
import express, { type Application } from 'express';
import { PrismaClient }             from '@prisma/client';
import {
  registry,
  TelegramAdapter,
  WebChatAdapter,
}                                   from '@agent-vs/gateway-sdk';
import { applySecurityMiddleware }  from './middleware/security.middleware';
import { GatewayService }          from './gateway.service';
import { telegramRouter }          from './routes/telegram';
import { webchatGatewayRouter, webchatApiRouter } from './routes/webchat';
import { channelsApiRouter }       from './routes/channels';

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

export interface AppOptions {
  /** Override PrismaClient (útil en tests con mock DB) */
  db?: PrismaClient;
  /** CORS origins — default: CORS_ORIGINS env o '*' */
  corsOrigins?: string | string[];
  /** Require Logto JWT on /api/** routes */
  requireAuth?: boolean;
}

export function createApp(opts: AppOptions = {}): Application {
  const app = express();
  const db  = opts.db ?? new PrismaClient();

  // -------------------------------------------------------------------------
  // 1. Register channel adapters
  // -------------------------------------------------------------------------
  if (!registry.has('telegram')) registry.register(new TelegramAdapter());
  if (!registry.has('webchat'))  registry.register(new WebChatAdapter());

  // -------------------------------------------------------------------------
  // 2. Security middleware
  // -------------------------------------------------------------------------
  applySecurityMiddleware(app, {
    corsOrigins: opts.corsOrigins,
    requireAuth: opts.requireAuth ?? process.env.REQUIRE_AUTH === 'true',
    webhookRateLimit: 600,
    apiRateLimit: 120,
  });

  // -------------------------------------------------------------------------
  // 3. Body parsing
  // -------------------------------------------------------------------------
  app.use(express.json({ limit: '2mb' }));

  // -------------------------------------------------------------------------
  // 4. Static files (widget JS + future assets)
  // -------------------------------------------------------------------------
  const publicDir = path.join(__dirname, '..', 'public');
  app.use('/static', express.static(publicDir, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
  }));

  // Shortcut: GET /webchat-widget.js
  app.get('/webchat-widget.js', (_req, res) => {
    res.sendFile(path.join(publicDir, 'webchat-widget.js'));
  });

  // -------------------------------------------------------------------------
  // 5. GatewayService — instancia única compartida por todos los routers
  // -------------------------------------------------------------------------
  const gatewayService = new GatewayService(db);

  // -------------------------------------------------------------------------
  // 6. Routes
  // -------------------------------------------------------------------------

  // Liveness / readiness probe
  app.get('/health', (_req, res) => {
    res.json({
      ok:      true,
      service: 'gateway',
      ts:      new Date().toISOString(),
    });
  });

  // Telegram webhooks
  app.use('/gateway/telegram', telegramRouter(gatewayService));

  // WebChat SSE + inbound + history + session
  app.use('/gateway/webchat', webchatGatewayRouter(gatewayService));

  // WebChat internal reply (JWT)
  app.use('/api/webchat', webchatApiRouter(gatewayService));

  // Channels CRUD + activate/deactivate + bindings (JWT)
  app.use('/api/channels', channelsApiRouter(db, gatewayService));

  // -------------------------------------------------------------------------
  // 7. 404 fallthrough
  // -------------------------------------------------------------------------
  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Route not found' });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Entry point (solo cuando se ejecuta directamente)
// ---------------------------------------------------------------------------

if (require.main === module) {
  const PORT = Number(process.env.PORT ?? 3200);
  const app  = createApp();

  app.listen(PORT, () => {
    console.info(`[gateway] listening on port ${PORT}`);
  });
}
