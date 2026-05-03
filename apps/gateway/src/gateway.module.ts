/**
 * gateway.module.ts — [F3a-01 / F5-01 / F5-03]
 *
 * Módulo NestJS que agrupa los servicios centrales del Gateway:
 *
 *   - GatewayService            → dispatch, session, encryption, adapter lifecycle
 *   - AgentResolverService      → resolución de agente por ChannelBinding + scope priority
 *   - WhatsAppBaileysAdapter    → adapter WhatsApp via Baileys (F5-01)
 *   - SlackAdapter              → adapter Slack Events API con HMAC (F5-03)
 *   - HealthController          → GET /health (liveness probe)
 *   - PrismaModule              → re-exportado para que AppModule no duplique el import
 *
 * F5-01: WhatsAppBaileysAdapter registrado como provider y exportado.
 *        GatewayModule.onModuleInit() inyecta PrismaService en el singleton
 *        whatsappSessionStore para persistir credenciales en BD (D-22b).
 * F5-03: SlackAdapter registrado como provider y exportado.
 *        Inyecta PrismaService via DI (no más new PrismaService() directo).
 */

import { Module, OnModuleInit }      from '@nestjs/common';
import { GatewayService }            from './gateway.service.js';
import { AgentResolverService }      from './agent-resolver.service.js';
import { HealthController }          from './health/health.controller.js';
import { PrismaModule }              from './prisma/prisma.module.js';
import { PrismaService }             from './prisma/prisma.service.js';
import { WhatsAppBaileysAdapter }    from './channels/whatsapp-baileys.adapter.js';
import { SlackAdapter }              from './channels/slack.adapter.js';
import { setGlobalWhatsAppSessionStorePrisma } from './whatsapp-session.store.js';

@Module({
  imports:     [PrismaModule],
  providers:   [
    GatewayService,
    AgentResolverService,
    WhatsAppBaileysAdapter,
    SlackAdapter,
  ],
  controllers: [HealthController],
  exports:     [
    GatewayService,
    AgentResolverService,
    WhatsAppBaileysAdapter,
    SlackAdapter,
    PrismaModule,
  ],
})
export class GatewayModule implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inyecta PrismaService en el singleton global de WhatsAppSessionStore
   * para que la persistencia de credenciales Baileys use BD (D-22b).
   */
  onModuleInit(): void {
    setGlobalWhatsAppSessionStorePrisma(this.prisma);
  }
}
