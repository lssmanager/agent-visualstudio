/**
 * server.ts — Express app factory del Gateway
 *
 * Exporta createApp() para ser usado tanto por el entry point (index.ts)
 * como por los tests de integración sin levantar el puerto.
 *
 * Rutas montadas:
 *   GET  /health                              — liveness probe
 *   POST /gateway/telegram/:channelId         — Telegram webhook
 *   GET  /gateway/webchat/:channelId/stream   — SSE
 *   POST /gateway/webchat/:channelId/message  — inbound webchat
 *   POST /api/webchat/:channelId/reply        — internal reply (JWT required)
 *
 * Seguridad:
 *   applySecurityMiddleware() aplica Helmet, CORS, rate limiting y JWT
 *   (ver apps/gateway/src/middleware/security.middleware.ts)
 */

import express, { type Application } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  registry,
  TelegramAdapter,
  WebChatAdapter,
} from '@agent-vs/gateway-sdk';
import { applySecurityMiddleware } from './middleware/security.middleware';
import { GatewayService } from './gateway.service';
import { telegramRouter } from './routes/telegram';
import { webchatGatewayRouter, webchatApiRouter } from './routes/webchat';

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

export interface AppOptions {
  /** Override PrismaClient (useful in tests with a mock/in-memory DB) */
  db?: PrismaClient;
  /** CORS origins — default: CORS_ORIGINS env or '*' */
  corsOrigins?: string | string[];
  /** Require Logto JWT on /api/** routes */
  requireAuth?: boolean;
}

export function createApp(opts: AppOptions = {}): Application {
  const app = express();
  const db  = opts.db ?? new PrismaClient();

  // -------------------------------------------------------------------------
  // 1. Register channel adapters into the gateway-sdk registry
  // -------------------------------------------------------------------------
  if (!registry.has('telegram')) registry.register(new TelegramAdapter());
  if (!registry.has('webchat'))  registry.register(new WebChatAdapter());

  // -------------------------------------------------------------------------
  // 2. Core middleware
  // -------------------------------------------------------------------------
  applySecurityMiddleware(app, {
    corsOrigins: opts.corsOrigins,
    requireAuth: opts.requireAuth ?? process.env.REQUIRE_AUTH === 'true',
    // Higher rate limit for webhook routes (Telegram can burst)
    webhookRateLimit: 600,
    apiRateLimit: 120,
  });

  // Parse JSON bodies (webhooks + API)
  app.use(express.json({ limit: '2mb' }));

  // -------------------------------------------------------------------------
  // 3. GatewayService — single instance shared by all routers
  // -------------------------------------------------------------------------
  const gatewayService = new GatewayService(db);

  // -------------------------------------------------------------------------
  // 4. Routes
  // -------------------------------------------------------------------------

  // Liveness / readiness probe
  app.get('/health', (_req, res) => {
    res.json({
      ok:      true,
      service: 'gateway',
      ts:      new Date().toISOString(),
    });
  });

  // Telegram webhooks — public, validated by optional secret token header
  app.use('/gateway/telegram', telegramRouter(gatewayService));

  // WebChat SSE + inbound — public (CORS + rate limit protect them)
  app.use('/gateway/webchat', webchatGatewayRouter(gatewayService));

  // WebChat internal reply — requires JWT
  app.use('/api/webchat', webchatApiRouter(gatewayService));

  // -------------------------------------------------------------------------
  // 5. 404 fallthrough
  // -------------------------------------------------------------------------
  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Route not found' });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Entry point (only when run directly)
// ---------------------------------------------------------------------------

if (require.main === module) {
  const PORT = Number(process.env.PORT ?? 3200);
  const app  = createApp();

  app.listen(PORT, () => {
    console.info(`[gateway] listening on port ${PORT}`);
  });
}
