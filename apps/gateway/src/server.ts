/**
 * server.ts — Express app factory del Gateway
 */

import path from 'path';
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
import { channelsApiRouter } from './routes/channels';
import { whatsappBaileysRouter } from './routes/whatsapp-baileys';

export interface AppOptions {
  db?: PrismaClient;
  corsOrigins?: string | string[];
  requireAuth?: boolean;
}

export function createApp(opts: AppOptions = {}): Application {
  const app = express();
  const db = opts.db ?? new PrismaClient();

  if (!registry.has('telegram')) registry.register(new TelegramAdapter());
  if (!registry.has('webchat')) registry.register(new WebChatAdapter());

  applySecurityMiddleware(app, {
    corsOrigins: opts.corsOrigins,
    requireAuth: opts.requireAuth ?? process.env.REQUIRE_AUTH === 'true',
    webhookRateLimit: 600,
    apiRateLimit: 120,
  });

  app.use(express.json({ limit: '2mb' }));

  const publicDir = path.join(__dirname, '..', 'public');
  app.use('/static', express.static(publicDir, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
  }));

  app.get('/webchat-widget.js', (_req, res) => {
    res.sendFile(path.join(publicDir, 'webchat-widget.js'));
  });

  const gatewayService = new GatewayService(db);

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'gateway', ts: new Date().toISOString() });
  });

  app.use('/gateway/telegram', telegramRouter(gatewayService));
  app.use('/gateway/webchat', webchatGatewayRouter(gatewayService));
  app.use('/api/webchat', webchatApiRouter(gatewayService));
  app.use('/api/channels', channelsApiRouter(db, gatewayService));
  app.use('/gateway/whatsapp', whatsappBaileysRouter(db));

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Route not found' });
  });

  return app;
}

if (require.main === module) {
  const PORT = Number(process.env.PORT ?? 3200);
  const app = createApp();

  app.listen(PORT, () => {
    console.info(`[gateway] listening on port ${PORT}`);
  });
}
