/**
 * gateway.module.ts — [F3a-01]
 *
 * Módulo NestJS que agrupa los servicios centrales del Gateway:
 *
 *   - GatewayService        → dispatch, session, encryption, adapter lifecycle
 *   - AgentResolverService  → resolución de agente por ChannelBinding + scope priority
 *   - HealthController      → GET /health (liveness probe — no inyecta GatewayService)
 *   - PrismaModule          → re-exportado para que AppModule no duplique el import
 *   - StatusStreamModule    → WebSocket gateway para streaming de estado de runs [F3a-09]
 *
 * ── Qué NO va aquí ──────────────────────────────────────────────────────────
 *
 *   MessageDispatcher  → clase pura (extends EventEmitter), NO @Injectable().
 *                        GatewayService la instancia internamente si la necesita.
 *
 *   loadCredentials /
 *   invalidateCredentialsCache → funciones sueltas en channel-credentials.loader.ts,
 *                                no son clases; los adapters las llaman directamente.
 *
 * ── Dependencias del grafo DI ───────────────────────────────────────────────
 *
 *   GatewayService       ← PrismaService (via PrismaModule) + AgentResolverService
 *   AgentResolverService ← PrismaService (via PrismaModule)
 *   HealthController     ← (ninguna inyección — responde ok estático)
 *   StatusStreamGateway  ← EventEmitter2 (via StatusStreamModule)
 *
 * ── Re-export de PrismaModule ────────────────────────────────────────────────
 *
 *   AppModule importa GatewayModule. Al re-exportar PrismaModule desde aquí,
 *   AppModule obtiene PrismaService transitivamente sin necesidad de importar
 *   PrismaModule por separado, evitando la duplicación de instancias y la
 *   dependencia circular latente que aparecería en F3a-02/F3a-03.
 *
 * ── forwardRef ───────────────────────────────────────────────────────────────
 *
 *   NO se usa forwardRef. AppModule importa GatewayModule (unidireccional).
 *   Si en fases futuras aparece una dependencia circular real, añadir forwardRef
 *   solo en ese momento y documentar el motivo.
 */

import { Module }               from '@nestjs/common';
import { GatewayService }       from './gateway.service';
import { AgentResolverService } from './agent-resolver.service';
import { HealthController }     from './health/health.controller';
import { PrismaModule }         from './prisma/prisma.module';
import { StatusStreamModule }   from './runs/status-stream.module';

@Module({
  imports:     [PrismaModule, StatusStreamModule],
  providers:   [GatewayService, AgentResolverService],
  controllers: [HealthController],
  exports:     [GatewayService, AgentResolverService, PrismaModule, StatusStreamModule],
})
export class GatewayModule {}
