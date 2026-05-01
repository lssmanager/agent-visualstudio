/**
 * server.ts — Gateway Express Application
 *
 * Monta todos los adaptadores de canal y expone:
 *   POST /gateway/webchat/:sessionId/message
 *   GET  /gateway/webchat/:sessionId/stream
 *   POST /gateway/telegram/webhook
 *   POST /gateway/telegram/setup
 *   GET  /gateway/whatsapp/webhook
 *   POST /gateway/whatsapp/webhook
 *   POST /gateway/discord/interactions
 *   POST /gateway/slack/events
 *
 * Inspirado en Flowise Server y n8n WebhookServer.
 */

import express, { type Application } from 'express';
import { getPrisma } from '../lib/prisma.js';
import { ChannelRegistry }  from './channel-registry.js';
import { TelegramAdapter }  from './channels/telegram.adapter.js';
import { WebChatAdapter }   from './channels/webchat.adapter.js';
import { WhatsAppAdapter }  from './channels/whatsapp.adapter.js';
import { DiscordAdapter }   from './channels/discord.adapter.js';
import { SlackAdapter }     from './channels/slack.adapter.js';
import { GatewayService }   from './gateway.service.js';
import { createChannelRouter } from './channel-router.js';

export interface AppOptions {
  /** Inject a pre-built registry (testing) */
  registry?: ChannelRegistry;
  /** Inject a PrismaClient mock (testing) */
  db?: ReturnType<typeof getPrisma>;
}

export function createApp(opts: AppOptions = {}): Application {
  const app      = express();
  const db       = opts.db ?? getPrisma();
  const registry = opts.registry ?? new ChannelRegistry();

  // -------------------------------------------------------------------------
  // 0. Core middleware
  // -------------------------------------------------------------------------
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // -------------------------------------------------------------------------
  // 1. Health check
  // -------------------------------------------------------------------------
  app.get('/healthz', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // -------------------------------------------------------------------------
  // 1. Register channel adapters
  //    WebChatAdapter requires PrismaClient for channelConfig lookups + SSE.
  //    Pass the shared `db` instance — same one used by GatewayService.
  // -------------------------------------------------------------------------
  if (!registry.has('telegram'))  registry.register(new TelegramAdapter());
  if (!registry.has('webchat'))   registry.register(new WebChatAdapter(db));
  if (!registry.has('whatsapp'))  registry.register(new WhatsAppAdapter());
  if (!registry.has('discord'))   registry.register(new DiscordAdapter());
  if (!registry.has('slack'))     registry.register(new SlackAdapter());

  // -------------------------------------------------------------------------
  // 2. Security middleware
  // -------------------------------------------------------------------------
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // -------------------------------------------------------------------------
  // 3. Gateway service + channel router
  // -------------------------------------------------------------------------
  const gatewayService  = new GatewayService({ db, registry });
  const channelRouter   = createChannelRouter({ registry, gatewayService });

  app.use('/gateway', channelRouter);

  // -------------------------------------------------------------------------
  // 4. 404 fallback
  // -------------------------------------------------------------------------
  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: 'Not found' });
  });

  return app;
}
