import { Module }               from '@nestjs/common';
import { GatewayService }       from './gateway.service';
import { AgentResolverService } from './agent-resolver.service';
import { HealthController }     from './health/health.controller';
import { PrismaModule }         from './prisma/prisma.module';

/**
 * GatewayModule agrupa:
 *   - GatewayService (lógica de dispatch, session, encryption)
 *   - AgentResolverService (resolución de agente por ChannelBinding + scope priority)
 *   - HealthController (GET /health — liveness probe)
 */
@Module({
  imports:     [PrismaModule],
  providers:   [GatewayService, AgentResolverService],
  controllers: [HealthController],
  exports:     [GatewayService, AgentResolverService],
})
export class GatewayModule {}
